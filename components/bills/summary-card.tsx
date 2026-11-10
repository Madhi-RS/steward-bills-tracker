type SummaryCardProps = {
  label: string;
  value: string;
  detail: string;
  tone: "slate" | "sky" | "amber" | "rose";
};

const toneStyles: Record<SummaryCardProps["tone"], string> = {
  slate: "border-slate-200 bg-white",
  sky: "border-sky-100 bg-sky-50",
  amber: "border-amber-100 bg-amber-50",
  rose: "border-rose-100 bg-rose-50",
};

export function SummaryCard({ label, value, detail, tone }: SummaryCardProps) {
  return (
    <section className={`rounded-2xl border p-5 shadow-sm ${toneStyles[tone]}`}>
      <p className="text-sm font-medium text-slate-600">{label}</p>
      <p className="mt-3 text-2xl font-bold tracking-tight text-slate-950">{value}</p>
      <p className="mt-2 text-sm text-slate-500">{detail}</p>
    </section>
  );
}
