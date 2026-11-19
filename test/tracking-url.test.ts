import { describe, expect, it } from "vitest";
import { trackingUrl } from "../src/index.ts";
import { testRules } from "./helpers/rules.ts";

const rules = testRules();

describe("trackingUrl", () => {
  it("fills the number, URL-encoded", () => {
    expect(trackingUrl(rules, "evri", "AB 12/3")).toBe(
      "https://www.evri.com/track/parcel/AB%2012%2F3/details",
    );
  });

  it("prefers the full tag, then the language, then default", () => {
    expect(trackingUrl(rules, "aramex", "X1", "en-NZ")).toBe(
      "https://www.aramex.co.nz/tools/track?l=X1",
    );
    expect(trackingUrl(rules, "aramex", "X1", "en-AU")).toBe(
      "https://www.aramex.com.au/tools/track?l=X1",
    );
    expect(trackingUrl(rules, "sameday", "X1", "hu")).toBe("https://sameday.hu/#awb=X1");
    expect(trackingUrl(rules, "sameday", "X1")).toBe("https://sameday.ro/status-colet/?awb=X1");
  });

  it("fills other placeholders from params, URL-encoded", () => {
    expect(trackingUrl(rules, "gls", "12345678", "nl", { postcode: "1234AB" })).toBe(
      "https://www.gls-info.nl/tracking?trackid=12345678&zipcode=1234AB",
    );
    expect(trackingUrl(rules, "trunkrs", "X1", undefined, { postcode: "1234 AB" })).toBe(
      "https://parcel.trunkrs.nl/X1/1234%20AB",
    );
  });

  it("skips a template whose placeholders are not all given", () => {
    expect(trackingUrl(rules, "gls", "12345678", "nl")).toBe(
      "https://gls-group.com/EU/en/parcel-tracking?match=12345678",
    );
    expect(trackingUrl(rules, "trunkrs", "X1")).toBeUndefined();
  });

  it("ignores params a template does not name, and cannot override the number", () => {
    expect(trackingUrl(rules, "evri", "X1", undefined, { tracking_number: "Y2", other: "z" })).toBe(
      "https://www.evri.com/track/parcel/X1/details",
    );
  });

  it("answers undefined for an unknown carrier or one without a page", () => {
    expect(trackingUrl(rules, "no_such_carrier", "X1")).toBeUndefined();
    expect(trackingUrl(rules, "seur", "X1")).toBeUndefined();
  });
});
