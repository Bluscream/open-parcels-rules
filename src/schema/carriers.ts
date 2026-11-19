import { z } from "zod";
import { identifierSchema, regexSpecSchema } from "./common.ts";

const countrySchema = z
  .string()
  .regex(/^[A-Z]{2}$/u)
  .meta({ description: "ISO 3166-1 alpha-2 country code." });

const domainSchema = z
  .string()
  .regex(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/u)
  .meta({ description: "A mail or web domain; subdomains match too." });

export const carrierSchema = z.strictObject({
  id: identifierSchema,
  name: z.string().min(1),
  aliases: z.array(z.string().min(1)).default([]),
  countries: z.array(countrySchema).default([]),
  domains: z.array(domainSchema).default([]).meta({
    description: "Domains the carrier sends mail from or hosts tracking pages on.",
  }),
  courier_codes: z.array(z.string()).default([]).meta({
    description:
      "courier_code values of tracking-number files whose formats belong to this carrier " +
      "(the carrier's own id is implied).",
  }),
  upu_countries: z.array(countrySchema).default([]).meta({
    description: "Countries whose UPU S10 numbers (e.g. RR123456785DE) this carrier delivers.",
  }),
  tracking_urls: z
    .record(
      z.string().regex(/^(default|[a-z]{2,3}(-[A-Z]{2})?)$/u),
      z.string().regex(/^https:\/\/\S*\{tracking_number\}\S*$/u),
    )
    .default({})
    .meta({
      description:
        "Tracking page templates keyed by locale ('default', a language such as 'de', or a " +
        "full tag such as 'de-AT' for a regional site). {tracking_number} is replaced by the " +
        "URL-encoded number; any other {name} (lower-case, e.g. {postcode}) by the value the " +
        "caller passes, and a template whose placeholders are not all given is skipped.",
    }),
  tracking_number_pattern: regexSpecSchema.optional().meta({
    description:
      "Shape of a number the carrier's own tracker accepts, anchored with ^ and $: a " +
      "plausibility check before a lookup is sent, not detection (see tracking-numbers).",
  }),
  crossref: z
    .record(z.string(), z.string())
    .default({})
    .meta({ description: "Identifiers of this carrier in other systems, e.g. 17track: '100001'." }),
});

export const carriersFileSchema = z.strictObject({
  carriers: z.array(carrierSchema),
});

export type CarrierEntry = z.infer<typeof carrierSchema>;
export type CarriersFile = z.infer<typeof carriersFileSchema>;
