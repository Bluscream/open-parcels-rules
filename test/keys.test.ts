import { describe, expect, it } from "vitest";
import { carrierKeys, findCarrierKey } from "../src/index.ts";
import { testData, testRules } from "./helpers/rules.ts";

const rules = testRules();
const keys = testData().bundle.keys;

describe("carrier keys", () => {
  it("only names carriers that exist in the registry", () => {
    const unknown = keys.filter((key) => !rules.carriers.byId.has(key.carrier));
    expect(unknown.map((key) => key.carrier)).toEqual([]);
  });

  it("lists each carrier and name once", () => {
    const ids = keys.map((key) => `${key.carrier}/${key.name}`);
    expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
  });

  it("is never verified in the future", () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(keys.filter((key) => key.last_verified > today).map((key) => key.name)).toEqual([]);
  });

  it("keeps values free of surrounding whitespace", () => {
    expect(keys.filter((key) => key.value.trim() !== key.value).map((key) => key.name)).toEqual([]);
  });

  it("finds a key by carrier id or name, and nothing for a missing one", () => {
    const first = keys[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    expect(findCarrierKey(rules, first.carrier, first.name)?.value).toBe(first.value);
    const carrier = rules.carriers.byId.get(first.carrier);
    expect(findCarrierKey(rules, carrier?.name ?? "", first.name)?.value).toBe(first.value);
    expect(findCarrierKey(rules, first.carrier, "no_such_key")).toBeUndefined();
    expect(findCarrierKey(rules, "no-such-carrier", first.name)).toBeUndefined();
    expect(carrierKeys(rules, first.carrier).map((key) => key.name)).toContain(first.name);
  });
});
