import type { Bill } from "@prisma/client";

import type { BillResponse, BillStatus, BillsSummary } from "@/types/bill";

const ZERO_CENTS = BigInt(0);
const CENTS_PER_RUPEE = BigInt(100);

export function moneyToCents(value: string) {
  const [whole, fraction = ""] = value.split(".");
  const paddedFraction = `${fraction}00`.slice(0, 2);

  return BigInt(whole) * CENTS_PER_RUPEE + BigInt(paddedFraction);
}

export function centsToMoney(cents: bigint) {
  const whole = cents / CENTS_PER_RUPEE;
  const fraction = (cents % CENTS_PER_RUPEE).toString().padStart(2, "0");

  return `${whole}.${fraction}`;
}

export function calculateBillAmounts(totalAmount: string, paidAmount: string) {
  const totalCents = moneyToCents(totalAmount);
  const paidCents = moneyToCents(paidAmount);

  return {
    totalAmount: centsToMoney(totalCents),
    paidAmount: centsToMoney(paidCents),
    pendingAmount: centsToMoney(totalCents - paidCents),
  };
}

export function getBillStatus(totalAmount: string, paidAmount: string): BillStatus {
  const totalCents = moneyToCents(totalAmount);
  const paidCents = moneyToCents(paidAmount);

  if (paidCents === ZERO_CENTS) {
    return "UNPAID";
  }

  return paidCents === totalCents ? "PAID" : "PARTIALLY_PAID";
}

export function serializeBill(bill: Bill): BillResponse {
  const totalAmount = bill.totalAmount.toFixed(2);
  const paidAmount = bill.paidAmount.toFixed(2);

  return {
    id: bill.id,
    reason: bill.reason,
    totalAmount,
    paidAmount,
    pendingAmount: bill.pendingAmount.toFixed(2),
    payBefore: bill.payBefore.toISOString().slice(0, 10),
    createdAt: bill.createdAt.toISOString(),
    updatedAt: bill.updatedAt.toISOString(),
    status: getBillStatus(totalAmount, paidAmount),
    task: {
      assigneeId: bill.taskAssigneeId,
      proposalId: bill.taskProposalId,
      stewardTaskId: bill.taskId,
      status: bill.taskStatus,
    },
  };
}

export function calculateBillsSummary(bills: BillResponse[]): BillsSummary {
  const amounts = bills.reduce(
    (summary, bill) => ({
      totalCents: summary.totalCents + moneyToCents(bill.totalAmount),
      paidCents: summary.paidCents + moneyToCents(bill.paidAmount),
      pendingCents: summary.pendingCents + moneyToCents(bill.pendingAmount),
      openBills: summary.openBills + (bill.status === "PAID" ? 0 : 1),
    }),
    { totalCents: ZERO_CENTS, paidCents: ZERO_CENTS, pendingCents: ZERO_CENTS, openBills: 0 },
  );

  return {
    totalAmount: centsToMoney(amounts.totalCents),
    paidAmount: centsToMoney(amounts.paidCents),
    pendingAmount: centsToMoney(amounts.pendingCents),
    openBills: amounts.openBills,
  };
}
