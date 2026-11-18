import { z } from "zod";
import { identifierSchema, parcelStatusSchema, regexFlagSchema } from "./common.ts";

const codeMatchSchema = z.strictObject({
  code: z.string().min(1).meta({ description: "Exact machine status code (compared trimmed)." }),
});

const textMatchSchema = z.strictObject({
  text: z.string().min(1).meta({ description: "Regex searched in the status text." }),
  flags: z.array(regexFlagSchema).optional(),
});

export const statusEntrySchema = z.strictObject({
  match: z.union([codeMatchSchema, textMatchSchema]),
  status: parcelStatusSchema,
  pickup: z.literal(true).optional().meta({
    description: "The parcel is going to, or waiting at, a pickup point or locker.",
  }),
  confirmed: z.boolean().optional().meta({
    description: "false marks a plausible guess not yet seen in real data. Defaults to true.",
  }),
  note: z.string().optional(),
});

const rawStatusSchema = z
  .strictObject({
    code: z.string().optional(),
    text: z.string().optional(),
  })
  .refine((raw) => raw.code !== undefined || raw.text !== undefined, {
    message: "A status input needs a code or a text.",
  });

export const statusTestSchema = z.strictObject({
  input: rawStatusSchema,
  status: parcelStatusSchema.nullable().meta({ description: "null: the input must stay unmapped." }),
  pickup: z.boolean().optional(),
});

export const statusFileSchema = z.strictObject({
  carrier: identifierSchema,
  entries: z.array(statusEntrySchema).min(1).meta({
    description: "Checked in order; code entries are tried before text entries, first hit wins.",
  }),
  tests: z.array(statusTestSchema).min(1),
});

export type StatusEntry = z.infer<typeof statusEntrySchema>;
export type StatusFile = z.infer<typeof statusFileSchema>;
export type StatusTest = z.infer<typeof statusTestSchema>;
