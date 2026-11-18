/*
 * schema.org ParcelDelivery markup, which some shops and carriers embed in mails as JSON-LD
 * or microdata. Costs one substring check when absent.
 */
import { decodeEntities } from "./html.ts";
import type { ParcelStatus } from "../types.ts";

export interface SchemaOrgDelivery {
  readonly trackingNumbers: string[];
  readonly orderNumbers: string[];
  readonly carrierName?: string;
  readonly trackingUrl?: string;
  readonly status?: ParcelStatus;
  readonly expectedFrom?: string;
  readonly expectedUntil?: string;
  readonly items: string[];
}

const DELIVERY_STATUS: Readonly<Record<string, ParcelStatus>> = {
  OrderInTransit: "in_transit",
  OrderDelivered: "delivered",
  OrderPickupAvailable: "at_pickup_point",
  OrderProblem: "problem",
  OrderReturned: "returning",
  OrderProcessing: "registered",
  OrderPaymentDue: "registered",
};

type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

function isObject(value: unknown): value is Record<string, Json> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value: Json | undefined): string | undefined {
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number") return String(value);
  if (isObject(value)) return text(value["name"]) ?? text(value["@id"]);
  return undefined;
}

function typeNames(node: Record<string, Json>): string[] {
  const type = node["@type"];
  const list = Array.isArray(type) ? type : [type];
  return list.filter((entry): entry is string => typeof entry === "string");
}

function collectDeliveries(value: Json, found: Record<string, Json>[]): void {
  if (Array.isArray(value)) {
    for (const entry of value) collectDeliveries(entry, found);
    return;
  }
  if (!isObject(value)) return;
  if (typeNames(value).some((name) => name.endsWith("ParcelDelivery"))) found.push(value);
  for (const child of Object.values(value)) collectDeliveries(child, found);
}

function statusOf(value: Json | undefined): ParcelStatus | undefined {
  const raw = text(value);
  if (raw === undefined) return undefined;
  const key = raw.replace(/^.*[/#:]/u, "");
  return DELIVERY_STATUS[key];
}

function fromJsonLd(node: Record<string, Json>): SchemaOrgDelivery {
  const order = node["partOfOrder"];
  const item = node["itemShipped"];
  const items = (Array.isArray(item) ? item : [item]).map(text).filter((v) => v !== undefined);
  const tracking = text(node["trackingNumber"]);
  const orderNumber = isObject(order) ? text(order["orderNumber"]) : undefined;
  const carrierName = text(node["carrier"]) ?? text(node["provider"]);
  const trackingUrl = text(node["trackingUrl"]);
  const status = statusOf(node["deliveryStatus"]);
  const expectedFrom = text(node["expectedArrivalFrom"]);
  const expectedUntil = text(node["expectedArrivalUntil"]);
  return {
    trackingNumbers: tracking === undefined ? [] : [tracking],
    orderNumbers: orderNumber === undefined ? [] : [orderNumber],
    items,
    ...(carrierName === undefined ? {} : { carrierName }),
    ...(trackingUrl === undefined ? {} : { trackingUrl }),
    ...(status === undefined ? {} : { status }),
    ...(expectedFrom === undefined ? {} : { expectedFrom }),
    ...(expectedUntil === undefined ? {} : { expectedUntil }),
  };
}

function jsonLdBlocks(html: string): Json[] {
  const blocks: Json[] = [];
  const pattern =
    /<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu;
  for (const match of html.matchAll(pattern)) {
    try {
      blocks.push(JSON.parse(match[1] ?? "") as Json);
    } catch {
      // Broken markup in one mail is the sender's problem; the other blocks still count.
      continue;
    }
  }
  return blocks;
}

function itemprop(html: string, name: string): string | undefined {
  const tag = new RegExp(`<[^>]*\\bitemprop\\s*=\\s*["']${name}["'][^>]*>`, "iu").exec(html);
  if (tag === null) return undefined;
  const attribute = /\b(?:content|href)\s*=\s*["']([^"']*)["']/iu.exec(tag[0]);
  if (attribute?.[1] !== undefined) return decodeEntities(attribute[1]).trim() || undefined;
  const after = html.slice(tag.index + tag[0].length);
  const inner = /^([^<]*)/u.exec(after)?.[1];
  return inner === undefined ? undefined : decodeEntities(inner).trim() || undefined;
}

function fromMicrodata(html: string): SchemaOrgDelivery | null {
  if (!/itemtype\s*=\s*["'][^"']*ParcelDelivery["']/iu.test(html)) return null;
  const tracking = itemprop(html, "trackingNumber");
  const orderNumber = itemprop(html, "orderNumber");
  const trackingUrl = itemprop(html, "trackingUrl");
  const status = statusOf(itemprop(html, "deliveryStatus"));
  return {
    trackingNumbers: tracking === undefined ? [] : [tracking],
    orderNumbers: orderNumber === undefined ? [] : [orderNumber],
    items: [],
    ...(trackingUrl === undefined ? {} : { trackingUrl }),
    ...(status === undefined ? {} : { status }),
  };
}

export function extractSchemaOrg(html: string | undefined): SchemaOrgDelivery[] {
  if (!html?.includes("ParcelDelivery")) return [];
  const nodes: Record<string, Json>[] = [];
  for (const block of jsonLdBlocks(html)) collectDeliveries(block, nodes);
  const deliveries = nodes.map(fromJsonLd);
  const micro = deliveries.length === 0 ? fromMicrodata(html) : null;
  return micro === null ? deliveries : [micro];
}
