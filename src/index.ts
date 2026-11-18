import { parseWithGrammar } from "./arrival/parse.ts";
import { buildTrackingUrl, lookupCarrier } from "./carriers.ts";
import { parseMailWith } from "./mail/parse.ts";
import type { Rules } from "./rules.ts";
import { grammarFor } from "./rules.ts";
import { mapWithTable, resolveWithTable } from "./status.ts";
import { detect } from "./tracking/detect.ts";
import type {
  ArrivalOptions,
  ArrivalWindow,
  CarrierInfo,
  DetectHints,
  MailInput,
  MailParseResult,
  MappedStatus,
  RawStatus,
  ResolvedStatus,
  TrackingCandidate,
} from "./types.ts";

export { loadRules } from "./load.ts";
export { rulesFromBundle } from "./rules.ts";
export { portabilityProblems } from "./portability.ts";
export { PARCEL_STATUSES } from "./schema/common.ts";
export type { Rules } from "./rules.ts";
export type * from "./types.ts";

/** Every carrier in the registry. */
export function carriers(rules: Rules): CarrierInfo[] {
  return [...rules.carriers.list];
}

/** A carrier by id, name or alias; case, accents and punctuation are ignored. */
export function findCarrier(rules: Rules, nameOrAlias: string): CarrierInfo | undefined {
  return lookupCarrier(rules.carriers, nameOrAlias);
}

/** The carrier's tracking page for a number, in the locale's language where one is listed. */
export function trackingUrl(
  rules: Rules,
  carrierId: string,
  trackingNumber: string,
  locale?: string,
): string | undefined {
  const carrier = lookupCarrier(rules.carriers, carrierId);
  return carrier === undefined ? undefined : buildTrackingUrl(carrier, trackingNumber, locale);
}

/**
 * Tracking numbers in free text, every plausible carrier per number, best first. Hints raise
 * the confidence of matching carriers and lower the others'.
 */
export function detectTrackingNumbers(
  rules: Rules,
  text: string,
  hints?: DetectHints,
): TrackingCandidate[] {
  return detect(rules, text, hints);
}

/** A carrier's raw status code or text as a canonical status; null when the table lacks it. */
export function mapStatus(rules: Rules, carrier: string, raw: RawStatus): MappedStatus | null {
  const id = lookupCarrier(rules.carriers, carrier)?.id ?? carrier;
  const table = rules.statusTables.get(id);
  return table === undefined ? null : mapWithTable(table, raw);
}

/**
 * The status of a parcel: the latest event if it maps, else the newest mapping history entry
 * (history is ordered newest first), else unknown. `unmapped` names the latest raw value when
 * it did not map, so callers can warn about it once.
 */
export function resolveStatus(
  rules: Rules,
  carrier: string,
  latest: RawStatus,
  history: readonly RawStatus[],
): ResolvedStatus {
  const id = lookupCarrier(rules.carriers, carrier)?.id ?? carrier;
  return resolveWithTable(rules.statusTables.get(id), latest, history);
}

/** A delivery date or window in text such as "Arriving 3 - 5 December" or "heute 17h - 19h". */
export function parseArrival(
  rules: Rules,
  text: string,
  options: ArrivalOptions,
): ArrivalWindow | null {
  const grammar = grammarFor(rules, options.locales);
  return grammar === null ? null : parseWithGrammar(grammar, text, options.now, options.timeZone);
}

/** Every rule result for a mail; a format-detection fallback when no rule applies. */
export function parseMail(rules: Rules, mail: MailInput): MailParseResult[] {
  return parseMailWith(rules, mail);
}
