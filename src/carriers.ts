import type { CarrierEntry } from "./schema/carriers.ts";
import type { CarrierInfo } from "./types.ts";

export interface CarrierIndex {
  readonly list: readonly CarrierInfo[];
  readonly byId: ReadonlyMap<string, CarrierInfo>;
  /** Normalised id, name and alias to carrier. */
  readonly byName: ReadonlyMap<string, CarrierInfo>;
  /** courier_code of a tracking-number file to carrier id. */
  readonly byCourierCode: ReadonlyMap<string, string>;
  /** UPU S10 country code to carrier id. */
  readonly byUpuCountry: ReadonlyMap<string, string>;
}

/** Folds case, accents and punctuation so "DHL-Paket", "dhl paket" and "DHL Päket" meet. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

export function buildCarrierIndex(entries: readonly CarrierEntry[]): CarrierIndex {
  const list: CarrierInfo[] = [];
  const byId = new Map<string, CarrierInfo>();
  const byName = new Map<string, CarrierInfo>();
  const byCourierCode = new Map<string, string>();
  const byUpuCountry = new Map<string, string>();
  for (const entry of entries) {
    const info: CarrierInfo = {
      id: entry.id,
      name: entry.name,
      aliases: entry.aliases,
      countries: entry.countries,
      domains: entry.domains,
      trackingUrls: entry.tracking_urls,
      crossref: entry.crossref,
    };
    list.push(info);
    byId.set(entry.id, info);
    for (const name of [entry.id, entry.name, ...entry.aliases]) {
      const key = normalizeName(name);
      if (!byName.has(key)) byName.set(key, info);
    }
    for (const code of [entry.id, ...entry.courier_codes]) byCourierCode.set(code, entry.id);
    for (const country of entry.upu_countries) byUpuCountry.set(country, entry.id);
  }
  return { list, byId, byName, byCourierCode, byUpuCountry };
}

export function lookupCarrier(index: CarrierIndex, nameOrAlias: string): CarrierInfo | undefined {
  return index.byId.get(nameOrAlias) ?? index.byName.get(normalizeName(nameOrAlias));
}

/** True when `domain` is `carrierDomain` or one of its subdomains. */
export function domainMatches(domain: string, carrierDomain: string): boolean {
  const lower = domain.toLowerCase();
  return lower === carrierDomain || lower.endsWith(`.${carrierDomain}`);
}

export function carrierForDomain(index: CarrierIndex, domain: string): CarrierInfo | undefined {
  return index.list.find((carrier) => carrier.domains.some((d) => domainMatches(domain, d)));
}

export function buildTrackingUrl(
  carrier: CarrierInfo,
  trackingNumber: string,
  locale?: string,
): string | undefined {
  const urls = carrier.trackingUrls;
  const keys: string[] = [];
  if (locale !== undefined) {
    keys.push(locale, locale.toLowerCase(), locale.split(/[-_]/u)[0]?.toLowerCase() ?? "");
  }
  keys.push("default");
  const template = keys.map((key) => urls[key]).find((value) => value !== undefined);
  return template?.replaceAll("{tracking_number}", encodeURIComponent(trackingNumber));
}
