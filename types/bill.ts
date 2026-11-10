export const billStatuses = ["UNPAID", "PARTIALLY_PAID", "PAID"] as const;

export type BillStatus = (typeof billStatuses)[number];

export type BillResponse = {
  id: string;
  reason: string;
  totalAmount: string;
  paidAmount: string;
  pendingAmount: string;
  payBefore: string;
  createdAt: string;
  updatedAt: string;
  status: BillStatus;
  task: {
    assigneeId: string | null;
    proposalId: string | null;
    stewardTaskId: string | null;
    status: string | null;
  };
};

export type BillsSummary = {
  totalAmount: string;
  paidAmount: string;
  pendingAmount: string;
  openBills: number;
};

export type BillsListResponse = {
  bills: BillResponse[];
  summary: BillsSummary;
};
