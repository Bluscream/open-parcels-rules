/*
 * Writes dist/bundle.json (what loadRules reads) and dist/vectors.json (the test vectors, for
 * ports of the engine such as the Python reference loader).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { collectData, ROOT } from "./collect.ts";

const dist = join(ROOT, "dist");
const data = collectData();
mkdirSync(dist, { recursive: true });
writeFileSync(join(dist, "bundle.json"), `${JSON.stringify(data.bundle)}\n`);

const vectors = {
  format: 1,
  version: data.bundle.version,
  tracking: data.bundle.tracking.flatMap((source) =>
    source.courier.tracking_numbers.map((type) => ({
      file: source.file,
      courier_code: source.courier.courier_code,
      name: type.name,
      id: type.id ?? null,
      valid: type.test_numbers.valid,
      invalid: type.test_numbers.invalid,
    })),
  ),
  status: data.status.map((file) => ({ carrier: file.carrier, tests: file.tests })),
};
writeFileSync(join(dist, "vectors.json"), `${JSON.stringify(vectors, null, 1)}\n`);
