"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { formatIndianRupees } from "@/lib/format";
import type { BillResponse, BillsListResponse, BillStatus } from "@/types/bill";

import { BillFormDialog } from "./bill-form-dialog";
import { BillsTable } from "./bills-table";
import { SummaryCard } from "./summary-card";
import { TaskAssignmentDialog } from "./task-assignment-dialog";

type StatusFilter = "ALL" | BillStatus;

const emptyDashboard: BillsListResponse = {
  bills: [],
  summary: { totalAmount: "0.00", paidAmount: "0.00", pendingAmount: "0.00", openBills: 0 },
};

export function BillsDashboard({ canManage, personName }: { canManage: boolean; personName: string }) {
  const [dashboard, setDashboard] = useState<BillsListResponse>(emptyDashboard);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [formBill, setFormBill] = useState<BillResponse | "new" | null>(null);
  const [billToDelete, setBillToDelete] = useState<BillResponse | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [billToAssign, setBillToAssign] = useState<BillResponse | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  const loadBills = useCallback(async (showRefreshingState = false) => {
    if (showRefreshingState) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setError("");

    try {
      const response = await fetch("/api/bills?sortDirection=asc", { cache: "no-store" });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error?.message ?? "We could not load your bills.");
      }

      setDashboard(payload.data);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "We could not load your bills.");
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    // Fetching from the API is synchronization with an external system.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadBills();
  }, [loadBills]);

  const displayedBills = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const filtered = dashboard.bills.filter((bill) => {
      const matchesSearch = !normalizedSearch || bill.reason.toLowerCase().includes(normalizedSearch);
      const matchesStatus = statusFilter === "ALL" || bill.status === statusFilter;
      return matchesSearch && matchesStatus;
    });

    return [...filtered].sort((left, right) => {
      const comparison = left.payBefore.localeCompare(right.payBefore);
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [dashboard.bills, search, sortDirection, statusFilter]);

  async function handleSaved() {
    await loadBills(true);
    setNotice("Bill saved successfully.");
  }

  async function handleDelete() {
    if (!billToDelete) {
      return;
    }

    setIsDeleting(true);
    setError("");
    try {
      const response = await fetch(`/api/bills/${billToDelete.id}`, { method: "DELETE" });
      const payload = response.status === 204 ? null : await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload?.error?.message ?? "We could not delete this bill.");
      }

      setBillToDelete(null);
      await loadBills(true);
      setNotice("Bill deleted successfully.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "We could not delete this bill.");
    } finally {
      setIsDeleting(false);
    }
  }

  function clearFilters() {
    setSearch("");
    setStatusFilter("ALL");
    setSortDirection("asc");
  }

  async function signOut() {
    setIsSigningOut(true);
    try {
      await fetch("/auth/logout", { method: "POST" });
    } finally {
      window.location.assign("/");
    }
  }

  const hasActiveFilters = Boolean(search) || statusFilter !== "ALL" || sortDirection !== "asc";

  return (
    <main className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-5 px-5 py-5 sm:px-8">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="grid size-9 place-items-center rounded-xl bg-sky-700 font-bold text-white">S</span>
            <div>
              <p className="text-sm font-semibold tracking-wide text-slate-950">Steward Bills Tracker</p>
              <p className="text-xs text-slate-500">Everyday bills, clearly organized</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <p className="hidden text-sm text-slate-600 sm:block">Signed in as {personName}</p>
            <button className="rounded-lg px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50" disabled={isSigningOut} onClick={() => void signOut()} type="button">
              {isSigningOut ? "Signing out…" : "Log out"}
            </button>
            {canManage ? <button className="rounded-lg bg-sky-700 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-800" onClick={() => setFormBill("new")} type="button">
              <span aria-hidden="true">+</span> Add bill
            </button> : null}
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-8 sm:px-8 sm:py-10">
        <section className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Overview</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Your bills at a glance</h1>
            <p className="mt-2 text-slate-600">Track what is due, what is paid, and what needs attention.</p>
          </div>
          <button className="self-start rounded-lg px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50 sm:self-auto" disabled={isRefreshing} onClick={() => void loadBills(true)} type="button">
            {isRefreshing ? "Refreshing…" : "Refresh"}
          </button>
        </section>

        {notice ? <div className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"><span>{notice}</span><button aria-label="Dismiss success message" className="font-bold" onClick={() => setNotice("")} type="button">×</button></div> : null}
        {error ? <div className="mt-6 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">{error}</div> : null}

        <section aria-label="Bill summaries" className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SummaryCard detail="Across all recorded bills" label="Total bills amount" tone="slate" value={formatIndianRupees(dashboard.summary.totalAmount)} />
          <SummaryCard detail="Recorded payments" label="Total paid amount" tone="sky" value={formatIndianRupees(dashboard.summary.paidAmount)} />
          <SummaryCard detail="Still to be paid" label="Total pending amount" tone="amber" value={formatIndianRupees(dashboard.summary.pendingAmount)} />
          <SummaryCard detail="Unpaid or partially paid" label="Open bills" tone="rose" value={String(dashboard.summary.openBills)} />
        </section>

        <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-5 sm:p-6">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
              <div>
                <h2 className="text-lg font-bold text-slate-950">Bills</h2>
                <p className="mt-1 text-sm text-slate-600">Deadlines are sorted by date; overdue and upcoming bills are highlighted.</p>
              </div>
              {hasActiveFilters ? <button className="self-start rounded-lg px-3 py-2 text-sm font-semibold text-sky-700 hover:bg-sky-50" onClick={clearFilters} type="button">Clear filters</button> : null}
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_190px_190px]">
              <label className="text-sm font-medium text-slate-700">
                <span className="sr-only">Search bills by reason</span>
                <input className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100" onChange={(event) => setSearch(event.target.value)} placeholder="Search bills by reason" value={search} />
              </label>
              <label className="text-sm font-medium text-slate-700">
                <span className="sr-only">Filter by payment status</span>
                <select className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100" onChange={(event) => setStatusFilter(event.target.value as StatusFilter)} value={statusFilter}>
                  <option value="ALL">All statuses</option>
                  <option value="UNPAID">Unpaid</option>
                  <option value="PARTIALLY_PAID">Partially paid</option>
                  <option value="PAID">Paid</option>
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">
                <span className="sr-only">Sort by payment deadline</span>
                <select className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100" onChange={(event) => setSortDirection(event.target.value as "asc" | "desc")} value={sortDirection}>
                  <option value="asc">Deadline: earliest first</option>
                  <option value="desc">Deadline: latest first</option>
                </select>
              </label>
            </div>
          </div>

          {isLoading ? <div className="p-12 text-center text-sm text-slate-600">Loading bills…</div> : null}
          {!isLoading && displayedBills.length > 0 ? <BillsTable bills={displayedBills} canManage={canManage} onAssign={setBillToAssign} onDelete={setBillToDelete} onEdit={setFormBill} /> : null}
          {!isLoading && displayedBills.length === 0 ? (
            <div className="px-6 py-14 text-center">
              <h3 className="text-lg font-semibold text-slate-900">{dashboard.bills.length === 0 ? "No bills recorded yet" : "No bills match these filters"}</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-slate-600">{dashboard.bills.length === 0 ? "Add your first bill to start tracking payments and deadlines." : "Try clearing a filter or searching for a different reason."}</p>
              {dashboard.bills.length === 0 && canManage ? <button className="mt-5 rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800" onClick={() => setFormBill("new")} type="button">Add your first bill</button> : null}
            </div>
          ) : null}
        </section>
      </div>

      {formBill ? <BillFormDialog bill={formBill === "new" ? undefined : formBill} key={formBill === "new" ? "new" : formBill.id} onClose={() => setFormBill(null)} onSaved={handleSaved} /> : null}
      {billToAssign ? <TaskAssignmentDialog bill={billToAssign} onAssigned={async () => { await loadBills(true); setNotice("Task proposed. Accept it in Steward's review queue."); }} onClose={() => setBillToAssign(null)} /> : null}

      {billToDelete ? (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 p-0 sm:items-center sm:justify-center sm:p-6">
          <div aria-labelledby="delete-bill-title" aria-modal="true" className="w-full max-w-md rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl" role="dialog">
            <h2 className="text-xl font-bold text-slate-950" id="delete-bill-title">Delete this bill?</h2>
            <p className="mt-3 text-sm leading-6 text-slate-600">“{billToDelete.reason}” will be permanently removed. This action cannot be undone.</p>
            <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
              <button className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100" disabled={isDeleting} onClick={() => setBillToDelete(null)} type="button">Cancel</button>
              <button className="rounded-lg bg-rose-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-800 disabled:opacity-60" disabled={isDeleting} onClick={() => void handleDelete()} type="button">{isDeleting ? "Deleting…" : "Delete bill"}</button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
