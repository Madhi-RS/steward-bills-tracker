import { notFound, redirect } from "next/navigation";

import { StatusBadge } from "@/components/bills/status-badge";
import { activeStewardContext, getAuthenticatedSession, mayManageBills } from "@/lib/auth";
import { serializeBill } from "@/lib/bills";
import { db } from "@/lib/db";
import { formatBillDate, formatIndianRupees } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function BillRecordPage({ params }: { params: Promise<{ recordRef: string }> }) {
  const authentication = await getAuthenticatedSession();
  if (!authentication.session) redirect("/auth/login");

  const { recordRef } = await params;
  const match = /^bill:([0-9a-f-]{36})$/i.exec(recordRef);
  if (!match) notFound();

  const context = activeStewardContext(authentication.session);
  const bill = await db.bill.findFirst({
    where: mayManageBills(context.role)
      ? { id: match[1], businessId: context.businessId }
      : { id: match[1], businessId: context.businessId, taskAssigneeId: context.personId },
  });
  if (!bill) notFound();

  const invoice = serializeBill(bill);
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-10">
      <article className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <header className="border-b border-slate-200 bg-slate-50 px-6 py-5">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Assigned invoice</p>
          <h1 className="mt-2 text-2xl font-bold text-slate-950">{invoice.reason}</h1>
        </header>
        <dl className="grid gap-5 p-6 sm:grid-cols-2">
          <div><dt className="text-sm text-slate-500">Total</dt><dd className="mt-1 text-lg font-semibold">{formatIndianRupees(invoice.totalAmount)}</dd></div>
          <div><dt className="text-sm text-slate-500">Pending</dt><dd className="mt-1 text-lg font-semibold">{formatIndianRupees(invoice.pendingAmount)}</dd></div>
          <div><dt className="text-sm text-slate-500">Pay before</dt><dd className="mt-1 font-medium">{formatBillDate(invoice.payBefore)}</dd></div>
          <div><dt className="text-sm text-slate-500">Payment status</dt><dd className="mt-2"><StatusBadge status={invoice.status} /></dd></div>
          <div className="sm:col-span-2"><dt className="text-sm text-slate-500">Steward task</dt><dd className="mt-1 font-medium">{invoice.task.status ?? "Pending assignment"}</dd></div>
        </dl>
        <p className="border-t border-slate-200 px-6 py-4 text-sm text-slate-600">This page only displays the invoice. Complete the task in Steward after payment is confirmed.</p>
      </article>
    </main>
  );
}
