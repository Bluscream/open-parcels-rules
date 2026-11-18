import type { StatusEntry, StatusFile } from "./schema/status.ts";
import { compileDataRegex } from "./portability.ts";
import type { MappedStatus, RawStatus, ResolvedStatus } from "./types.ts";

export interface CompiledStatusTable {
  readonly carrier: string;
  readonly codes: ReadonlyMap<string, StatusEntry>;
  readonly foldedCodes: ReadonlyMap<string, StatusEntry>;
  readonly texts: readonly { readonly regex: RegExp; readonly entry: StatusEntry }[];
}

export function compileStatusTable(file: Omit<StatusFile, "tests">): CompiledStatusTable {
  const codes = new Map<string, StatusEntry>();
  const foldedCodes = new Map<string, StatusEntry>();
  const texts: { regex: RegExp; entry: StatusEntry }[] = [];
  for (const entry of file.entries) {
    if ("code" in entry.match) {
      const code = entry.match.code.trim();
      if (!codes.has(code)) codes.set(code, entry);
      if (!foldedCodes.has(code.toUpperCase())) foldedCodes.set(code.toUpperCase(), entry);
    } else {
      texts.push({ regex: compileDataRegex(entry.match.text, entry.match.flags), entry });
    }
  }
  return { carrier: file.carrier, codes, foldedCodes, texts };
}

function toMapped(entry: StatusEntry): MappedStatus {
  const confirmed = entry.confirmed ?? true;
  return entry.pickup === true
    ? { status: entry.status, pickup: true, confirmed }
    : { status: entry.status, confirmed };
}

export function mapWithTable(table: CompiledStatusTable, raw: RawStatus): MappedStatus | null {
  const code = raw.code?.trim();
  if (code !== undefined && code !== "") {
    const entry = table.codes.get(code) ?? table.foldedCodes.get(code.toUpperCase());
    if (entry !== undefined) return toMapped(entry);
  }
  const text = raw.text?.trim();
  if (text !== undefined && text !== "") {
    const hit = table.texts.find(({ regex }) => regex.test(text));
    if (hit !== undefined) return toMapped(hit.entry);
  }
  return null;
}

function rawLabel(raw: RawStatus): string | null {
  const code = raw.code?.trim();
  if (code !== undefined && code !== "") return code;
  const text = raw.text?.trim();
  return text !== undefined && text !== "" ? text : null;
}

/**
 * Maps the latest event; when it is unknown, falls back to the newest history entry that maps.
 * `history` is ordered newest first.
 */
export function resolveWithTable(
  table: CompiledStatusTable | undefined,
  latest: RawStatus,
  history: readonly RawStatus[],
): ResolvedStatus {
  const latestMapped = table === undefined ? null : mapWithTable(table, latest);
  if (latestMapped !== null && latestMapped.status !== "unknown") {
    return { status: latestMapped.status, source: "latest", unmapped: null };
  }
  // A value the table knows to carry no information (mapped to unknown) is not worth a warning.
  const unmapped = latestMapped === null ? rawLabel(latest) : null;
  if (table !== undefined) {
    for (const event of history) {
      const mapped = mapWithTable(table, event);
      if (mapped !== null) return { status: mapped.status, source: "history", unmapped };
    }
  }
  return { status: "unknown", source: "unknown", unmapped };
}
