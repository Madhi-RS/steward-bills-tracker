"use client";

import { useEffect, useState } from "react";

import type { BillResponse } from "@/types/bill";

type Directory = {
  people: Array<{ id: string; name: string; role: string }>;
  companies: string[];
};

export function TaskAssignmentDialog({ bill, onClose, onAssigned }: { bill: BillResponse; onClose: () => void; onAssigned: () => Promise<void> }) {
  const [directory, setDirectory] = useState<Directory>({ people: [], companies: [] });
  const [assignee, setAssignee] = useState("");
  const [company, setCompany] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void fetch("/api/steward/directory", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message ?? "The Steward directory could not be loaded.");
        setDirectory(payload.data);
        setAssignee(payload.data.people.find((person: Directory["people"][number]) => person.role === "member")?.id ?? payload.data.people[0]?.id ?? "");
        setCompany(payload.data.companies[0] ?? "");
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : "The Steward directory could not be loaded."))
      .finally(() => setLoading(false));
  }, []);

  async function assign() {
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/bills/${bill.id}/task`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assignee, company }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message ?? "The Steward task could not be proposed.");
      await onAssigned();
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "The Steward task could not be proposed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 sm:items-center sm:justify-center sm:p-6">
      <div aria-labelledby="assign-task-title" aria-modal="true" className="w-full max-w-lg rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl" role="dialog">
        <h2 className="text-xl font-bold text-slate-950" id="assign-task-title">Assign invoice in Steward</h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">Steward will first place “Pay invoice: {bill.reason}” in the owner/admin review queue. Accepting it creates Person B’s private task.</p>
        {error ? <div className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-800">{error}</div> : null}
        {loading ? <p className="mt-5 text-sm text-slate-600">Loading Steward members…</p> : (
          <div className="mt-5 grid gap-4">
            <label className="text-sm font-medium text-slate-700">Assignee
              <select className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5" onChange={(event) => setAssignee(event.target.value)} value={assignee}>
                {directory.people.map((person) => <option key={person.id} value={person.id}>{person.name} ({person.role})</option>)}
              </select>
            </label>
            {directory.companies.length > 1 ? <label className="text-sm font-medium text-slate-700">Company
              <select className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5" onChange={(event) => setCompany(event.target.value)} value={company}>
                {directory.companies.map((id) => <option key={id} value={id}>{id}</option>)}
              </select>
            </label> : null}
            {directory.people.length === 0 ? <p className="text-sm text-amber-800">No other Steward member is visible to this account.</p> : null}
            {directory.companies.length === 0 ? <p className="text-sm text-amber-800">No Steward company could be found.</p> : null}
          </div>
        )}
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100" disabled={saving} onClick={onClose} type="button">Cancel</button>
          <button className="rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50" disabled={loading || saving || !assignee || !company} onClick={() => void assign()} type="button">{saving ? "Proposing…" : "Propose task"}</button>
        </div>
      </div>
    </div>
  );
}
