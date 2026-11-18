import { verifyChecksum } from "./checksums.ts";
import type { CompiledTrackingType } from "./compile.ts";

export interface TypeMatch {
  readonly type: CompiledTrackingType;
  readonly trackingNumber: string;
  /** null: the format has no check digit. */
  readonly checksumValid: boolean | null;
  /** Format, checksum and required lookups all pass. */
  readonly valid: boolean;
  /** additional-lookup name to the matching row. */
  readonly lookups: ReadonlyMap<string, Readonly<Record<string, string | null>>>;
  /** Named groups of the match, whitespace removed. */
  readonly groups: Readonly<Record<string, string>>;
}

export function normalizeTrackingNumber(raw: string): string {
  return raw.replace(/\s+/gu, "").toUpperCase();
}

function strip(value: string | undefined): string | undefined {
  return value?.replace(/\s+/gu, "");
}

function checksumResult(
  type: CompiledTrackingType,
  groups: Readonly<Record<string, string | undefined>>,
): boolean | null {
  const checksum = type.spec.validation.checksum;
  if (checksum === undefined) return null;
  let serial = strip(groups["SerialNumber"]);
  const check = strip(groups["CheckDigit"]);
  if (serial === undefined || check === undefined) return false;
  if (type.prependIf?.test.test(serial) === true) serial = type.prependIf.content + serial;
  return verifyChecksum(checksum, serial, check);
}

function lookupRows(
  type: CompiledTrackingType,
  groups: Readonly<Record<string, string | undefined>>,
): Map<string, Readonly<Record<string, string | null>>> {
  const found = new Map<string, Readonly<Record<string, string | null>>>();
  for (const lookup of type.lookups) {
    const value = strip(groups[lookup.group]);
    if (value === undefined) continue;
    const hit = lookup.rows.find((row) => row.test(value));
    if (hit !== undefined) found.set(lookup.name, hit.row);
  }
  return found;
}

/** Matches one already-isolated number against one format. null when the format does not fit. */
export function matchType(type: CompiledTrackingType, raw: string): TypeMatch | null {
  const trackingNumber = normalizeTrackingNumber(raw);
  const match = type.exact.exec(trackingNumber);
  if (match === null) return null;
  // Groups that took no part in the match are undefined at runtime, whatever the lib types say.
  const groups: Readonly<Record<string, string | undefined>> = match.groups ?? {};
  const checksumValid = checksumResult(type, groups);
  const lookups = lookupRows(type, groups);
  const required = type.spec.validation.additional?.exists ?? [];
  const lookupsPass = required.every((name) => lookups.has(name));
  const stripped: Record<string, string> = {};
  for (const [name, value] of Object.entries(groups)) {
    if (value !== undefined) stripped[name] = value.replace(/\s+/gu, "");
  }
  return {
    type,
    trackingNumber,
    checksumValid,
    valid: checksumValid !== false && lookupsPass,
    lookups,
    groups: stripped,
  };
}
