import type { LocaleFile } from "../schema/locale.ts";
import { toRegexSpec } from "../schema/common.ts";
import { compileDataRegex } from "../portability.ts";

export type LocaleTable = Omit<LocaleFile, "tests">;

/** The locale tables of one call, merged and turned into the regexes the parser runs. */
export interface Grammar {
  readonly months: ReadonlyMap<string, number>;
  readonly weekdays: ReadonlyMap<string, number>;
  readonly relative: ReadonlyMap<string, number>;
  readonly am: ReadonlySet<string>;
  readonly negatives: readonly RegExp[];
  readonly cutMarkers: readonly RegExp[];
  /** Date shapes, most specific first. */
  readonly dates: readonly RegExp[];
  readonly relativeAfterLeadIn: RegExp;
  readonly weekdayAfterLeadIn: RegExp;
  /** A relative day or weekday shortly before a time expression (searched in the text before it). */
  readonly dayBeforeTime: RegExp;
  /** A relative day or weekday right after a time expression. */
  readonly dayAfterTime: RegExp;
  readonly window: RegExp;
  readonly deadline: RegExp;
  readonly point: RegExp;
  readonly monthAhead: RegExp;
}

const START = String.raw`(?<![\p{L}\p{N}])`;
const END = String.raw`(?![\p{L}\p{N}])`;
const DASH = String.raw`\s*[-–—‐]\s*`;
const ORDINAL = String.raw`(?:\.|st|nd|rd|th)?`;
/** "Fr., " before the second date of a range; only the date counts, so any short word will do. */
const WEEKDAY_ABBREVIATION = String.raw`(?:\p{L}{2,3}\.,?\s*)?`;

function escape(word: string): string {
  return word.replace(/[.*+?^${}()|[\]\\/]/gu, "\\$&").replace(/\s+/gu, String.raw`\s+`);
}

/** An alternation of words, longest first so "zustellung am" wins over "zustellung". */
function words(list: Iterable<string>): string {
  const unique = [...new Set(list)].sort((a, b) => b.length - a.length);
  return unique.length === 0 ? "(?!)" : `(?:${unique.map(escape).join("|")})`;
}

function collect(tables: readonly LocaleTable[], pick: (table: LocaleTable) => string[]): string[] {
  return tables.flatMap(pick);
}

function indexWords(lists: readonly (readonly string[])[], offset: number): Map<string, number> {
  const map = new Map<string, number>();
  lists.forEach((list, index) => {
    for (const word of list) if (!map.has(word)) map.set(word, index + offset);
  });
  return map;
}

function timeToken(n: number, ampm: string): string {
  return (
    String.raw`(?<h${n}>\d{1,2})(?:(?<c${n}>:)(?<m${n}>\d{2})|(?<k${n}>h)(?<l${n}>\d{2})?)?` +
    String.raw`(?:\s*(?<a${n}>${ampm}))?`
  );
}

function dateShapes(month: string, sep: string): RegExp[] {
  const day = (name: string): string => String.raw`(?<${name}>\d{1,2})`;
  const year = (name: string): string => String.raw`(?:,?\s+(?<${name}>\d{4}))?`;
  const numeric = (d: string, m: string, y: string): string =>
    String.raw`(?<![\d.])(?<${d}>\d{1,2})\.(?<${m}>\d{1,2})\.(?:(?<${y}>\d{4}|\d{2}))?(?![\d])`;
  const monthGroup = (name: string): string => String.raw`(?<${name}>${month})\.?`;
  const shapes = [
    // 20 November - 18 December
    `${day("d1")}${ORDINAL}\\s*${monthGroup("m1")}${year("y1")}${sep}${day("d2")}${ORDINAL}\\s*${monthGroup("m2")}${year("y2")}`,
    // 3 - 5 December, 20. - 22. Oktober
    `${day("d1")}${ORDINAL}${sep}${day("d2")}${ORDINAL}\\s*${monthGroup("m1")}${year("y1")}`,
    // Oct 27-29, Oct 30 - Nov 2
    `${monthGroup("m1")}\\s+${day("d1")}${ORDINAL}${sep}(?:${monthGroup("m2")}\\s+)?${day("d2")}${ORDINAL}${year("y1")}`,
    // 20.11. - 22.11.2026, Do., 19.11. - Fr., 20.11.
    `${numeric("d1", "n1", "y1")}${sep}${WEEKDAY_ABBREVIATION}${numeric("d2", "n2", "y2")}`,
    // 20 November 2026, 20. Okt.
    `${day("d1")}${ORDINAL}\\s*${monthGroup("m1")}${year("y1")}`,
    // November 20, 2026
    `${monthGroup("m1")}\\s+${day("d1")}${ORDINAL}${year("y1")}`,
    // 20.11. / 20.11.2026
    numeric("d1", "n1", "y1"),
  ];
  return shapes.map((shape) => new RegExp(`${START}${shape}${END}`, "u"));
}

export function compileGrammar(tables: readonly LocaleTable[]): Grammar {
  const months = indexWords(mergeLists(tables, "months"), 1);
  const weekdays = indexWords(mergeLists(tables, "weekdays"), 0);
  const relative = new Map<string, number>();
  for (const table of tables) {
    for (const [word, offset] of Object.entries(table.relative_days)) {
      if (!relative.has(word)) relative.set(word, offset);
    }
  }
  const month = words(months.keys());
  const weekday = `${words(weekdays.keys())}\\.?`;
  const rel = words(relative.keys());
  const leadIn = words(collect(tables, (t) => t.lead_ins));
  const sep = `(?:${DASH}|\\s+${words(collect(tables, (t) => t.range_separators))}\\s+)`;
  const ampm = words(collect(tables, (t) => [...t.am_markers, ...t.pm_markers]));
  const hourWord = `(?:\\s*(?<u>${words(collect(tables, (t) => t.hour_words))}))?`;
  const hourWord2 = `(?:\\s*(?<u2>${words(collect(tables, (t) => t.hour_words))}))?`;
  const opener = `(?:${words(collect(tables, (t) => t.window_openers))}\\s+)?`;
  const gap = String.raw`(?::|,)?(?:\s+[\p{L}'.,:]+){0,3}?\s+`;
  const regexes = (pick: (t: LocaleTable) => readonly (string | { pattern: string })[]): RegExp[] =>
    tables.flatMap(pick).map((value) => {
      const spec = toRegexSpec(value);
      return compileDataRegex(spec.pattern, [...new Set([...(spec.flags ?? []), "i"])]);
    });
  return {
    months,
    weekdays,
    relative,
    am: new Set(collect(tables, (t) => t.am_markers)),
    negatives: regexes((t) => t.negatives),
    cutMarkers: regexes((t) => t.cut_markers),
    dates: dateShapes(month, sep),
    relativeAfterLeadIn: new RegExp(`${START}${leadIn}${gap}(?<rel>${rel})${END}`, "u"),
    weekdayAfterLeadIn: new RegExp(`${START}${leadIn}${gap}(?<wd>${weekday})${END}`, "u"),
    dayBeforeTime: new RegExp(
      String.raw`${START}(?:(?<rel>${rel})|(?<wd>${weekday}))${END}(?:[\s,:]+[\p{L}.]+){0,2}?[\s,:]*$`,
      "u",
    ),
    dayAfterTime: new RegExp(String.raw`^[\s,:]*(?:(?<rel>${rel})|(?<wd>${weekday}))${END}`, "u"),
    window: new RegExp(
      `${START}${opener}${timeToken(1, ampm)}${hourWord}${sep}${timeToken(2, ampm)}${hourWord2}${END}`,
      "u",
    ),
    deadline: new RegExp(
      `${START}${words(collect(tables, (t) => t.deadline_words))}\\s+${timeToken(1, ampm)}${hourWord}${END}`,
      "u",
    ),
    point: new RegExp(
      `${START}${words(collect(tables, (t) => t.point_words))}\\s+${timeToken(1, ampm)}${hourWord}${END}`,
      "u",
    ),
    monthAhead: new RegExp(String.raw`^\s*\.?\s*${month}${END}`, "u"),
  };
}

function mergeLists(tables: readonly LocaleTable[], key: "months" | "weekdays"): string[][] {
  const size = key === "months" ? 12 : 7;
  return Array.from({ length: size }, (_, index) =>
    tables.flatMap((table) => table[key][index] ?? []),
  );
}
