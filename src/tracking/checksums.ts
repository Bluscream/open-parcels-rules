import type { Checksum } from "../schema/tracking.ts";

const DEFAULT_S10_WEIGHTS = [8, 6, 4, 2, 3, 5, 9, 7] as const;
const BASE36 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";

function digitValue(char: string): number {
  const code = char.charCodeAt(0);
  if (code >= 48 && code <= 57) return code - 48;
  // Letters inside a mod10 serial (UPS) count as (ASCII - 3) mod 10.
  return (code - 3) % 10;
}

function mod10(serial: string, check: string, spec: Extract<Checksum, { name: "mod10" }>): boolean {
  const chars = spec.reverse === true ? Array.from(serial).reverse() : Array.from(serial);
  let total = 0;
  chars.forEach((char, index) => {
    let value = digitValue(char);
    if (spec.odds_multiplier !== undefined && index % 2 === 1) value *= spec.odds_multiplier;
    else if (spec.evens_multiplier !== undefined && index % 2 === 0) value *= spec.evens_multiplier;
    total += value;
  });
  const modulo = spec.modulo ?? 10;
  const expected = (modulo - (total % modulo)) % modulo;
  return String(expected) === check;
}

function mod7(serial: string, check: string, modulo: number): boolean {
  let remainder = 0;
  for (const char of serial) remainder = (remainder * 10 + digitValue(char)) % modulo;
  return String(remainder) === check;
}

function s10(serial: string, check: string, spec: Extract<Checksum, { name: "s10" }>): boolean {
  const weights = spec.weightings ?? DEFAULT_S10_WEIGHTS;
  const modulo = spec.modulo ?? 11;
  let total = 0;
  Array.from(serial).forEach((char, index) => {
    total += digitValue(char) * (weights[index] ?? 0);
  });
  const remainder = total % modulo;
  let expected = modulo - remainder;
  if (remainder === 0) expected = 5;
  else if (remainder === 1) expected = 0;
  return String(expected) === check;
}

function luhn(serial: string, check: string): boolean {
  // The check digit is appended to the serial, so the rightmost serial digit is doubled.
  let total = 0;
  Array.from(serial)
    .reverse()
    .forEach((char, index) => {
      let value = digitValue(char);
      if (index % 2 === 0) {
        value *= 2;
        if (value > 9) value -= 9;
      }
      total += value;
    });
  return String((10 - (total % 10)) % 10) === check;
}

function mod3736(
  serial: string,
  check: string,
  spec: Extract<Checksum, { name: "mod_37_36" }>,
): boolean {
  // ISO/IEC 7064 MOD 37,36 (hybrid system) over a 0-9A-Z alphabet.
  const alphabet = spec.alphabet ?? BASE36;
  const modulo = spec.modulo ?? 36;
  let product = modulo;
  for (const char of serial) {
    const value = alphabet.indexOf(char);
    if (value < 0) return false;
    let sum = (product + value) % modulo;
    if (sum === 0) sum = modulo;
    product = (sum * 2) % (modulo + 1);
  }
  const expected = (modulo + 1 - product) % modulo;
  return alphabet[expected] === check;
}

function sumProduct(
  serial: string,
  check: string,
  spec: Extract<Checksum, { name: "sum_product_with_weightings_and_modulo" }>,
): boolean {
  let total = 0;
  Array.from(serial).forEach((char, index) => {
    total += digitValue(char) * (spec.weightings[index] ?? 0);
  });
  return String((total % spec.modulo1) % spec.modulo2) === check;
}

/** Validates `check` against `serial` (both already stripped of whitespace and upper-cased). */
export function verifyChecksum(spec: Checksum, serial: string, check: string): boolean {
  switch (spec.name) {
    case "mod10":
      return mod10(serial, check, spec);
    case "mod7":
      return mod7(serial, check, spec.modulo ?? 7);
    case "s10":
      return s10(serial, check, spec);
    case "luhn":
      return luhn(serial, check);
    case "mod_37_36":
      return mod3736(serial, check, spec);
    case "sum_product_with_weightings_and_modulo":
      return sumProduct(serial, check, spec);
  }
}

/** How much a passing checksum says about a candidate (a 1-in-7 check proves little). */
export function checksumStrength(spec: Checksum | undefined): number {
  if (spec === undefined) return 0;
  switch (spec.name) {
    case "mod7":
      return 0.1;
    case "s10":
    case "mod_37_36":
      return 0.4;
    case "mod10":
    case "luhn":
    case "sum_product_with_weightings_and_modulo":
      return 0.3;
  }
}
