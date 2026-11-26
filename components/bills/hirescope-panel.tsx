"use client";

import { useCallback, useEffect, useState } from "react";

type Inquiry = {
  id: string;
  questionText: string;
  answerText: string | null;
  answeredAt: string | null;
  createdAt: string;
};

export function HireScopePanel({ canManage }: { canManage: boolean }) {
  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [employeeCode, setEmployeeCode] = useState("");
  const [error, setError] = useState("");
  const [isSending, setIsSending] = useState(false);

  const load = useCallback(async () => {
    const response = await fetch("/api/hirescope/inquiries", { cache: "no-store" });
    const payload = await response.json().catch(() => ({}));
    if (response.ok) setInquiries(payload.data ?? []);
  }, []);

  useEffect(() => {
    // Fetching from the API is synchronization with an external system.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  async function submit() {
    setIsSending(true);
    setError("");
    try {
      const response = await fetch("/api/hirescope/inquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: `onboarding status for ${employeeCode.trim()}` }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error?.message ?? "We could not ask HireScope.");
      setEmployeeCode("");
      await load();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "We could not ask HireScope.");
    } finally {
      setIsSending(false);
    }
  }

  return (
    <section aria-label="HireScope status" className="mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <div>
        <p className="text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">HireScope</p>
        <h2 className="mt-1 text-lg font-bold text-slate-950">Hiring and onboarding status</h2>
        <p className="mt-1 text-sm text-slate-600">Board replies are shown as information only; they never change bill records or create work.</p>
      </div>

      {canManage ? (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <label className="sr-only" htmlFor="hirescope-employee-code">Employee code</label>
          <input className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-sky-600 focus:ring-2 focus:ring-sky-100" id="hirescope-employee-code" maxLength={64} onChange={(event) => setEmployeeCode(event.target.value)} placeholder="Employee code, for example EMP-001" value={employeeCode} />
          <button className="rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:opacity-50" disabled={isSending || !employeeCode.trim()} onClick={() => void submit()} type="button">{isSending ? "Asking…" : "Ask HireScope"}</button>
        </div>
      ) : null}

      {error ? <p className="mt-3 text-sm text-rose-700" role="alert">{error}</p> : null}
      {inquiries.length === 0 ? <p className="mt-4 text-sm text-slate-600">No HireScope questions yet.</p> : null}
      {inquiries.map((inquiry) => (
        <article className="mt-4 rounded-xl bg-slate-50 p-4" key={inquiry.id}>
          <p className="text-sm font-medium text-slate-900">{inquiry.questionText}</p>
          {inquiry.answerText === null ? <p className="mt-2 text-sm text-amber-700">Awaiting HireScope’s answer.</p> : <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{inquiry.answerText}</p>}
        </article>
      ))}
    </section>
  );
}
