import type { Grammar, LocaleTable } from "./arrival/grammar.ts";
import { compileGrammar } from "./arrival/grammar.ts";
import type { CarrierIndex } from "./carriers.ts";
import { buildCarrierIndex } from "./carriers.ts";
import type { CompiledMailRule } from "./mail/compile.ts";
import { compileMailRule } from "./mail/compile.ts";
import type { Bundle } from "./schema/bundle.ts";
import { bundleSchema } from "./schema/bundle.ts";
import type { CompiledStatusTable } from "./status.ts";
import { compileStatusTable } from "./status.ts";
import type { CompiledTrackingType } from "./tracking/compile.ts";
import { compileTrackingTypes } from "./tracking/compile.ts";

/** Loaded, validated and compiled rule data. Build it once and share it; it is read-only. */
export interface Rules {
  readonly version: string;
  readonly carriers: CarrierIndex;
  readonly types: readonly CompiledTrackingType[];
  readonly statusTables: ReadonlyMap<string, CompiledStatusTable>;
  readonly locales: ReadonlyMap<string, LocaleTable>;
  readonly mailRules: readonly CompiledMailRule[];
  /** Merged locale grammars, keyed by the sorted locale list. */
  readonly grammarCache: Map<string, Grammar>;
  readonly trackingKeywords: RegExp;
}

function keywordRegex(locales: readonly LocaleTable[]): RegExp {
  const words = locales
    .flatMap((locale) => locale.tracking_keywords)
    .sort((a, b) => b.length - a.length)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\/]/gu, "\\$&"));
  return words.length === 0
    ? /(?!)/u
    : new RegExp(`(?<![\\p{L}])(?:${words.join("|")})(?![\\p{L}])`, "iu");
}

export function compileBundle(bundle: Bundle): Rules {
  return {
    version: bundle.version,
    carriers: buildCarrierIndex(bundle.carriers),
    types: compileTrackingTypes(bundle.tracking),
    statusTables: new Map(bundle.status.map((file) => [file.carrier, compileStatusTable(file)])),
    locales: new Map(bundle.locales.map((locale) => [locale.lang, locale])),
    mailRules: bundle.mail.map(compileMailRule),
    grammarCache: new Map(),
    trackingKeywords: keywordRegex(bundle.locales),
  };
}

/** Validates raw bundle data (e.g. parsed dist/bundle.json) and compiles it. */
export function rulesFromBundle(data: unknown): Rules {
  return compileBundle(bundleSchema.parse(data));
}

export function grammarFor(rules: Rules, locales?: readonly string[]): Grammar | null {
  const ids = (locales ?? [...rules.locales.keys()])
    .map((id) => id.toLowerCase().split(/[-_]/u)[0] ?? id)
    .filter((id) => rules.locales.has(id));
  const key = [...new Set(ids)].sort().join(",");
  if (key === "") return null;
  let grammar = rules.grammarCache.get(key);
  if (grammar === undefined) {
    const tables = key.split(",").flatMap((id) => {
      const table = rules.locales.get(id);
      return table === undefined ? [] : [table];
    });
    grammar = compileGrammar(tables);
    rules.grammarCache.set(key, grammar);
  }
  return grammar;
}
