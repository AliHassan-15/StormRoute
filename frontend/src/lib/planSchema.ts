import { z } from "zod";

import { placeSchema } from "@/api/schemas";

/** Client-side form validation (D14). */
export const planFormSchema = z
  .object({
    origin: placeSchema,
    destination: placeSchema,
    departure: z.string().min(1),
    loadLb: z.number().min(0).max(200_000),
    interval: z.union([
      z.literal("auto"),
      z.literal(10),
      z.literal(25),
      z.literal(50),
    ]),
  })
  .superRefine((data, ctx) => {
    const dep = Date.parse(data.departure);
    if (!Number.isFinite(dep)) {
      ctx.addIssue({
        code: "custom",
        path: ["departure"],
        message: "Departure must be a valid date/time with offset.",
      });
      return;
    }
    const now = Date.now();
    const earliest = now - 60 * 60 * 1000;
    const latest = now + 14 * 24 * 60 * 60 * 1000;
    if (dep < earliest) {
      ctx.addIssue({
        code: "custom",
        path: ["departure"],
        message: "Departure cannot be more than 1 hour in the past.",
      });
    }
    if (dep > latest) {
      ctx.addIssue({
        code: "custom",
        path: ["departure"],
        message: "Departure must be within the next 14 days.",
      });
    }
  });

export type PlanFormValues = z.infer<typeof planFormSchema>;

export function isPlanFormValid(values: {
  origin: unknown;
  destination: unknown;
  departure: string | null;
  loadLb: number;
  interval: unknown;
}): boolean {
  return planFormSchema.safeParse({
    origin: values.origin,
    destination: values.destination,
    departure: values.departure ?? "",
    loadLb: values.loadLb,
    interval: values.interval,
  }).success;
}
