export function LoginScreen({ refusalCode }: { refusalCode?: string }) {
  return (
    <main className="grid min-h-screen place-items-center bg-slate-50 px-5 py-10">
      <section className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-7 shadow-sm sm:p-9">
        <span aria-hidden="true" className="grid size-11 place-items-center rounded-xl bg-sky-700 text-lg font-bold text-white">S</span>
        <p className="mt-6 text-sm font-semibold uppercase tracking-[0.16em] text-sky-700">Steward Bills Tracker</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Sign in to track your bills</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">Use your Steward account to access your Bills Tracker workspace.</p>
        {refusalCode ? <p className="mt-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Your previous session ended ({refusalCode}). Please sign in again.</p> : null}
        <a className="mt-7 inline-flex w-full items-center justify-center rounded-lg bg-sky-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-sky-800 focus:outline-none focus:ring-2 focus:ring-sky-600 focus:ring-offset-2" href="/auth/login">Log in with Steward</a>
      </section>
    </main>
  );
}
