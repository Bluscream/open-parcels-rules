/*
 * Reads every data file, validates it against its schema and assembles the bundle the engine
 * loads. Used by the build and by the tests; never shipped.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { z } from "zod";
import type { Bundle, TrackingSource } from "../src/schema/bundle.ts";
import { bundleSchema } from "../src/schema/bundle.ts";
import { carriersFileSchema } from "../src/schema/carriers.ts";
import type { LocaleFile } from "../src/schema/locale.ts";
import { localeFileSchema } from "../src/schema/locale.ts";
import type { MailRule } from "../src/schema/mail.ts";
import { mailRuleSchema } from "../src/schema/mail.ts";
import type { StatusFile } from "../src/schema/status.ts";
import { statusFileSchema } from "../src/schema/status.ts";
import { courierFileSchema } from "../src/schema/tracking.ts";

export const ROOT = join(import.meta.dirname, "..");
export const DATA = join(ROOT, "data");
export const VENDOR_COURIERS = join(ROOT, "vendor", "tracking_number_data", "couriers");

export interface DataFiles {
  readonly bundle: Bundle;
  readonly status: readonly StatusFile[];
  readonly locales: readonly LocaleFile[];
  readonly mail: readonly MailRule[];
}

export function listFiles(dir: string, extension: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(extension))
    .sort()
    .map((name) => join(dir, name));
}

export function readData(path: string): unknown {
  const text = readFileSync(path, "utf8");
  return path.endsWith(".json") ? (JSON.parse(text) as unknown) : (parseYaml(text) as unknown);
}

function parseFile<T extends z.ZodType>(schema: T, path: string): z.infer<T> {
  const result = schema.safeParse(readData(path));
  if (!result.success) {
    throw new Error(
      `${path} does not match its schema:\n${JSON.stringify(result.error.issues, null, 2)}`,
    );
  }
  return result.data;
}

function trackingSources(): TrackingSource[] {
  const read = (dir: string, origin: TrackingSource["origin"]): TrackingSource[] =>
    listFiles(dir, ".json").map((path) => ({
      origin,
      file: path.slice(ROOT.length + 1).replaceAll("\\", "/"),
      courier: parseFile(courierFileSchema, path),
    }));
  return [...read(VENDOR_COURIERS, "vendor"), ...read(join(DATA, "tracking-numbers"), "overlay")];
}

function packageVersion(): string {
  const manifest = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")) as {
    version: string;
  };
  return manifest.version;
}

export function collectData(): DataFiles {
  const carriers = parseFile(carriersFileSchema, join(DATA, "carriers.yaml"));
  const status = listFiles(join(DATA, "status"), ".yaml").map((p) =>
    parseFile(statusFileSchema, p),
  );
  const locales = listFiles(join(DATA, "locales"), ".yaml").map((p) =>
    parseFile(localeFileSchema, p),
  );
  const mail = listFiles(join(DATA, "mail"), ".yaml").map((p) => parseFile(mailRuleSchema, p));
  const strip = <T extends { tests: unknown }>({ tests: _tests, ...rest }: T): Omit<T, "tests"> =>
    rest;
  const bundle = bundleSchema.parse({
    format: 1,
    version: packageVersion(),
    carriers: carriers.carriers,
    tracking: trackingSources(),
    status: status.map(strip),
    locales: locales.map(strip),
    mail: mail.map(strip),
  });
  return { bundle, status, locales, mail };
}
