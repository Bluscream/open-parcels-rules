import { describe, expect, it } from "vitest";
import { mapStatus, resolveStatus } from "../src/index.ts";
import { testData, testRules } from "./helpers/rules.ts";

const rules = testRules();

describe("status table vectors", () => {
  for (const file of testData().status) {
    describe(file.carrier, () => {
      for (const vector of file.tests) {
        const label = vector.input.code ?? vector.input.text ?? "";
        it(`${label} -> ${vector.status ?? "unmapped"}`, () => {
          const mapped = mapStatus(rules, file.carrier, vector.input);
          expect(mapped?.status ?? null).toBe(vector.status);
          if (vector.pickup !== undefined) expect(mapped?.pickup ?? false).toBe(vector.pickup);
        });
      }
    });
  }

  it("has tables for the first five carriers", () => {
    const carriers = testData().status.map((file) => file.carrier);
    expect(carriers).toEqual(expect.arrayContaining(["amazon", "dhl", "dpd", "gls", "hermes"]));
  });

  it("only names carriers that exist in the registry", () => {
    for (const file of testData().status) expect(rules.carriers.byId.has(file.carrier)).toBe(true);
  });
});

describe("mapStatus", () => {
  it("accepts carrier names and aliases", () => {
    expect(mapStatus(rules, "DHL Paket", { code: "fortschritt:5" })?.status).toBe("delivered");
    expect(mapStatus(rules, "myHermes", { code: "ZUGESTELLT" })?.status).toBe("delivered");
  });

  it("reports plausible guesses as unconfirmed", () => {
    expect(mapStatus(rules, "amazon", { code: "PICKUP_AVAILABLE" })).toEqual({
      status: "at_pickup_point",
      pickup: true,
      confirmed: false,
    });
    expect(mapStatus(rules, "amazon", { code: "DELIVERED" })).toEqual({
      status: "delivered",
      confirmed: true,
    });
  });

  it("tries the code before the text", () => {
    const mapped = mapStatus(rules, "dpd", { code: "DODEI", text: "Paket zugestellt" });
    expect(mapped?.status).toBe("at_pickup_point");
    expect(mapStatus(rules, "dpd", { code: "NOPE", text: "Paket zugestellt" })?.status).toBe(
      "delivered",
    );
  });

  it("returns null for carriers without a table and for empty input", () => {
    expect(mapStatus(rules, "nonexistent", { code: "DELIVERED" })).toBeNull();
    expect(mapStatus(rules, "dhl", {})).toBeNull();
    expect(mapStatus(rules, "dhl", { code: "  ", text: "" })).toBeNull();
  });
});

describe("resolveStatus", () => {
  it("uses the latest event when it maps", () => {
    expect(
      resolveStatus(rules, "hermes", { code: "ZUSTELLTOUR" }, [{ code: "UNTERWEGS" }]),
    ).toEqual({
      status: "out_for_delivery",
      source: "latest",
      unmapped: null,
    });
  });

  it("falls back to the newest history entry that maps and names the unmapped value", () => {
    const history = [{ code: "SOMETHING_NEW" }, { code: "SORTED" }, { code: "ANNOUNCED" }];
    expect(resolveStatus(rules, "hermes", { code: "SOMETHING_NEW" }, history)).toEqual({
      status: "in_transit",
      source: "history",
      unmapped: "SOMETHING_NEW",
    });
  });

  it("does not regress on a booking that is deliberately unmapped", () => {
    const result = resolveStatus(rules, "hermes", { code: "EDL_BOOKED_DROPOFF" }, [
      { code: "EDL_BOOKED_DROPOFF" },
      { code: "ARRIVED_AT_DELIVERY_DEPOT" },
    ]);
    expect(result.status).toBe("in_transit");
  });

  it("treats a value mapped to unknown as no information, without a warning", () => {
    expect(resolveStatus(rules, "dhl", { code: "unknown" }, [{ code: "transit" }])).toEqual({
      status: "in_transit",
      source: "history",
      unmapped: null,
    });
  });

  it("ends at unknown when nothing maps", () => {
    expect(resolveStatus(rules, "gls", { text: "???" }, [{ text: "!!!" }])).toEqual({
      status: "unknown",
      source: "unknown",
      unmapped: "???",
    });
    expect(resolveStatus(rules, "no-such-carrier", { code: "X" }, [])).toEqual({
      status: "unknown",
      source: "unknown",
      unmapped: "X",
    });
  });
});
