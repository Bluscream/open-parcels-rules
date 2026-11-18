import { z } from "zod";
import { identifierSchema } from "./common.ts";

export const KEY_SOURCES = ["website", "app"] as const;

export const carrierKeySchema = z.strictObject({
  carrier: identifierSchema.meta({ description: "Carrier id from carriers.yaml." }),
  name: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/u)
    .meta({ description: "What the consumer asks for, unique per carrier, e.g. api_key." }),
  purpose: z.string().min(1).meta({ description: "Where the carrier expects the value and why." }),
  source: z.enum(KEY_SOURCES).meta({
    description: "Where the value was read from: the public website or the carrier's app.",
  }),
  last_verified: z.iso.date().meta({ description: "Date the value was last seen working." }),
  value: z.string().min(1),
});

export const keysFileSchema = z
  .strictObject({
    keys: z.array(carrierKeySchema),
  })
  .meta({
    description:
      "Fixed public values carriers expect from every client (website or app keys, client ids, " +
      "app versions, User-Agents). Never a user's credentials.",
  });

export type CarrierKeyEntry = z.infer<typeof carrierKeySchema>;
export type KeysFile = z.infer<typeof keysFileSchema>;
