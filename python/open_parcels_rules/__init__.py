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

__all__ = ["Rules", "load_rules", "validate_tracking_number", "detect_tracking_numbers", "map_status"]

DEFAULT_BUNDLE = Path(__file__).resolve().parents[2] / "dist" / "bundle.json"
_NAMED_GROUP = re.compile(r"\(\?<(?=[A-Za-z_])")
_BASE36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ"


def to_python_regex(pattern: str) -> str:
    """Rewrites the portable named-group syntax for Python's re module."""
    return _NAMED_GROUP.sub("(?P<", pattern)


def _flags(names: list[str] | None) -> int:
    table = {"i": re.IGNORECASE, "m": re.MULTILINE, "s": re.DOTALL}
    result = 0
    for name in names or []:
        result |= table[name]
    return result


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
                    exact=re.compile(f"(?:{pattern})"),
                    search=re.compile(f"(?<![A-Za-z0-9])(?:{pattern})(?![A-Za-z0-9])"),
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
    status = {}
    for table in bundle["status"]:
        codes: dict[str, dict[str, Any]] = {}
        texts = []
        for entry in table["entries"]:
            match = entry["match"]
            if "code" in match:
                codes.setdefault(match["code"].strip(), entry)
            else:
                texts.append((re.compile(to_python_regex(match["text"]), _flags(match.get("flags"))), entry))
        status[table["carrier"]] = {"codes": codes, "texts": texts}
    return Rules(bundle["version"], types, courier_carriers, upu_carriers, carrier_names, status)


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
        if serial is not None and prepend and re.search(prepend["matches_regex"], serial):
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
            or (row.get("matches_regex") and re.fullmatch(row["matches_regex"], value))
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


def map_status(rules: Rules, carrier: str, code: str | None = None, text: str | None = None) -> dict[str, Any] | None:
    """A carrier's raw status code or text as {status, pickup?, confirmed}, or None."""
    carrier_id = rules.carrier_names.get(_normalize_name(carrier), carrier)
    table = rules.status.get(carrier_id)
    if table is None:
        return None
    entry = None
    if code and code.strip():
        stripped = code.strip()
        entry = table["codes"].get(stripped) or next(
            (e for c, e in table["codes"].items() if c.upper() == stripped.upper()), None
        )
    if entry is None and text and text.strip():
        entry = next((e for regex, e in table["texts"] if regex.search(text.strip())), None)
    if entry is None:
        return None
    result = {"status": entry["status"], "confirmed": entry.get("confirmed", True)}
    if entry.get("pickup"):
        result["pickup"] = True
    return result
