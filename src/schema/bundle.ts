import { z } from "zod";
import { carriersFileSchema } from "./carriers.ts";
import { localeFileSchema } from "./locale.ts";
import { mailRuleSchema } from "./mail.ts";
import { statusFileSchema } from "./status.ts";
import { courierFileSchema } from "./tracking.ts";

export const trackingSourceSchema = z.strictObject({
  origin: z.enum(["vendor", "overlay"]),
  file: z.string(),
  courier: courierFileSchema,
});

/** Everything the engine needs, as written to dist/bundle.json by the build. */
export const bundleSchema = z.strictObject({
  format: z.literal(1),
  version: z.string(),
  carriers: carriersFileSchema.shape.carriers,
  tracking: z.array(trackingSourceSchema),
  status: z.array(statusFileSchema.omit({ tests: true })),
  locales: z.array(localeFileSchema.omit({ tests: true })),
  mail: z.array(mailRuleSchema.omit({ tests: true })),
});

export type Bundle = z.infer<typeof bundleSchema>;
export type BundleInput = z.input<typeof bundleSchema>;
export type TrackingSource = z.infer<typeof trackingSourceSchema>;
