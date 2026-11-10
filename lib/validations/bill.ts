import { z } from "zod";

import { moneyToCents } from "@/lib/bills";

const ZERO_CENTS = BigInt(0);

const moneyInputSchema = z
  .string()
  .trim()
  .min(1, "Enter an amount.")
  .regex(/^\d{1,10}(\.\d{1,2})?$/, "Enter a valid amount with up to two decimal places.");

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export const billInputSchema = z
  .object({
    reason: z.string().trim().min(1, "Reason is required.").max(160, "Reason must be 160 characters or fewer."),
    totalAmount: moneyInputSchema,
    paidAmount: moneyInputSchema,
    payBefore: z.string().trim().refine(isIsoDate, "Enter a valid payment deadline."),
  })
  .superRefine((input, context) => {
    const totalAmount = moneyToCents(input.totalAmount);
    const paidAmount = moneyToCents(input.paidAmount);

    if (totalAmount <= ZERO_CENTS) {
      context.addIssue({
        code: "custom",
        path: ["totalAmount"],
        message: "Total amount must be greater than zero.",
      });
    }

    if (paidAmount > totalAmount) {
      context.addIssue({
        code: "custom",
        path: ["paidAmount"],
        message: "Paid amount cannot exceed the total amount.",
      });
    }
  });

export const billIdSchema = z.string().uuid("Bill id must be a valid UUID.");

export const billStatusSchema = z.enum(["UNPAID", "PARTIALLY_PAID", "PAID"]);

export const billsQuerySchema = z.object({
  search: z.string().trim().max(160).optional().default(""),
  status: billStatusSchema.optional(),
  sortDirection: z.enum(["asc", "desc"]).optional().default("asc"),
});

export type BillInput = z.infer<typeof billInputSchema>;
