import { z } from "zod";
import { identifierSchema, parcelStatusSchema, regexFlagSchema } from "./common.ts";
import { mailEventSchema } from "./mail.ts";

const codeMatchSchema = z.strictObject({
  code: z.string().min(1).meta({ description: "Exact machine status code (compared trimmed)." }),
});

const codePrefixMatchSchema = z.strictObject({
  code_prefix: z.string().min(1).meta({
    description:
      "The code starts with this text (compared ignoring case). Tried after exact codes, in " +
      "file order.",
  }),
});

const fieldNameSchema = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_]*$/u)
  .meta({ description: "Name of a raw status field, as the carrier's payload calls it." });

const textMatchSchema = z.strictObject({
  text: z.string().min(1).meta({ description: "Regex searched in the status text." }),
  flags: z.array(regexFlagSchema).optional(),
  fields: z.record(fieldNameSchema, z.string().min(1)).optional().meta({
    description:
      "Only when every listed raw field also equals its value, e.g. { lang: fr } for a " +
      "sentence that exists in one page language only.",
  }),
});

const fieldsMatchSchema = z.strictObject({
  fields: z
    .record(fieldNameSchema, z.string().min(1))
    .refine((fields) => Object.keys(fields).length > 0, { message: "Name at least one field." })
    .meta({
      minProperties: 1,
      description:
        "Every listed field of the raw status equals its value (both trimmed, case kept). " +
        "Tried before codes and texts, in file order, so list the most specific entry first.",
    }),
});

export const statusMatchSchema = z.union([
  codeMatchSchema,
  codePrefixMatchSchema,
  textMatchSchema,
  fieldsMatchSchema,
]);

export const ignoreEntrySchema = z.strictObject({
  match: statusMatchSchema,
  event: mailEventSchema.meta({
    description: "What the value says instead of a parcel status, e.g. order_cancelled.",
  }),
  note: z.string().optional(),
});

export const statusEntrySchema = z.strictObject({
  match: statusMatchSchema,
  status: parcelStatusSchema,
  pickup: z.literal(true).optional().meta({
    description: "The parcel is going to, or waiting at, a pickup point or locker.",
  }),
  confirmed: z.boolean().optional().meta({
    description: "false marks a plausible guess not yet seen in real data. Defaults to true.",
  }),
  label: z.string().min(1).optional().meta({
    description:
      "A neutral English display text for the raw value, for carriers whose own wording can " +
      "carry personal data (a shop name, an address).",
  }),
  stage: z.number().int().min(0).optional().meta({
    description:
      "Order of this step in the carrier's journey (higher is later), for consumers that " +
      "must order events with the same time. Only meaningful within one table.",
  }),
  note: z.string().optional(),
});

const rawStatusSchema = z
  .strictObject({
    code: z.string().optional(),
    text: z.string().optional(),
    fields: z.record(fieldNameSchema, z.string()).optional(),
  })
  .refine(
    (raw) => raw.code !== undefined || raw.text !== undefined || raw.fields !== undefined,
    { message: "A status input needs a code, a text or fields." },
  );

export const statusTestSchema = z.strictObject({
  input: rawStatusSchema,
  status: parcelStatusSchema.nullable().meta({ description: "null: the input must stay unmapped." }),
  pickup: z.boolean().optional(),
  stage: z.number().int().optional(),
  label: z.string().optional(),
  ignored: mailEventSchema.nullable().optional().meta({
    description: "The event an `ignore` entry gives the input; null: no ignore entry matches.",
  }),
});

export const statusFileSchema = z.strictObject({
  carrier: identifierSchema,
  entries: z.array(statusEntrySchema).min(1).meta({
    description:
      "Field entries are tried first, then exact codes, then code prefixes, then texts; " +
      "within each kind the first hit in file order wins.",
  }),
  ignore: z
    .array(ignoreEntrySchema)
    .default([])
    .meta({
      description:
        "Values that say the item is no parcel at all (a cancelled or refunded order line). " +
        "Matched like entries, but kept apart from them: mapping never returns these.",
    }),
  tests: z.array(statusTestSchema).min(1),
});

export type StatusMatch = z.infer<typeof statusMatchSchema>;
export type IgnoreEntry = z.infer<typeof ignoreEntrySchema>;
export type StatusEntry = z.infer<typeof statusEntrySchema>;
export type StatusFile = z.infer<typeof statusFileSchema>;
export type StatusTest = z.infer<typeof statusTestSchema>;
