import type { ArrivalWindow } from "../types.ts";
import type { Grammar } from "./grammar.ts";
import type { CivilDate } from "./zoned.ts";
import {
  addDays,
  compareDates,
  formatZoned,
  isValidDate,
  todayIn,
  weekdayOf,
  zonedInstant,
} from "./zoned.ts";

type Groups = Readonly<Record<string, string | undefined>>;

interface Span {
  readonly index: number;
  readonly end: number;
}

interface DayHit extends Span {
  readonly from: CivilDate;
  readonly to: CivilDate;
}

interface TimeHit extends Span {
  /** Minutes after midnight of the first day. */
  readonly start: number;
  /** Minutes after midnight of the last day. */
  readonly stop: number;
}

const INVALID = "invalid";
type Invalid = typeof INVALID;

function fullYear(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const year = Number(raw);
  return raw.length === 2 ? 2000 + year : year;
}

function monthOf(grammar: Grammar, word: string | undefined, number: string | undefined): number {
  if (word !== undefined) return grammar.months.get(word.replace(/\s+/gu, " ")) ?? 0;
  return number === undefined ? 0 : Number(number);
}

/** A date without a year is this year's, unless that is before yesterday: then next year's. */
function resolveStart(month: number, day: number, year: number | undefined, today: CivilDate) {
  if (year !== undefined) return isValidDate(year, month, day) ? { year, month, day } : null;
  const candidate = { year: today.year, month, day };
  const yesterday = addDays(today, -1);
  const resolved =
    isValidDate(candidate.year, month, day) && compareDates(candidate, yesterday) >= 0
      ? candidate
      : { year: today.year + 1, month, day };
  return isValidDate(resolved.year, month, day) ? resolved : null;
}

function resolveExplicit(grammar: Grammar, groups: Groups, today: CivilDate) {
  const month = monthOf(grammar, groups["m1"], groups["n1"]);
  const from = resolveStart(month, Number(groups["d1"]), fullYear(groups["y1"]), today);
  if (from === null) return INVALID;
  if (groups["d2"] === undefined) return { from, to: from };
  const month2 =
    groups["m2"] !== undefined || groups["n2"] !== undefined
      ? monthOf(grammar, groups["m2"], groups["n2"])
      : month;
  const explicitYear = fullYear(groups["y2"]);
  const day2 = Number(groups["d2"]);
  let to: CivilDate = { year: explicitYear ?? from.year, month: month2, day: day2 };
  if (explicitYear === undefined && compareDates(to, from) < 0) to = { ...to, year: to.year + 1 };
  if (!isValidDate(to.year, to.month, to.day) || compareDates(to, from) < 0) return INVALID;
  return { from, to };
}

/** The earliest date in the text; at one position the longest shape (a range) wins. */
function firstDateShape(grammar: Grammar, text: string): RegExpExecArray | null {
  let best: RegExpExecArray | null = null;
  for (const shape of grammar.dates) {
    const match = shape.exec(text);
    if (match === null) continue;
    const better =
      best === null ||
      match.index < best.index ||
      (match.index === best.index && match[0].length > best[0].length);
    if (better) best = match;
  }
  return best;
}

function dayFromWord(grammar: Grammar, groups: Groups, today: CivilDate): CivilDate | null {
  const rel = groups["rel"];
  if (rel !== undefined) {
    const offset = grammar.relative.get(rel);
    return offset === undefined ? null : addDays(today, offset);
  }
  const weekday = groups["wd"]?.replace(/\.$/u, "");
  const index = weekday === undefined ? undefined : grammar.weekdays.get(weekday);
  if (index === undefined) return null;
  return addDays(today, (index - weekdayOf(today) + 7) % 7);
}

function wordDay(grammar: Grammar, match: RegExpExecArray | null, today: CivilDate): DayHit | null {
  if (match === null) return null;
  const day = dayFromWord(grammar, match.groups ?? {}, today);
  return day === null
    ? null
    : { from: day, to: day, index: match.index, end: match.index + match[0].length };
}

function findDay(
  grammar: Grammar,
  text: string,
  today: CivilDate,
  time: TimeHit | null,
): DayHit | Invalid | null {
  const explicit = firstDateShape(grammar, text);
  if (explicit !== null) {
    const match = explicit;
    const range = resolveExplicit(grammar, match.groups ?? {}, today);
    if (range === INVALID) return INVALID;
    return { ...range, index: match.index, end: match.index + match[0].length };
  }
  const announced =
    wordDay(grammar, grammar.relativeAfterLeadIn.exec(text), today) ??
    wordDay(grammar, grammar.weekdayAfterLeadIn.exec(text), today);
  if (announced !== null || time === null) return announced;
  const before = grammar.dayBeforeTime.exec(text.slice(0, time.index));
  if (before !== null) return wordDay(grammar, before, today);
  const after = grammar.dayAfterTime.exec(text.slice(time.end));
  if (after === null) return null;
  const hit = wordDay(grammar, after, today);
  return hit === null ? null : { ...hit, index: hit.index + time.end, end: hit.end + time.end };
}

interface Clock {
  readonly hour: number;
  readonly minute: number;
  /** "am", "pm" or null when the token has no marker. */
  readonly half: "am" | "pm" | null;
  readonly marked: boolean;
}

function clock(grammar: Grammar, groups: Groups, n: number): Clock | null {
  const hour = Number(groups[`h${n}`]);
  const minute = Number(groups[`m${n}`] ?? groups[`l${n}`] ?? 0);
  const marker = groups[`a${n}`]?.replace(/\s+/gu, "");
  const half = marker === undefined ? null : grammar.am.has(marker) ? "am" : "pm";
  if (minute > 59 || hour > 24 || (half !== null && (hour > 12 || hour === 0))) return null;
  const marked = half !== null || groups[`c${n}`] !== undefined || groups[`k${n}`] !== undefined;
  return { hour, minute, half, marked };
}

function toMinutes(time: Clock, half: "am" | "pm" | null): number {
  let hour = time.hour;
  if (half === "pm" && hour < 12) hour += 12;
  if (half === "am" && hour === 12) hour = 0;
  return hour * 60 + time.minute;
}

/** "2 - 4:30 pm": a marker on one end only also applies to the other, if that keeps the order. */
function windowMinutes(first: Clock, second: Clock): [number, number] {
  const start = toMinutes(first, first.half ?? second.half);
  const stop = toMinutes(second, second.half ?? first.half);
  if (start < stop || first.half !== null || second.half === null) return [start, stop];
  return [toMinutes(first, second.half === "pm" ? "am" : "pm"), stop];
}

function findWindow(grammar: Grammar, text: string): TimeHit | Invalid | null {
  const match = grammar.window.exec(text);
  if (match === null) return null;
  const groups = match.groups ?? {};
  const end = match.index + match[0].length;
  const marked = ["c1", "k1", "a1", "c2", "k2", "a2", "u", "u2"].some(
    (name) => groups[name] !== undefined,
  );
  // "3 - 5 December" is a date range, and "3 - 5" alone is not a time.
  if (!marked || grammar.monthAhead.test(text.slice(end))) return null;
  const first = clock(grammar, groups, 1);
  const second = clock(grammar, groups, 2);
  if (first === null || second === null) return INVALID;
  const [start, stop] = windowMinutes(first, second);
  if (stop <= start) return INVALID;
  return { start, stop, index: match.index, end };
}

function findSingleTime(grammar: Grammar, text: string, kind: "deadline" | "point") {
  const match = grammar[kind].exec(text);
  if (match === null) return null;
  const groups = match.groups ?? {};
  const time = clock(grammar, groups, 1);
  if (time === null || !(time.marked || groups["u"] !== undefined)) return null;
  const minutes = toMinutes(time, time.half);
  return {
    start: kind === "deadline" ? 0 : minutes,
    stop: minutes,
    index: match.index,
    end: match.index + match[0].length,
  };
}

function findTime(grammar: Grammar, text: string): TimeHit | Invalid | null {
  return (
    findWindow(grammar, text) ??
    findSingleTime(grammar, text, "deadline") ??
    findSingleTime(grammar, text, "point")
  );
}

function prepare(grammar: Grammar, text: string): { lower: string; shown: string } | null {
  const shownFull = text.normalize("NFC").replace(/[’‘`]/gu, "'").replace(/\s+/gu, " ").trim();
  const lowerFull = shownFull.toLowerCase();
  let cut = lowerFull.length;
  for (const marker of grammar.cutMarkers) {
    const found = marker.exec(lowerFull);
    if (found !== null) cut = Math.min(cut, found.index);
  }
  const lower = lowerFull.slice(0, cut);
  if (grammar.negatives.some((negative) => negative.test(lower))) return null;
  const shown = (lowerFull.length === shownFull.length ? shownFull : lowerFull).slice(0, cut);
  return { lower, shown };
}

export function parseWithGrammar(
  grammar: Grammar,
  text: string,
  now: Date,
  timeZone: string,
): ArrivalWindow | null {
  const prepared = prepare(grammar, text);
  if (prepared === null) return null;
  const { lower, shown } = prepared;
  const today = todayIn(now, timeZone);
  const time = findTime(grammar, lower);
  if (time === INVALID) return null;
  const day = findDay(grammar, lower, today, time);
  if (day === INVALID || (day === null && time === null)) return null;
  const spans: Span[] = [day, time].filter((span): span is DayHit | TimeHit => span !== null);
  const matched = shown
    .slice(Math.min(...spans.map((s) => s.index)), Math.max(...spans.map((s) => s.end)))
    .trim();
  const from = day?.from ?? today;
  const to = day?.to ?? today;
  if (time === null) {
    return {
      from: formatZoned(zonedInstant(from, 0, timeZone), timeZone),
      to: formatZoned(zonedInstant(addDays(to, 1), 0, timeZone), timeZone),
      allDay: true,
      matched,
    };
  }
  const start = zonedInstant(from, time.start, timeZone);
  const stop = zonedInstant(to, time.stop, timeZone);
  if (stop < start) return null;
  return {
    from: formatZoned(start, timeZone),
    to: formatZoned(stop, timeZone),
    allDay: false,
    matched,
  };
}
