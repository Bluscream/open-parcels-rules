import type { ParcelStatus, OrderStatus, ReturnStatus, DunningStatus } from "./types";

export const DELIVERY_WINDOW_REGEX = /(?:zwischen|between|from|von)?\s*(\d{1,2}:\d{2})\s*(am|pm)?\s*(?:-|und|and|bis|to)\s*(\d{1,2}:\d{2})\s*(am|pm)?(?:\s*uhr)?/i;

export const MONTHS_MAP: Record<string, number> = {
  january: 0, jan: 0, february: 1, feb: 1, march: 2, mar: 2, april: 3, apr: 3,
  may: 4, june: 5, jun: 5, july: 6, jul: 6, august: 7, aug: 7, september: 8,
  sep: 8, sept: 8, october: 9, oct: 9, november: 10, nov: 10, december: 11, dec: 11,
  gennaio: 0, febbraio: 1, marzo: 2, aprile: 3, maggio: 4, giugno: 5, luglio: 6,
  agosto: 7, settembre: 8, ottobre: 9, novembre: 10, dicembre: 11,
  januar: 0, februar: 1, märz: 2, maerz: 2, mai: 4, juni: 5, juli: 6, dezember: 11,
  styczeń: 0, stycznia: 0, luty: 1, lutego: 1, marzec: 2, marca: 2, kwiecień: 3,
  kwietnia: 3, maja: 4, czerwiec: 5, czerwca: 5, lipiec: 6, lipca: 6, sierpień: 7,
  sierpnia: 7, wrzesień: 8, września: 8, październik: 9, października: 9,
  listopad: 10, listopada: 10, grudzień: 11, grudnia: 11
};

export const PARCEL_KEYWORDS: Record<Exclude<ParcelStatus, "unknown">, string[]> = {
  delivered: ["delivered", "zugestellt", "geliefert", "doręczona", "odbioru", "consegna effettuata"],
  exception: ["exception", "running late", "delay", "delayed", "verspätung"],
  arriving: ["arriving", "out for delivery", "scheduled for delivery", "dostawa dzisiaj", "kommt heute", "dziś doręczamy", "arriverà", "incoming"],
  sent: ["shipped", "sent", "on its way", "w drodze", "nadana", "versendet"],
  ordered: ["ordered", "bestellt", "order confirmation", "potwierdzenie zamówienia"]
};

export const ORDER_KEYWORDS: Record<Exclude<OrderStatus, "unknown">, string[]> = {
  cancelled: ["cancel", "storniert"],
  shipped: ["shipped", "versandt", "spedita"],
  processing: ["processing", "bearbeitet"],
  confirmed: ["confirm", "bestätigt", "vielen dank für ihre bestellung"],
  placed: ["order", "bestellt"]
};

export const RETURN_KEYWORDS: Record<Exclude<ReturnStatus, "unknown">, string[]> = {
  rejected: ["reject", "odrzucony"],
  refunded: ["refunded", "rückzahlung", "zwrot środków"],
  processed: ["processed", "przetworzony"],
  received: ["received", "odebrany"],
  in_transit: ["in transit", "w drodze"],
  initiated: ["return label", "zwrot", "initiated"]
};

export const DUNNING_KEYWORDS: Record<Exclude<DunningStatus, "unknown">, string[]> = {
  reminder: ["zahlungserinnerung", "erinnerung", "reminder"],
  warning: ["mahnung", "letzte mahnung", "warning", "overdue"],
  collection: ["inkasso", "collection"]
};
