/*
 * Calendar arithmetic in an IANA time zone with nothing but Intl: civil dates are plain
 * {year, month, day} records, and instants are converted at the edges.
 */

export interface CivilDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
}

interface WallClock extends CivilDate {
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

const MINUTE = 60_000;
const DAY = 86_400_000;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let cached = formatters.get(timeZone);
  if (cached === undefined) {
    cached = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
    formatters.set(timeZone, cached);
  }
  return cached;
}

function wallClock(instant: number, timeZone: string): WallClock {
  const parts: Record<string, number> = {};
  for (const part of formatter(timeZone).formatToParts(instant)) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return {
    year: parts["year"] ?? 0,
    month: parts["month"] ?? 0,
    day: parts["day"] ?? 0,
    hour: parts["hour"] ?? 0,
    minute: parts["minute"] ?? 0,
    second: parts["second"] ?? 0,
  };
}

/** Offset of `timeZone` from UTC at `instant`, in minutes (east positive). */
function offsetMinutes(instant: number, timeZone: string): number {
  const wall = wallClock(instant, timeZone);
  const asUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second);
  const whole = Math.floor(instant / 1000) * 1000;
  return Math.round((asUtc - whole) / MINUTE);
}

export function todayIn(now: Date, timeZone: string): CivilDate {
  const wall = wallClock(now.getTime(), timeZone);
  return { year: wall.year, month: wall.month, day: wall.day };
}

export function addDays(date: CivilDate, days: number): CivilDate {
  const moved = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate() };
}

export function isValidDate(year: number, month: number, day: number): boolean {
  const probe = new Date(Date.UTC(year, month - 1, day));
  return (
    probe.getUTCFullYear() === year &&
    probe.getUTCMonth() === month - 1 &&
    probe.getUTCDate() === day
  );
}

export function compareDates(a: CivilDate, b: CivilDate): number {
  return a.year - b.year || a.month - b.month || a.day - b.day;
}

/** 0 = Monday ... 6 = Sunday. */
export function weekdayOf(date: CivilDate): number {
  return (new Date(Date.UTC(date.year, date.month - 1, date.day)).getUTCDay() + 6) % 7;
}

/**
 * The instant at which the clock in `timeZone` shows `minutes` after midnight of `date`.
 * Minutes past 24:00 roll into the next day. A time skipped by a DST change resolves to the
 * instant just after the gap; a repeated time resolves to its first occurrence.
 */
export function zonedInstant(date: CivilDate, minutes: number, timeZone: string): number {
  const day = addDays(date, Math.floor(minutes / 1440));
  const rest = minutes % 1440;
  const wallAsUtc = Date.UTC(day.year, day.month - 1, day.day, Math.floor(rest / 60), rest % 60);
  // Zones change offset at most once within a day, so the offsets a day before and after are
  // the only two readings this wall time can have.
  const readings = [-DAY, DAY].map((shift) => {
    const offset = offsetMinutes(wallAsUtc + shift, timeZone);
    const instant = wallAsUtc - offset * MINUTE;
    return { instant, shows: offsetMinutes(instant, timeZone) === offset };
  });
  const shown = readings.filter((reading) => reading.shows).map((reading) => reading.instant);
  if (shown.length > 0) return Math.min(...shown);
  return Math.max(...readings.map((reading) => reading.instant));
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, "0");
}

/** ISO 8601 with the zone's offset at that instant, e.g. 2026-10-25T00:00:00+02:00. */
export function formatZoned(instant: number, timeZone: string): string {
  const wall = wallClock(instant, timeZone);
  const offset = offsetMinutes(instant, timeZone);
  const sign = offset < 0 ? "-" : "+";
  const abs = Math.abs(offset);
  return (
    `${pad(wall.year, 4)}-${pad(wall.month)}-${pad(wall.day)}T` +
    `${pad(wall.hour)}:${pad(wall.minute)}:${pad(wall.second)}` +
    `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
  );
}
