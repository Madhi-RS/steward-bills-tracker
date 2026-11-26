import { formatBillDate, formatIndianRupees } from "@/lib/format";
import type { BillResponse } from "@/types/bill";

import { StatusBadge } from "./status-badge";

type BillsTableProps = {
  bills: BillResponse[];
  canManage: boolean;
  onAssign: (bill: BillResponse) => void;
  onEdit: (bill: BillResponse) => void;
  onDelete: (bill: BillResponse) => void;
  selectedBillIds: string[];
  onSelectionChange: (ids: string[]) => void;
};

function canAssignTask(bill: BillResponse) {
  return !bill.task.proposalId || ["REJECTED", "DROPPED", "COMPLETED"].includes(bill.task.status ?? "");
}

function deadlineLabel(bill: BillResponse) {
  if (bill.status === "PAID") {
    return null;
  }

  const today = new Date().toISOString().slice(0, 10);
  if (bill.payBefore < today) {
    return "Overdue";
  }

  const days = Math.ceil((Date.parse(`${bill.payBefore}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
  if (days <= 7) {
    return days === 0 ? "Due today" : `Due in ${days}d`;
  }

  return null;
}

function rowClassName(bill: BillResponse) {
  const deadline = deadlineLabel(bill);
  if (deadline === "Overdue") {
    return "bg-rose-50/60";
  }
  if (deadline) {
    return "bg-amber-50/60";
  }
  return "bg-white";
}

function Actions({ bill, canManage, onAssign, onEdit, onDelete }: Pick<BillsTableProps, "canManage" | "onAssign" | "onEdit" | "onDelete"> & { bill: BillResponse }) {
  if (!canManage) return <span className="text-xs font-medium text-slate-500">Assigned to you</span>;
  return (
    <div className="flex items-center gap-2">
      <button className="rounded-md px-2.5 py-1.5 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:text-slate-400" disabled={!canAssignTask(bill)} onClick={() => onAssign(bill)} type="button">
        {bill.task.proposalId ? "Reassign" : "Assign"}
      </button>
      <button className="rounded-md px-2.5 py-1.5 text-sm font-semibold text-sky-700 hover:bg-sky-50" onClick={() => onEdit(bill)} type="button">
        Edit
      </button>
      <button className="rounded-md px-2.5 py-1.5 text-sm font-semibold text-rose-700 hover:bg-rose-50" onClick={() => onDelete(bill)} type="button">
        Delete
      </button>
    </div>
  );
}

export function BillsTable({ bills, canManage, onAssign, onEdit, onDelete, selectedBillIds, onSelectionChange }: BillsTableProps) {
  const selected = new Set(selectedBillIds);
  const assignableBills = bills.filter(canAssignTask);
  const allAssignableSelected = assignableBills.length > 0 && assignableBills.every((bill) => selected.has(bill.id));

  function toggleSelection(billId: string, checked: boolean) {
    if (checked) {
      if (selected.size >= 25) return;
      onSelectionChange([...selected, billId]);
      return;
    }
    onSelectionChange(selectedBillIds.filter((id) => id !== billId));
  }

  function toggleAll(checked: boolean) {
    const visibleIds = new Set(assignableBills.map((bill) => bill.id));
    if (!checked) {
      onSelectionChange(selectedBillIds.filter((id) => !visibleIds.has(id)));
      return;
    }
    onSelectionChange([...new Set([...selectedBillIds, ...assignableBills.map((bill) => bill.id)])].slice(0, 25));
  }

  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="min-w-full divide-y divide-slate-200 text-left">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              {canManage ? <th className="w-12 px-3 py-3 font-semibold"><input aria-label="Select all assignable bills" checked={allAssignableSelected} onChange={(event) => toggleAll(event.target.checked)} type="checkbox" /></th> : null}
              <th className="px-5 py-3 font-semibold">Reason</th>
              <th className="px-5 py-3 font-semibold">Total</th>
              <th className="px-5 py-3 font-semibold">Paid</th>
              <th className="px-5 py-3 font-semibold">Pending</th>
              <th className="px-5 py-3 font-semibold">Pay before</th>
              <th className="px-5 py-3 font-semibold">Status</th>
              <th className="px-5 py-3 font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {bills.map((bill) => {
              const deadline = deadlineLabel(bill);
              return (
                <tr className={rowClassName(bill)} key={bill.id}>
                  {canManage ? <td className="px-3 py-4"><input aria-label={`Select ${bill.reason}`} checked={selected.has(bill.id)} disabled={!canAssignTask(bill) || (!selected.has(bill.id) && selected.size >= 25)} onChange={(event) => toggleSelection(bill.id, event.target.checked)} type="checkbox" /></td> : null}
                  <td className="px-5 py-4 font-medium text-slate-900">{bill.reason}</td>
                  <td className="px-5 py-4 text-slate-700">{formatIndianRupees(bill.totalAmount)}</td>
                  <td className="px-5 py-4 text-slate-700">{formatIndianRupees(bill.paidAmount)}</td>
                  <td className="px-5 py-4 font-semibold text-slate-900">{formatIndianRupees(bill.pendingAmount)}</td>
                  <td className="px-5 py-4 text-slate-700">
                    <div>{formatBillDate(bill.payBefore)}</div>
                    {deadline ? <div className={deadline === "Overdue" ? "mt-1 text-xs font-semibold text-rose-700" : "mt-1 text-xs font-semibold text-amber-700"}>{deadline}</div> : null}
                  </td>
                  <td className="px-5 py-4"><StatusBadge status={bill.status} />{bill.task.status ? <div className="mt-1 text-xs font-medium text-slate-500">Task: {bill.task.status.replaceAll("_", " ")}</div> : null}</td>
                  <td className="px-5 py-4"><Actions bill={bill} canManage={canManage} onAssign={onAssign} onDelete={onDelete} onEdit={onEdit} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="divide-y divide-slate-200 md:hidden">
        {bills.map((bill) => {
          const deadline = deadlineLabel(bill);
          return (
            <article className={`p-5 ${rowClassName(bill)}`} key={bill.id}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  {canManage ? <input aria-label={`Select ${bill.reason}`} checked={selected.has(bill.id)} disabled={!canAssignTask(bill) || (!selected.has(bill.id) && selected.size >= 25)} onChange={(event) => toggleSelection(bill.id, event.target.checked)} type="checkbox" /> : null}
                  <h3 className="font-semibold text-slate-950">{bill.reason}</h3>
                </div>
                <StatusBadge status={bill.status} />
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div><dt className="text-slate-500">Total</dt><dd className="mt-1 font-medium">{formatIndianRupees(bill.totalAmount)}</dd></div>
                <div><dt className="text-slate-500">Pending</dt><dd className="mt-1 font-semibold">{formatIndianRupees(bill.pendingAmount)}</dd></div>
                <div><dt className="text-slate-500">Paid</dt><dd className="mt-1 font-medium">{formatIndianRupees(bill.paidAmount)}</dd></div>
                <div><dt className="text-slate-500">Pay before</dt><dd className="mt-1 font-medium">{formatBillDate(bill.payBefore)}</dd></div>
              </dl>
              {deadline ? <p className={deadline === "Overdue" ? "mt-4 text-sm font-semibold text-rose-700" : "mt-4 text-sm font-semibold text-amber-700"}>{deadline}</p> : null}
              {bill.task.status ? <p className="mt-3 text-xs font-medium text-slate-500">Steward task: {bill.task.status.replaceAll("_", " ")}</p> : null}
              <div className="mt-4"><Actions bill={bill} canManage={canManage} onAssign={onAssign} onDelete={onDelete} onEdit={onEdit} /></div>
            </article>
          );
        })}
      </div>
    </>
  );
}
