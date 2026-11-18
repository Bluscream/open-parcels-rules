/*
 * Named extractors: small pieces of code a mail rule can call by name for what a regex cannot
 * express. Keep this list short; every entry is documented in docs/mail-rules.md.
 */
import type { DetectHints, TrackingCandidate } from "../types.ts";

export interface ExtractorContext {
  readonly subject: string;
  readonly text: string;
  readonly senderDomain: string;
  /** Carrier already known from the rule or its extracted fields. */
  readonly carrier: string | undefined;
  readonly detect: (text: string, hints: DetectHints) => TrackingCandidate[];
}

export interface ExtractorOutput {
  readonly trackingNumbers?: readonly string[];
  readonly carrier?: string;
}

export type Extractor = (context: ExtractorContext) => ExtractorOutput;

/** Confidence a detected number needs inside a mail already known to be about shipping. */
const SHIPPING_MAIL_THRESHOLD = 0.5;

/**
 * detect_tracking_numbers: for shop mails whose carrier varies (marketplaces, shops shipping
 * with several carriers), run the checksum-aware format detector over the mail instead of a
 * loose regex. Adds the confident numbers and, when they agree, their carrier.
 */
const detectTrackingNumbers: Extractor = (context) => {
  const hints: DetectHints =
    context.carrier === undefined
      ? { senderDomain: context.senderDomain }
      : { senderDomain: context.senderDomain, carrier: context.carrier };
  const candidates = context
    .detect(`${context.subject}\n${context.text}`, hints)
    .filter((candidate) => candidate.confidence >= SHIPPING_MAIL_THRESHOLD);
  const best = new Map<string, TrackingCandidate>();
  for (const candidate of candidates) {
    if (!best.has(candidate.trackingNumber)) best.set(candidate.trackingNumber, candidate);
  }
  const chosen = [...best.values()];
  const carriers = new Set(chosen.map((candidate) => candidate.carrier));
  const [only] = carriers;
  return {
    trackingNumbers: chosen.map((candidate) => candidate.trackingNumber),
    ...(carriers.size === 1 && only !== undefined ? { carrier: only } : {}),
  };
};

export const EXTRACTORS: Readonly<Record<string, Extractor>> = {
  detect_tracking_numbers: detectTrackingNumbers,
};
