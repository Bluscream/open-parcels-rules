import { z } from "zod";

/*
 * Tracking-number formats. The shape is deliberately the same as the community
 * tracking_number_data courier files, so our overlay files and the vendored upstream
 * files are read by one schema and one engine.
 */

const mod10Schema = z.strictObject({
  name: z.literal("mod10"),
  modulo: z.number().int().optional(),
  evens_multiplier: z.number().int().optional(),
  odds_multiplier: z.number().int().optional(),
  reverse: z.boolean().optional(),
});

const mod7Schema = z.strictObject({
  name: z.literal("mod7"),
  modulo: z.number().int().optional(),
});

const s10Schema = z.strictObject({
  name: z.literal("s10"),
  weightings: z.array(z.number().int()).optional(),
  modulo: z.number().int().optional(),
});

const luhnSchema = z.strictObject({
  name: z.literal("luhn"),
  modulo: z.number().int().optional(),
});

const mod3736Schema = z.strictObject({
  name: z.literal("mod_37_36"),
  modulo: z.number().int().optional(),
  alphabet: z.string().optional(),
});

const sumProductSchema = z.strictObject({
  name: z.literal("sum_product_with_weightings_and_modulo"),
  weightings: z.array(z.number().int()),
  modulo1: z.number().int(),
  modulo2: z.number().int(),
});

export const checksumSchema = z.discriminatedUnion("name", [
  mod10Schema,
  mod7Schema,
  s10Schema,
  luhnSchema,
  mod3736Schema,
  sumProductSchema,
]);

const lookupEntrySchema = z
  .record(z.string(), z.string().nullable())
  .refine((entry) => "matches" in entry || "matches_regex" in entry, {
    message: "A lookup entry needs `matches` or `matches_regex`.",
  })
  .meta({
    description:
      "One row of an additional lookup: `matches` (exact) or `matches_regex` (whole value), " +
      "plus descriptive string fields such as name, description, country or courier.",
  });

const additionalSchema = z.strictObject({
  name: z.string(),
  regex_group_name: z.string(),
  lookup: z.array(lookupEntrySchema),
});

const validationSchema = z.strictObject({
  checksum: checksumSchema.optional(),
  serial_number_format: z
    .strictObject({
      prepend_if: z.strictObject({
        matches_regex: z.string(),
        content: z.string(),
      }),
    })
    .optional(),
  additional: z
    .strictObject({
      exists: z.array(z.string()).meta({
        description: "Names of `additional` lookups that must find a row for the number to be valid.",
      }),
    })
    .optional(),
});

export const trackingNumberTypeSchema = z.strictObject({
  name: z.string(),
  id: z.string().optional(),
  description: z.string().optional(),
  regex: z.union([z.string(), z.array(z.string())]).meta({
    description:
      "Whitespace-tolerant pattern; an array is joined into one pattern. Named groups " +
      "SerialNumber and CheckDigit feed the checksum.",
  }),
  validation: validationSchema,
  tracking_url: z.string().nullable().optional(),
  glossary: z.record(z.string(), z.strictObject({ description: z.string() })).optional(),
  test_numbers: z.strictObject({
    valid: z.array(z.string()),
    invalid: z.array(z.string()),
  }),
  additional: z.array(additionalSchema).optional(),
});

export const courierFileSchema = z.strictObject({
  $schema: z.string().optional(),
  name: z.string(),
  courier_code: z.string(),
  tracking_numbers: z.array(trackingNumberTypeSchema),
});

export type Checksum = z.infer<typeof checksumSchema>;
export type TrackingNumberType = z.infer<typeof trackingNumberTypeSchema>;
export type CourierFile = z.infer<typeof courierFileSchema>;
