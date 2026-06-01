// ─── Shared primitives ────────────────────────────────────────────────────────

export interface EmailData {
  from: string;
  subject: string;
  bodyPlain: string;
  bodyHtml?: string;
}

export interface DeliveryWindow {
  raw: string;
  /** Start time in 24h format (HH:MM) */
  startTime?: string;
  /** End time in 24h format (HH:MM) */
  endTime?: string;
}

export interface OrderItem {
  name: string;
  quantity?: number;
  price?: number;
}

export interface ParserHelpers {
  testRegex: (text: string, pattern: string) => boolean;
  extractRegex: (text: string, pattern: string, groupIndexOrName?: number | string) => string | undefined;
  extractAllRegex: (text: string, pattern: string, groupName?: string) => string[];
  getParcelStatusFromKeywords: (subject: string, body: string) => ParcelStatus;
  getOrderStatusFromKeywords: (subject: string, body: string) => OrderStatus;
  getReturnStatusFromKeywords: (subject: string, body: string) => ReturnStatus;
  getDunningStatusFromKeywords: (subject: string, body: string) => DunningStatus;
  parseDeliveryWindow: (text: string) => DeliveryWindow | undefined;
  monthsMap: Record<string, number>;
}

/** Base metadata for any rule — also passed to custom parse() callbacks */
export interface RuleMetadata {
  id: string;
  name: string;
  /** Domain list — may contain regex: prefixed patterns */
  domains: string[];
  /** Object of regex patterns defined by each rule */
  patterns: Record<string, string>;
}

// ─── Parcel ──────────────────────────────────────────────────────────────────

export type ParcelStatus =
  | "ordered"
  | "sent"
  | "arriving"
  | "delivered"
  | "exception"
  | "unknown";

export interface ParcelParseResult {
  status: ParcelStatus;
  trackingNumbers?: string[];
  orderNumbers?: string[];
  deliveryDate?: Date;
  itemNames?: string[];
  secretCode?: string;
  secretType?: "locker" | "courier" | "pickup" | string;
  carrier?: string;
  deliveryLocation?: string;
  trackingUrl?: string;
  deliveryWindow?: DeliveryWindow;
  weight?: string;
}

export interface ParcelRule extends RuleMetadata {
  parse: (email: EmailData, helpers: ParserHelpers, meta: RuleMetadata) => ParcelParseResult | null;
}

/** Engine result — ParcelParseResult enriched with matched courier id */
export interface MailParcelResult extends ParcelParseResult {
  courier: string;
}

// ─── Order ───────────────────────────────────────────────────────────────────

export type OrderStatus =
  | "placed"
  | "confirmed"
  | "processing"
  | "shipped"
  | "cancelled"
  | "unknown";

export interface OrderParseResult {
  status: OrderStatus;
  orderNumbers?: string[];
  itemNames?: string[];
  totalAmount?: number;
  currency?: string;
  estimatedDelivery?: Date;
  trackingNumbers?: string[];
  seller?: string;
  items?: OrderItem[];
  paymentMethod?: string;
  shippingAddress?: string;
  shippingCost?: number;
}

export interface OrderRule extends RuleMetadata {
  parse: (email: EmailData, helpers: ParserHelpers, meta: RuleMetadata) => OrderParseResult | null;
}

/** Engine result — OrderParseResult enriched with matched courier id */
export interface MailOrderResult extends OrderParseResult {
  courier: string;
}

// ─── Return / Refund ─────────────────────────────────────────────────────────

export type ReturnStatus =
  | "initiated"
  | "in_transit"
  | "received"
  | "processed"
  | "refunded"
  | "rejected"
  | "unknown";

export interface ReturnParseResult {
  status: ReturnStatus;
  orderNumbers?: string[];
  returnId?: string;
  reason?: string;
  refundAmount?: number;
  currency?: string;
  refundMethod?: string;
  deadline?: Date;
  itemNames?: string[];
  trackingNumbers?: string[];
  labelUrl?: string;
  returnCarrier?: string;
  returnAddress?: string;
  dropOffDeadline?: Date;
}

export interface ReturnRule extends RuleMetadata {
  parse: (email: EmailData, helpers: ParserHelpers, meta: RuleMetadata) => ReturnParseResult | null;
}

/** Engine result — ReturnParseResult enriched with matched courier id */
export interface MailReturnResult extends ReturnParseResult {
  courier: string;
}

// ─── Dunning ─────────────────────────────────────────────────────────────────

export type DunningStatus = "reminder" | "warning" | "collection" | "unknown";

export interface DunningParseResult {
  status: DunningStatus;
  orderNumbers?: string[];
  dunningId?: string;
  amountDue?: number;
  currency?: string;
  dueDate?: Date;
  originalDueDate?: Date;
  merchant?: string;
}

export interface DunningRule extends RuleMetadata {
  parse: (email: EmailData, helpers: ParserHelpers, meta: RuleMetadata) => DunningParseResult | null;
}

/** Engine result — DunningParseResult enriched with matched courier id */
export interface MailDunningResult extends DunningParseResult {
  courier: string;
}
