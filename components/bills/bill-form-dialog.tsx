"use client";

import { FormEvent, useMemo, useState } from "react";

import { formatIndianRupees } from "@/lib/format";
import type { BillResponse } from "@/types/bill";

type BillFormDialogProps = {
  bill?: BillResponse;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

type FormValues = {
  reason: string;
  totalAmount: string;
  paidAmount: string;
  payBefore: string;
};

const emptyValues: FormValues = {
  reason: "",
  totalAmount: "",
  paidAmount: "0.00",
  payBefore: "",
};

function getInitialValues(bill?: BillResponse): FormValues {
  return bill
    ? {
        reason: bill.reason,
        totalAmount: bill.totalAmount,
        paidAmount: bill.paidAmount,
        payBefore: bill.payBefore,
      }
    : emptyValues;
}

function calculatePreview(totalAmount: string, paidAmount: string) {
  const total = Number(totalAmount);
  const paid = Number(paidAmount);

  if (!Number.isFinite(total) || !Number.isFinite(paid) || total < 0 || paid < 0) {
    return null;
  }

  return Math.max(0, total - paid).toFixed(2);
}

export function BillFormDialog({ bill, onClose, onSaved }: BillFormDialogProps) {
  const [values, setValues] = useState<FormValues>(() => getInitialValues(bill));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const pendingPreview = useMemo(
    () => calculatePreview(values.totalAmount, values.paidAmount),
    [values.paidAmount, values.totalAmount],
  );

  function updateValue(field: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: "" }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setErrors({});
    setIsSaving(true);

    try {
      const response = await fetch(bill ? `/api/bills/${bill.id}` : "/api/bills", {
        method: bill ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        const fieldErrors = Object.fromEntries(
          (payload.error?.issues ?? []).map((issue: { path: string; message: string }) => [issue.path, issue.message]),
        );
        setErrors(fieldErrors);
        setFormError(payload.error?.message ?? "We could not save this bill. Please try again.");
        return;
      }

      await onSaved();
      onClose();
    } catch {
      setFormError("We could not reach the server. Check your connection and try again.");
    } finally {
      setIsSaving(false);
    }
  }

  const title = bill ? "Edit bill" : "Add a new bill";

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/40 p-0 sm:items-center sm:justify-center sm:p-6">
      <div aria-labelledby="bill-form-title" aria-modal="true" className="w-full max-w-lg rounded-t-2xl bg-white p-6 shadow-xl sm:rounded-2xl" role="dialog">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-slate-950" id="bill-form-title">{title}</h2>
            <p className="mt-1 text-sm text-slate-600">Amounts are verified again by the server when you save.</p>
          </div>
          <button aria-label="Close bill form" className="rounded-md px-2 py-1 text-xl text-slate-500 hover:bg-slate-100" onClick={onClose} type="button">
            ×
          </button>
        </div>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block text-sm font-medium text-slate-800">
            Reason
            <input
              aria-invalid={Boolean(errors.reason)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-sky-600 focus:ring-2 focus:ring-sky-100"
              maxLength={160}
              onChange={(event) => updateValue("reason", event.target.value)}
              placeholder="e.g. Electricity bill"
              required
              value={values.reason}
            />
            {errors.reason ? <span className="mt-1 block text-sm text-rose-600">{errors.reason}</span> : null}
          </label>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm font-medium text-slate-800">
              Total amount
              <input
                aria-invalid={Boolean(errors.totalAmount)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-sky-600 focus:ring-2 focus:ring-sky-100"
                inputMode="decimal"
                min="0.01"
                onChange={(event) => updateValue("totalAmount", event.target.value)}
                placeholder="0.00"
                required
                step="0.01"
                type="number"
                value={values.totalAmount}
              />
              {errors.totalAmount ? <span className="mt-1 block text-sm text-rose-600">{errors.totalAmount}</span> : null}
            </label>

            <label className="block text-sm font-medium text-slate-800">
              Amount already paid
              <input
                aria-invalid={Boolean(errors.paidAmount)}
                className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-sky-600 focus:ring-2 focus:ring-sky-100"
                inputMode="decimal"
                min="0"
                onChange={(event) => updateValue("paidAmount", event.target.value)}
                placeholder="0.00"
                required
                step="0.01"
                type="number"
                value={values.paidAmount}
              />
              {errors.paidAmount ? <span className="mt-1 block text-sm text-rose-600">{errors.paidAmount}</span> : null}
            </label>
          </div>

          <label className="block text-sm font-medium text-slate-800">
            Pay before
            <input
              aria-invalid={Boolean(errors.payBefore)}
              className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none transition focus:border-sky-600 focus:ring-2 focus:ring-sky-100"
              onChange={(event) => updateValue("payBefore", event.target.value)}
              required
              type="date"
              value={values.payBefore}
            />
            {errors.payBefore ? <span className="mt-1 block text-sm text-rose-600">{errors.payBefore}</span> : null}
          </label>

          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-sm font-medium text-slate-600">Pending amount</p>
            <p className="mt-1 text-xl font-bold text-slate-950">
              {pendingPreview === null ? "Enter valid amounts" : formatIndianRupees(pendingPreview)}
            </p>
          </div>

          {formError ? <p className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700">{formError}</p> : null}

          <div className="flex flex-col-reverse gap-3 pt-2 sm:flex-row sm:justify-end">
            <button className="rounded-lg px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-100" onClick={onClose} type="button">
              Cancel
            </button>
            <button className="rounded-lg bg-sky-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-60" disabled={isSaving} type="submit">
              {isSaving ? "Saving…" : bill ? "Save changes" : "Add bill"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
