import { readFileSync } from "node:fs";
import type { Rules } from "./rules.ts";
import { rulesFromBundle } from "./rules.ts";

let cached: Rules | undefined;

/**
 * The rules shipped with this package (dist/bundle.json), validated and compiled on first use
 * and shared afterwards. Synchronous: it reads one local file.
 */
export function loadRules(): Rules {
  cached ??= rulesFromBundle(
    JSON.parse(readFileSync(new URL("./bundle.json", import.meta.url), "utf8")) as unknown,
  );
  return cached;
}
