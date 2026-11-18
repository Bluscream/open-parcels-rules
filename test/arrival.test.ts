import { describe, expect, it } from "vitest";
import { addDays, formatZoned, zonedInstant } from "../src/arrival/zoned.ts";
import { parseArrival } from "../src/index.ts";
import { testData, testRules } from "./helpers/rules.ts";

const rules = testRules();

describe("locale vectors", () => {
  for (const locale of testData().locales) {
    describe(locale.lang, () => {
      for (const vector of locale.tests) {
        it(`${vector.text} @ ${vector.now} ${vector.time_zone}`, () => {
          const window = parseArrival(rules, vector.text, {
            now: new Date(vector.now),
            timeZone: vector.time_zone,
            locales: [locale.lang],
          });
          if (vector.expect === null) {
            expect(window).toBeNull();
            return;
          }
          expect(window).toMatchObject({
            from: vector.expect.from,
            to: vector.expect.to,
            allDay: vector.expect.all_day,
          });
          expect(vector.text).toContain(window?.matched ?? "\u0000");
        });
      }
    });
  }
});

describe("parseArrival", () => {
  const now = new Date("2026-11-18T08:00:00Z");

  it("uses every locale by default", () => {
    expect(parseArrival(rules, "Zustellung morgen", { now, timeZone: "Europe/Berlin" })?.from).toBe(
      "2026-11-19T00:00:00+01:00",
    );
    expect(parseArrival(rules, "Arriving tomorrow", { now, timeZone: "Europe/Berlin" })?.from).toBe(
      "2026-11-19T00:00:00+01:00",
    );
  });

  it("returns null when no requested locale is loaded", () => {
    expect(
      parseArrival(rules, "Arriving tomorrow", { now, timeZone: "UTC", locales: ["xx"] }),
    ).toBeNull();
  });

  it("accepts language tags", () => {
    const window = parseArrival(rules, "Ankunft morgen", {
      now,
      timeZone: "UTC",
      locales: ["de-AT"],
    });
    expect(window?.allDay).toBe(true);
  });

  it("reads the day in the requested time zone, not in UTC", () => {
    const late = new Date("2026-11-18T23:30:00Z");
    expect(
      parseArrival(rules, "Arriving today", { now: late, timeZone: "Europe/Berlin" })?.from,
    ).toBe("2026-11-19T00:00:00+01:00");
    expect(
      parseArrival(rules, "Arriving today", { now: late, timeZone: "America/Los_Angeles" })?.from,
    ).toBe("2026-11-18T00:00:00-08:00");
  });
});

describe("time-zone arithmetic", () => {
  const berlin = "Europe/Berlin";

  it("gives the DST start day 23 hours and the DST end day 25", () => {
    const march = { year: 2026, month: 3, day: 29 };
    const october = { year: 2026, month: 10, day: 25 };
    const hours = (day: typeof march) =>
      (zonedInstant(addDays(day, 1), 0, berlin) - zonedInstant(day, 0, berlin)) / 3_600_000;
    expect(hours(march)).toBe(23);
    expect(hours(october)).toBe(25);
  });

  it("moves a time inside the spring gap forward and takes the first of a repeated hour", () => {
    const march = { year: 2026, month: 3, day: 29 };
    expect(formatZoned(zonedInstant(march, 150, berlin), berlin)).toBe("2026-03-29T03:30:00+02:00");
    const october = { year: 2026, month: 10, day: 25 };
    expect(formatZoned(zonedInstant(october, 150, berlin), berlin)).toBe(
      "2026-10-25T02:30:00+02:00",
    );
  });

  it("formats negative and fractional offsets", () => {
    const day = { year: 2026, month: 1, day: 15 };
    expect(formatZoned(zonedInstant(day, 0, "America/St_Johns"), "America/St_Johns")).toBe(
      "2026-01-15T00:00:00-03:30",
    );
    expect(formatZoned(zonedInstant(day, 0, "Asia/Kolkata"), "Asia/Kolkata")).toBe(
      "2026-01-15T00:00:00+05:30",
    );
  });
});
