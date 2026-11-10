import { describe, expect, it } from "vitest";

import { calculateBillAmounts, getBillStatus } from "@/lib/bills";
import { billInputSchema } from "@/lib/validations/bill";

const validBill = {
  reason: "Electricity bill",
  totalAmount: "1250.50",
  paidAmount: "500.25",
  payBefore: "2026-12-15",
};

describe("bill calculations and validation", () => {
  it("calculates pending money exactly and derives each status", () => {
    expect(calculateBillAmounts("1250.50", "500.25")).toEqual({
      totalAmount: "1250.50",
      paidAmount: "500.25",
      pendingAmount: "750.25",
    });
    expect(getBillStatus("100.00", "0.00")).toBe("UNPAID");
    expect(getBillStatus("100.00", "25.00")).toBe("PARTIALLY_PAID");
    expect(getBillStatus("100.00", "100.00")).toBe("PAID");
  });

  it("rejects invalid money relationships and a missing deadline", () => {
    expect(billInputSchema.safeParse({ ...validBill, totalAmount: "0.00" }).success).toBe(false);
    expect(billInputSchema.safeParse({ ...validBill, paidAmount: "1250.51" }).success).toBe(false);
    expect(billInputSchema.safeParse({ ...validBill, payBefore: "" }).success).toBe(false);
  });
});
