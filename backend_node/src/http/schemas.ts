import { z } from "zod";

const requiredText = z.string().trim().min(1);

export const createRequestSchema = z
  .object({
    problem: requiredText,
  })
  .strict();

export const messageRequestSchema = z
  .object({
    message: requiredText,
  })
  .strict();

export const measurementRequestSchema = z
  .object({
    measurement_type: requiredText,
    value: z.number().refine((value) => Number.isFinite(value)),
    unit: requiredText,
    location: requiredText.max(200),
  })
  .strict();
