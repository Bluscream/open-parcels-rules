import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROOT } from "../scripts/collect.ts";
import { parseMail } from "../src/index.ts";
import { isBoilerplateItem, isPlaceholder } from "../src/mail/context.ts";
import { EXTRACTORS } from "../src/mail/extractors.ts";
import { senderAddress } from "../src/mail/parse.ts";
import type { MailInput } from "../src/types.ts";
import { parseEml } from "./helpers/eml.ts";
import { testData, testRules } from "./helpers/rules.ts";

const rules = testRules();
const FIXTURES = join(ROOT, "test", "fixtures", "mail");

function fixture(name: string, timeZone?: string, now?: string): MailInput {
  const mail = parseEml(readFileSync(join(FIXTURES, name), "utf8"), timeZone);
  return now === undefined ? mail : { ...mail, date: new Date(now) };
}

describe("mail rule vectors", () => {
  for (const rule of testData().mail) {
    describe(rule.id, () => {
      for (const test of rule.tests) {
        it(test.fixture, () => {
          const results = parseMail(rules, fixture(test.fixture, test.time_zone, test.now));
          expect(results).toHaveLength(test.expect.length);
          test.expect.forEach((expected, index) => {
            expect(results[index]).toMatchObject(expected);
          });
        });
      }
    });
  }
});

describe("mail rule data", () => {
  const data = testData().mail;

  it("converts every old rule", () => {
    const ids = data.map((rule) => rule.id);
    const old = [
      ...["aliexpress", "amazon", "auspost", "berrybase", "capost", "dhl", "dpd-pl", "ebay"].map(
        (name) => `parcel-${name}`,
      ),
      ...["fedex", "gls", "hermes", "inpost", "jlcpcb", "poczta-polska", "royalmail", "ups"].map(
        (name) => `parcel-${name}`,
      ),
      "parcel-usps",
      ...["amazon", "berrybase", "ebay", "jlcpcb", "shopify"].map((name) => `order-${name}`),
      "return-amazon",
      "return-paypal",
      "dunning-amazon",
    ];
    expect(ids).toEqual(expect.arrayContaining(old));
  });

  it("has unique ids that match the file names", () => {
    const ids = data.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(ids.length);
    const files = readdirSync(join(ROOT, "data", "mail")).map((file) =>
      file.replace(/\.yaml$/u, ""),
    );
    expect(files.sort()).toEqual([...ids].sort());
  });

  it("names a group after the field in every extraction pattern", () => {
    const missing = data.flatMap((rule) =>
      Object.entries(rule.extract).flatMap(([field, specs]) =>
        specs
          .filter((spec) => !spec.pattern.includes(`(?<${field}>`))
          .map(() => `${rule.id}.${field}`),
      ),
    );
    expect(missing).toEqual([]);
  });

  it("only uses extractors and carriers that exist", () => {
    for (const rule of data) {
      for (const name of rule.extractors) expect(Object.keys(EXTRACTORS)).toContain(name);
      if (rule.carrier !== undefined) expect(rules.carriers.byId.has(rule.carrier)).toBe(true);
    }
  });

  it("uses every fixture file", () => {
    const used = new Set(data.flatMap((rule) => rule.tests.map((test) => test.fixture)));
    const extra = [
      "schema-org-jsonld.eml",
      "schema-org-microdata.eml",
      "fallback-shop.eml",
      "unrelated-newsletter.eml",
    ];
    for (const name of extra) used.add(name);
    expect(readdirSync(FIXTURES).filter((name) => !used.has(name))).toEqual([]);
  });
});

describe("parseMail beyond the rules", () => {
  it("reads schema.org ParcelDelivery JSON-LD", () => {
    const results = parseMail(rules, fixture("schema-org-jsonld.eml"));
    expect(results).toEqual([
      expect.objectContaining({
        ruleId: "schema.org",
        kind: "parcel",
        carrier: "ups",
        trackingNumbers: ["1ZA1B2C30312345673"],
        orderNumbers: ["SO-2026-0815"],
        status: "in_transit",
        items: ["Desk lamp"],
        trackingUrl: "https://shop.example.com/track/SO-2026-0815",
      }),
    ]);
    expect(results[0]?.arrival).toMatchObject({
      from: "2026-11-20T09:00:00+01:00",
      to: "2026-11-20T17:00:00+01:00",
    });
  });

  it("reads schema.org ParcelDelivery microdata", () => {
    const results = parseMail(rules, fixture("schema-org-microdata.eml"));
    expect(results).toEqual([
      expect.objectContaining({
        ruleId: "schema.org",
        trackingNumbers: ["00340434987654321012"],
        status: "delivered",
      }),
    ]);
  });

  it("ignores a tracking number from a sender the rules do not know", () => {
    expect(parseMail(rules, fixture("fallback-shop.eml"))).toEqual([]);
  });

  it("falls back to format detection for a carrier mail with a labelled number", () => {
    const results = parseMail(rules, {
      from: "info@dhl.com",
      subject: "Shipment update",
      text: "Hello,\nTracking number: 00340434123456789012\n",
    });
    expect(results).toEqual([
      {
        ruleId: "fallback",
        kind: "parcel",
        carrier: "dhl",
        trackingNumbers: ["00340434123456789012"],
        orderNumbers: [],
      },
    ]);
  });

  it("needs a tracking word or link next to a detected number", () => {
    const results = parseMail(rules, {
      from: "info@dhl.com",
      subject: "Your invoice",
      text: "Hello,\nCustomer reference 00340434123456789012\n",
    });
    expect(results).toEqual([]);
  });

  it("accepts a number inside a tracking link", () => {
    const [result] = parseMail(rules, {
      from: "info@dhl.com",
      subject: "Shipment update",
      text: "See https://www.dhl.de/verfolgen.html?piececode=00340434123456789012\n",
    });
    expect(result?.trackingNumbers).toEqual(["00340434123456789012"]);
  });

  it("rejects placeholder numbers", () => {
    for (const number of ["990000000000002", "000000000000", "99999999999999", "1111111111"]) {
      expect(isPlaceholder(number)).toBe(true);
    }
    expect(isPlaceholder("00340434123456789012")).toBe(false);
    expect(isPlaceholder("00340434000000000017")).toBe(false);
    expect(isPlaceholder("09446624362703")).toBe(false);
  });

  it("drops instructional bullets as item names", () => {
    expect(isBoilerplateItem("Enter the recipient's postal code to track with the carrier")).toBe(
      true,
    );
    expect(isBoilerplateItem("Ersatzkabel 2 m")).toBe(false);
  });

  it("leaves unrelated mail alone", () => {
    expect(parseMail(rules, fixture("unrelated-newsletter.eml"))).toEqual([]);
  });

  it("reads the sender address from display-name forms", () => {
    expect(senderAddress('"DHL Paket" <NoReply@DHL.de>')).toBe("noreply@dhl.de");
    expect(senderAddress("noreply@dhl.de")).toBe("noreply@dhl.de");
    expect(senderAddress("DHL noreply@dhl.de")).toBe("noreply@dhl.de");
  });

  it("returns no arrival without a mail date to anchor relative days", () => {
    const results = parseMail(rules, {
      from: "noreply@dhl.de",
      subject: "Ihr DHL Paket kommt heute",
      text: "Sendungsnummer: 00340434123456789012\nZustellung heute zwischen 14:00 und 18:00 Uhr",
    });
    expect(results[0]?.arrival).toBeUndefined();
    expect(results[0]?.trackingNumbers).toEqual(["00340434123456789012"]);
  });
});
