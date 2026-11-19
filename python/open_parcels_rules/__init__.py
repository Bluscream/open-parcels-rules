"""Reference loader for the open-parcels-rules bundle, standard library only.

Reads dist/bundle.json (as built by `npm run build`) and offers tracking-number validation and
detection plus status mapping. It is a small port that proves the data is language neutral;
the TypeScript engine stays the complete implementation (arrival dates and mail rules are not
ported here).

Data regexes use `(?<name>...)` for named groups, which Python spells `(?P<name>...)`; the
loader rewrites that one construct and otherwise compiles the patterns as they are.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

__all__ = [
    "Rules",
    "load_rules",
    "validate_tracking_number",
    "detect_tracking_numbers",
    "map_status",
    "ignored_status",
]

DEFAULT_BUNDLE = Path(__file__).resolve().parents[2] / "dist" / "bundle.json"
_NAMED_GROUP = re.compile(r"\(\?<(?=[A-Za-z_])")
_BASE36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"


# What the TypeScript engine's `u`-flag regexes mean by each class escape. Python's defaults are
# Unicode-wide (\d matches Arabic-Indic digits, \w accented letters), and re.ASCII narrows \s to
# ASCII whitespace while JavaScript's \s also covers NBSP and the other Unicode spaces. Spelling
# the classes out gives both engines one meaning whatever the flags.
_JS_SPACE = "\\t\\n\\v\\f\\r \\u00a0\\u1680\\u2000-\\u200a\\u2028\\u2029\\u202f\\u205f\\u3000\\ufeff"
_WORD = "A-Za-z0-9_"
_IN_CLASS = {"d": "0-9", "w": _WORD, "s": _JS_SPACE}
_OUTSIDE = {
    "d": "[0-9]",
    "D": "[^0-9]",
    "w": f"[{_WORD}]",
    "W": f"[^{_WORD}]",
    "s": f"[{_JS_SPACE}]",
    "S": f"[^{_JS_SPACE}]",
    "b": f"(?:(?<=[{_WORD}])(?![{_WORD}])|(?<![{_WORD}])(?=[{_WORD}]))",
    "B": f"(?:(?<=[{_WORD}])(?=[{_WORD}])|(?<![{_WORD}])(?![{_WORD}]))",
}


def _spell_out_classes(pattern: str) -> str:
    out: list[str] = []
    index = 0
    in_class = False
    while index < len(pattern):
        char = pattern[index]
        if char == "\\" and index + 1 < len(pattern):
            escape = pattern[index + 1]
            if in_class and escape in _IN_CLASS:
                out.append(_IN_CLASS[escape])
            elif not in_class and escape in _OUTSIDE:
                out.append(_OUTSIDE[escape])
            else:
                # \D, \W and \S inside a class are outside the portable subset's use; kept as is.
                out.append(pattern[index : index + 2])
            index += 2
            continue
        if in_class and char == "]":
            in_class = False
        elif not in_class and char == "[":
            in_class = True
            if pattern[index + 1 : index + 2] == "]":
                out.append("[]")
                index += 2
                continue
        out.append(char)
        index += 1
    return "".join(out)


def to_python_regex(pattern: str) -> str:
    """Rewrites a portable pattern for Python's re: named groups, and class escapes as JS reads them."""
    return _spell_out_classes(_NAMED_GROUP.sub("(?P<", pattern))


def _flags(names: list[str] | None) -> int:
    """re flags for a data pattern. re.ASCII unless case is ignored: JavaScript's `iu` folds
    non-ASCII letters (Ä/ä), and so must Python, which re.ASCII would stop."""
    table = {"i": re.IGNORECASE, "m": re.MULTILINE, "s": re.DOTALL}
    result = 0
    for name in names or []:
        result |= table[name]
    return result if result & re.IGNORECASE else result | re.ASCII


def _digit(char: str) -> int:
    return int(char) if char.isdigit() else (ord(char) - 3) % 10


def _mod10(spec: dict[str, Any], serial: str, check: str) -> bool:
    chars = serial[::-1] if spec.get("reverse") else serial
    total = 0
    for index, char in enumerate(chars):
        value = _digit(char)
        if spec.get("odds_multiplier") is not None and index % 2 == 1:
            value *= spec["odds_multiplier"]
        elif spec.get("evens_multiplier") is not None and index % 2 == 0:
            value *= spec["evens_multiplier"]
        total += value
    modulo = spec.get("modulo", 10)
    return str((modulo - total % modulo) % modulo) == check


def _mod7(spec: dict[str, Any], serial: str, check: str) -> bool:
    return str(int(serial) % spec.get("modulo", 7)) == check


def _s10(spec: dict[str, Any], serial: str, check: str) -> bool:
    weights = spec.get("weightings", [8, 6, 4, 2, 3, 5, 9, 7])
    modulo = spec.get("modulo", 11)
    remainder = sum(_digit(c) * w for c, w in zip(serial, weights)) % modulo
    expected = 5 if remainder == 0 else 0 if remainder == 1 else modulo - remainder
    return str(expected) == check


def _luhn(_spec: dict[str, Any], serial: str, check: str) -> bool:
    total = 0
    for index, char in enumerate(reversed(serial)):
        value = _digit(char)
        if index % 2 == 0:
            value *= 2
            if value > 9:
                value -= 9
        total += value
    return str((10 - total % 10) % 10) == check


def _mod_37_36(spec: dict[str, Any], serial: str, check: str) -> bool:
    alphabet = spec.get("alphabet", _BASE36)
    modulo = spec.get("modulo", 36)
    product = modulo
    for char in serial:
        value = alphabet.find(char)
        if value < 0:
            return False
        total = (product + value) % modulo or modulo
        product = (total * 2) % (modulo + 1)
    return alphabet[(modulo + 1 - product) % modulo] == check


def _sum_product(spec: dict[str, Any], serial: str, check: str) -> bool:
    total = sum(_digit(c) * w for c, w in zip(serial, spec["weightings"]))
    return str(total % spec["modulo1"] % spec["modulo2"]) == check


_CHECKSUMS = {
    "mod10": _mod10,
    "mod7": _mod7,
    "s10": _s10,
    "luhn": _luhn,
    "mod_37_36": _mod_37_36,
    "sum_product_with_weightings_and_modulo": _sum_product,
}


@dataclass
class TrackingType:
    courier_code: str
    id: str
    name: str
    spec: dict[str, Any]
    exact: re.Pattern[str]
    search: re.Pattern[str]


@dataclass
class Rules:
    version: str
    types: list[TrackingType]
    courier_carriers: dict[str, str]
    upu_carriers: dict[str, str]
    carrier_names: dict[str, str]
    status: dict[str, dict[str, Any]] = field(default_factory=dict)


def _slug(text: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", text.lower()).strip("_")


def _normalize_name(name: str) -> str:
    return re.sub(r"[\W_]+", "", name.lower())


def load_rules(path: str | Path = DEFAULT_BUNDLE) -> Rules:
    bundle = json.loads(Path(path).read_text(encoding="utf-8"))
    types = []
    for source in bundle["tracking"]:
        courier = source["courier"]
        for spec in courier["tracking_numbers"]:
            raw = spec["regex"]
            pattern = to_python_regex("".join(raw) if isinstance(raw, list) else raw)
            types.append(
                TrackingType(
                    courier_code=courier["courier_code"],
                    id=spec.get("id") or f"{courier['courier_code']}_{_slug(spec['name'])}",
                    name=spec["name"],
                    spec=spec,
                    exact=re.compile(f"(?:{pattern})", re.ASCII),
                    search=re.compile(f"(?<![A-Za-z0-9])(?:{pattern})(?![A-Za-z0-9])", re.ASCII),
                )
            )
    courier_carriers: dict[str, str] = {}
    upu_carriers: dict[str, str] = {}
    carrier_names: dict[str, str] = {}
    for carrier in bundle["carriers"]:
        for code in [carrier["id"], *carrier.get("courier_codes", [])]:
            courier_carriers[code] = carrier["id"]
        for country in carrier.get("upu_countries", []):
            upu_carriers[country] = carrier["id"]
        for name in [carrier["id"], carrier["name"], *carrier.get("aliases", [])]:
            carrier_names.setdefault(_normalize_name(name), carrier["id"])
    status = {
        table["carrier"]: {
            "entries": _compile_matcher(table["entries"]),
            "ignore": _compile_matcher(table.get("ignore", [])),
        }
        for table in bundle["status"]
    }
    return Rules(bundle["version"], types, courier_carriers, upu_carriers, carrier_names, status)


def _compile_matcher(entries: list[dict[str, Any]]) -> dict[str, Any]:
    codes: dict[str, dict[str, Any]] = {}
    prefixes = []
    fields = []
    texts = []
    for entry in entries:
        match = entry["match"]
        if "code" in match:
            codes.setdefault(match["code"].strip(), entry)
        elif "code_prefix" in match:
            prefixes.append((match["code_prefix"].strip().upper(), entry))
        elif "text" in match:
            regex = re.compile(to_python_regex(match["text"]), _flags(match.get("flags")))
            texts.append((regex, _field_pairs(match.get("fields")), entry))
        else:
            fields.append((_field_pairs(match["fields"]), entry))
    return {"codes": codes, "prefixes": prefixes, "fields": fields, "texts": texts}


def _field_pairs(fields: dict[str, str] | None) -> dict[str, str]:
    return {k: v.strip() for k, v in (fields or {}).items()}


def _fields_hold(wanted: dict[str, str], given: dict[str, str] | None) -> bool:
    return all(given is not None and name in given and given[name].strip() == value for name, value in wanted.items())


def _find_entry(
    matcher: dict[str, Any], code: str | None, text: str | None, fields: dict[str, str] | None
) -> dict[str, Any] | None:
    """Field entries, then the exact code (as written, then ignoring case), prefixes, texts."""
    if fields is not None:
        for wanted, entry in matcher["fields"]:
            if _fields_hold(wanted, fields):
                return entry
    if code and code.strip():
        stripped = code.strip()
        folded = stripped.upper()
        entry = (
            matcher["codes"].get(stripped)
            or next((e for c, e in matcher["codes"].items() if c.upper() == folded), None)
            or next((e for prefix, e in matcher["prefixes"] if folded.startswith(prefix)), None)
        )
        if entry is not None:
            return entry
    if text and text.strip():
        return next(
            (e for regex, wanted, e in matcher["texts"] if regex.search(text.strip()) and _fields_hold(wanted, fields)),
            None,
        )
    return None


def _strip(value: str | None) -> str | None:
    return None if value is None else re.sub(r"\s+", "", value)


def _check_type(kind: TrackingType, number: str) -> dict[str, Any] | None:
    match = kind.exact.fullmatch(number)
    if match is None:
        return None
    groups = {name: _strip(value) for name, value in match.groupdict().items() if value is not None}
    validation = kind.spec.get("validation", {})
    checksum = validation.get("checksum")
    checksum_valid = None
    if checksum is not None:
        serial, check = groups.get("SerialNumber"), groups.get("CheckDigit")
        prepend = validation.get("serial_number_format", {}).get("prepend_if")
        if serial is not None and prepend and re.search(to_python_regex(prepend["matches_regex"]), serial, re.ASCII):
            serial = prepend["content"] + serial
        checksum_valid = (
            serial is not None and check is not None and _CHECKSUMS[checksum["name"]](checksum, serial, check)
        )
    lookups_ok = True
    for name in validation.get("additional", {}).get("exists", []):
        additional = next((a for a in kind.spec.get("additional", []) if a["name"] == name), None)
        value = groups.get(additional["regex_group_name"]) if additional else None
        lookups_ok = lookups_ok and value is not None and any(
            row.get("matches") == value
            or (row.get("matches_regex") and re.fullmatch(to_python_regex(row["matches_regex"]), value, re.ASCII))
            for row in additional["lookup"]
        )
    return {
        "type": kind.id,
        "groups": groups,
        "checksum_valid": checksum_valid,
        "valid": checksum_valid is not False and lookups_ok,
    }


def _carrier(rules: Rules, kind: TrackingType, groups: dict[str, str]) -> str:
    if kind.courier_code == "s10":
        return rules.upu_carriers.get(groups.get("CountryCode", ""), "upu")
    return rules.courier_carriers.get(kind.courier_code, kind.courier_code)


def validate_tracking_number(rules: Rules, number: str, type_id: str) -> dict[str, Any] | None:
    """Checks one number against one format; None when the format does not fit at all."""
    normalized = re.sub(r"\s+", "", number).upper()
    kind = next(t for t in rules.types if t.id == type_id)
    return _check_type(kind, normalized)


def detect_tracking_numbers(rules: Rules, text: str) -> list[dict[str, Any]]:
    """Every valid number in the text with its carrier and format ids (no confidence model)."""
    found: dict[tuple[str, str], dict[str, Any]] = {}
    for line in text.splitlines():
        for kind in rules.types:
            for match in kind.search.finditer(line):
                number = re.sub(r"\s+", "", match.group(0)).upper()
                result = _check_type(kind, number)
                if result is None or not result["valid"]:
                    continue
                carrier = _carrier(rules, kind, result["groups"])
                entry = found.setdefault(
                    (carrier, number),
                    {"carrier": carrier, "tracking_number": number, "types": [], "checksum_valid": None},
                )
                entry["types"].append(kind.id)
                if entry["checksum_valid"] is not True:
                    entry["checksum_valid"] = result["checksum_valid"]
    return list(found.values())


def map_status(
    rules: Rules,
    carrier: str,
    code: str | None = None,
    text: str | None = None,
    fields: dict[str, str] | None = None,
) -> dict[str, Any] | None:
    """A carrier's raw status code, text or named fields as {status, pickup?, confirmed}, or None."""
    table = _table(rules, carrier)
    entry = None if table is None else _find_entry(table["entries"], code, text, fields)
    if entry is None:
        return None
    result = {"status": entry["status"], "confirmed": entry.get("confirmed", True)}
    if entry.get("pickup"):
        result["pickup"] = True
    for name in ("stage", "label"):
        if name in entry:
            result[name] = entry[name]
    return result


def ignored_status(
    rules: Rules,
    carrier: str,
    code: str | None = None,
    text: str | None = None,
    fields: dict[str, str] | None = None,
) -> str | None:
    """The event an `ignore` entry gives a raw value (e.g. order_cancelled), or None."""
    table = _table(rules, carrier)
    entry = None if table is None else _find_entry(table["ignore"], code, text, fields)
    return None if entry is None else entry["event"]


def _table(rules: Rules, carrier: str) -> dict[str, Any] | None:
    return rules.status.get(rules.carrier_names.get(_normalize_name(carrier), carrier))
