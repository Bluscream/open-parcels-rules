import { parseWithGrammar } from "../arrival/parse.ts";
import { carrierForDomain, domainMatches, lookupCarrier } from "../carriers.ts";
import type { Rules } from "../rules.ts";
import { grammarFor } from "../rules.ts";
import type { MailField, MailSource } from "../schema/mail.ts";
import { detect } from "../tracking/detect.ts";
import { normalizeTrackingNumber } from "../tracking/validate.ts";
import type { ArrivalWindow, MailInput, MailParseResult } from "../types.ts";
import type { CompiledMailRule, CompiledPattern } from "./compile.ts";
import { EXTRACTORS } from "./extractors.ts";
import { htmlToText } from "./html.ts";
import { extractSchemaOrg } from "./schema-org.ts";

type Sources = Readonly<Record<MailSource, string>>;

interface Prepared {
  readonly address: string;
  readonly domain: string;
  readonly sources: Sources;
  readonly mail: MailInput;
}

/** Confidence a number found by the fallback needs; below it the mail is left alone. */
const FALLBACK_THRESHOLD = 0.6;
const TRAILING_URL_PUNCTUATION = /[.,;:!)\]>]+$/u;

export function senderAddress(from: string): string {
  const bracketed = /<([^<>\s]+@[^<>\s]+)>/u.exec(from)?.[1];
  const bare = /[^\s<>"]+@[^\s<>"]+/u.exec(from)?.[0];
  return (bracketed ?? bare ?? from).trim().toLowerCase();
}

function prepare(mail: MailInput): Prepared {
  const address = senderAddress(mail.from);
  const html = mail.html === undefined ? "" : htmlToText(mail.html);
  const text = mail.text ?? html;
  return {
    address,
    domain: address.slice(address.lastIndexOf("@") + 1),
    sources: { subject: mail.subject, text, html },
    mail,
  };
}

function senderMatches(rule: CompiledMailRule, prepared: Prepared): boolean {
  return (
    rule.addresses.has(prepared.address) ||
    rule.domains.some((domain) => domainMatches(prepared.domain, domain))
  );
}

function anyMatch(patterns: readonly CompiledPattern[], sources: Sources): boolean {
  return patterns.some((pattern) =>
    pattern.in.some((source) => pattern.regex.test(sources[source])),
  );
}

function collectField(rule: CompiledMailRule, field: MailField, sources: Sources): string[] {
  const values = (rule.extract.get(field) ?? []).flatMap((pattern) =>
    pattern.in.flatMap((source) =>
      Array.from(sources[source].matchAll(pattern.regex), (match) => match.groups?.[field]?.trim()),
    ),
  );
  return unique(values.filter((value): value is string => value !== undefined && value !== ""));
}

function arrivalFrom(
  rules: Rules,
  texts: readonly string[],
  mail: MailInput,
): ArrivalWindow | undefined {
  if (mail.date === undefined) return undefined;
  const grammar = grammarFor(rules);
  if (grammar === null) return undefined;
  for (const text of texts) {
    const window = parseWithGrammar(grammar, text, mail.date, mail.timeZone ?? "UTC");
    if (window !== null) return window;
  }
  return undefined;
}

function resolveCarrier(
  rules: Rules,
  rule: CompiledMailRule,
  sources: Sources,
): string | undefined {
  if (rule.carrier !== undefined) return rule.carrier;
  if (!rule.carrierFrom) return undefined;
  for (const name of collectField(rule, "carrier", sources)) {
    const carrier = lookupCarrier(rules.carriers, name);
    if (carrier !== undefined) return carrier.id;
  }
  return undefined;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

interface Draft {
  carrier: string | undefined;
  trackingNumbers: string[];
}

function runExtractors(
  rules: Rules,
  rule: CompiledMailRule,
  prepared: Prepared,
  draft: Draft,
): void {
  for (const name of rule.extractors) {
    const extractor = EXTRACTORS[name];
    if (extractor === undefined) continue;
    const output = extractor({
      subject: prepared.sources.subject,
      text: prepared.sources.text,
      senderDomain: prepared.domain,
      carrier: draft.carrier,
      detect: (text, hints) => detect(rules, text, hints),
    });
    draft.trackingNumbers = unique([...draft.trackingNumbers, ...(output.trackingNumbers ?? [])]);
    draft.carrier ??= output.carrier;
  }
}

function applyRule(
  rules: Rules,
  rule: CompiledMailRule,
  prepared: Prepared,
): MailParseResult | null {
  const { sources } = prepared;
  const draft: Draft = {
    carrier: resolveCarrier(rules, rule, sources),
    trackingNumbers: unique(
      collectField(rule, "tracking_number", sources).map(normalizeTrackingNumber),
    ),
  };
  runExtractors(rules, rule, prepared, draft);
  const orderNumbers = collectField(rule, "order_number", sources);
  const items = collectField(rule, "item", sources);
  const trackingUrl = collectField(rule, "tracking_url", sources)[0]?.replace(
    TRAILING_URL_PUNCTUATION,
    "",
  );
  const pickupCode = collectField(rule, "pickup_code", sources)[0];
  const arrival = arrivalFrom(rules, collectField(rule, "arrival", sources), prepared.mail);
  const status =
    rule.statusKeywords.find((group) => anyMatch(group.patterns, sources))?.status ??
    rule.defaultStatus;
  const event = rule.eventKeywords.find((group) => anyMatch(group.patterns, sources))?.event;
  const present: Record<MailField, boolean> = {
    tracking_number: draft.trackingNumbers.length > 0,
    order_number: orderNumbers.length > 0,
    tracking_url: trackingUrl !== undefined,
    pickup_code: pickupCode !== undefined,
    item: items.length > 0,
    arrival: arrival !== undefined,
    carrier: draft.carrier !== undefined,
  };
  if (!rule.require.every((field) => present[field])) return null;
  const anything =
    Object.values(present).some(Boolean) || status !== undefined || event !== undefined;
  if (!anything) return null;
  return {
    ruleId: rule.id,
    kind: rule.kind,
    trackingNumbers: draft.trackingNumbers,
    orderNumbers,
    ...(draft.carrier === undefined ? {} : { carrier: draft.carrier }),
    ...(status === undefined ? {} : { status }),
    ...(event === undefined ? {} : { event }),
    ...(arrival === undefined ? {} : { arrival }),
    ...(items.length === 0 ? {} : { items }),
    ...(trackingUrl === undefined ? {} : { trackingUrl }),
    ...(pickupCode === undefined ? {} : { pickupCode }),
  };
}

function schemaOrgResults(rules: Rules, prepared: Prepared): MailParseResult[] {
  return extractSchemaOrg(prepared.mail.html).map((delivery) => {
    const carrier =
      delivery.carrierName === undefined
        ? undefined
        : lookupCarrier(rules.carriers, delivery.carrierName)?.id;
    const arrival =
      delivery.expectedUntil === undefined
        ? undefined
        : arrivalFromIso(delivery.expectedFrom, delivery.expectedUntil);
    return {
      ruleId: "schema.org",
      kind: "parcel" as const,
      trackingNumbers: delivery.trackingNumbers.map(normalizeTrackingNumber),
      orderNumbers: delivery.orderNumbers,
      ...(carrier === undefined ? {} : { carrier }),
      ...(delivery.status === undefined ? {} : { status: delivery.status }),
      ...(arrival === undefined ? {} : { arrival }),
      ...(delivery.items.length === 0 ? {} : { items: delivery.items }),
      ...(delivery.trackingUrl === undefined ? {} : { trackingUrl: delivery.trackingUrl }),
    };
  });
}

function arrivalFromIso(from: string | undefined, until: string): ArrivalWindow | undefined {
  if (Number.isNaN(Date.parse(until))) return undefined;
  const start = from !== undefined && !Number.isNaN(Date.parse(from)) ? from : until;
  return { from: start, to: until, allDay: false, matched: `${start}/${until}` };
}

function fallback(rules: Rules, prepared: Prepared): MailParseResult[] {
  const { subject, text } = prepared.sources;
  const body = `${subject}\n${text}`;
  const fromCarrier = carrierForDomain(rules.carriers, prepared.domain);
  if (fromCarrier === undefined && !rules.trackingKeywords.test(body)) return [];
  const candidates = detect(rules, body, { senderDomain: prepared.domain }).filter(
    (candidate) => candidate.confidence >= FALLBACK_THRESHOLD,
  );
  if (candidates.length === 0) return [];
  const carriers = new Set(candidates.map((candidate) => candidate.carrier));
  const [only] = carriers;
  return [
    {
      ruleId: "fallback",
      kind: "parcel",
      trackingNumbers: unique(candidates.map((candidate) => candidate.trackingNumber)),
      orderNumbers: [],
      ...(carriers.size === 1 && only !== undefined ? { carrier: only } : {}),
    },
  ];
}

export function parseMailWith(rules: Rules, mail: MailInput): MailParseResult[] {
  const prepared = prepare(mail);
  const results: MailParseResult[] = [];
  for (const rule of rules.mailRules) {
    if (!senderMatches(rule, prepared)) continue;
    if (rule.exclude.some((regex) => regex.test(prepared.sources.subject))) continue;
    if (
      rule.subject !== null &&
      !rule.subject.some((regex) => regex.test(prepared.sources.subject))
    ) {
      continue;
    }
    const result = applyRule(rules, rule, prepared);
    if (result !== null) results.push(result);
  }
  results.push(...schemaOrgResults(rules, prepared));
  return results.length > 0 ? results : fallback(rules, prepared);
}
