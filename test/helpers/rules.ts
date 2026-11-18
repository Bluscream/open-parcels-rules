import { collectData } from "../../scripts/collect.ts";
import type { DataFiles } from "../../scripts/collect.ts";
import type { Rules } from "../../src/rules.ts";
import { compileBundle } from "../../src/rules.ts";

let data: DataFiles | undefined;
let rules: Rules | undefined;

/** Every data file, read from data/ and vendor/ (not from dist), validated. */
export function testData(): DataFiles {
  data ??= collectData();
  return data;
}

/** Rules compiled straight from the data files, so tests do not depend on a build. */
export function testRules(): Rules {
  rules ??= compileBundle(testData().bundle);
  return rules;
}
