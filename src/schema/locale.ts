import { z } from "zod";
import { regexLikeSchema } from "./common.ts";

const wordSchema = z
  .string()
  .min(1)
  .refine((word) => word === word.toLowerCase(), { message: "Words are written in lower case." });

const wordListSchema = z.array(wordSchema);

export const arrivalExpectSchema = z.strictObject({
  from: z.string(),
  to: z.string(),
  all_day: z.boolean(),
});

export const localeTestSchema = z.strictObject({
  text: z.string(),
  now: z.iso.datetime({ offset: true }),
  time_zone: z.string(),
  expect: arrivalExpectSchema.nullable().meta({ description: "null: the text must not parse." }),
});

export const localeFileSchema = z.strictObject({
  lang: z.string().regex(/^[a-z]{2,3}$/u),
  months: z.array(wordListSchema.min(1)).length(12).meta({
    description: "Twelve lists (January first) of month names and abbreviations.",
  }),
  weekdays: z.array(wordListSchema.min(1)).length(7).meta({
    description:
      "Seven lists (Monday first) of weekday names. Keep risky short forms out (German 'so', 'do').",
  }),
  relative_days: z.record(wordSchema, z.number().int().min(-7).max(7)).meta({
    description: "Words for a day relative to today, e.g. tomorrow: 1.",
  }),
  lead_ins: wordListSchema.meta({
    description:
      "Words that announce an arrival. A bare relative day or weekday only counts after one.",
  }),
  range_separators: wordListSchema.meta({
    description: "Words that join the two ends of a range (dashes are always accepted).",
  }),
  window_openers: wordListSchema.meta({
    description: "Words that may open a time window, e.g. between, zwischen.",
  }),
  deadline_words: wordListSchema.meta({
    description: "Words before a single time meaning 'at the latest', e.g. by, bis.",
  }),
  point_words: wordListSchema.meta({
    description: "Words before a single time meaning 'at', e.g. um, at.",
  }),
  hour_words: wordListSchema.meta({
    description: "Words after a time that mark it as a clock time, e.g. uhr, o'clock.",
  }),
  am_markers: wordListSchema,
  pm_markers: wordListSchema,
  negatives: z.array(regexLikeSchema).meta({
    description: "If any matches (case-insensitively), the text announces no arrival at all.",
  }),
  cut_markers: z.array(regexLikeSchema).meta({
    description:
      "Text from the first match onwards is ignored (e.g. 'previously expected ...').",
  }),
  tracking_keywords: wordListSchema.meta({
    description:
      "Words that introduce a tracking number in prose; used by the mail fallback detector.",
  }),
  tests: z.array(localeTestSchema).min(1),
});

export type LocaleFile = z.infer<typeof localeFileSchema>;
export type LocaleTest = z.infer<typeof localeTestSchema>;
