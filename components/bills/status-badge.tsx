import type { BillStatus } from "@/types/bill";

const statusStyles: Record<BillStatus, string> = {
  UNPAID: "bg-rose-50 text-rose-700 ring-rose-600/20",
  PARTIALLY_PAID: "bg-amber-50 text-amber-700 ring-amber-600/20",
  PAID: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
};

const statusLabels: Record<BillStatus, string> = {
  UNPAID: "Unpaid",
  PARTIALLY_PAID: "Partially paid",
  PAID: "Paid",
};

export function StatusBadge({ status }: { status: BillStatus }) {
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${statusStyles[status]}`}>
      {statusLabels[status]}
    </span>
  );
}
