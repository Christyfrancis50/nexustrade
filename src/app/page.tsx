import Link from "next/link";

const MODULES = [
  { code: "A", title: "Document AI", body: "Extract line items, TRNs and totals from bills of lading, airway bills and invoices, and flag math discrepancies." },
  { code: "B", title: "HS classifier", body: "Semantic HS-code suggestions with confidence and estimated duty, approved by a customs broker." },
  { code: "C", title: "Ledger & VAT", body: "Append-only double-entry ledger in AED with multi-currency FX and UAE VAT rules." },
  { code: "D", title: "Milestone escrow", body: "10% at booking, 40% at customs clearance, 50% at proof of delivery." },
  { code: "E", title: "Role dashboards", body: "Coordinator, customs broker and finance controller workspaces." },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-12 px-6 py-20">
      <header className="flex flex-col gap-4">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-foreground/60">
          Cross-border freight &amp; settlement · UAE corridors
        </p>
        <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl">NexusTrade</h1>
        <p className="max-w-2xl text-lg text-foreground/70">
          Connects shipping documents, customs and carrier payouts in one ledger, so forwarders get paid at each
          milestone instead of waiting 30–60 days.
        </p>
        <Link
          href="/login"
          className="mt-2 w-fit rounded-lg bg-foreground px-5 py-2.5 text-sm font-medium text-background"
        >
          Sign in to your workspace
        </Link>
      </header>

      <section aria-labelledby="modules" className="flex flex-col gap-4">
        <h2 id="modules" className="text-sm font-medium uppercase tracking-wider text-foreground/60">
          Modules
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {MODULES.map((m) => (
            <li key={m.code} className="rounded-xl border border-foreground/10 p-5">
              <span className="font-mono text-xs text-foreground/65">Module {m.code}</span>
              <h3 className="mt-1 font-medium">{m.title}</h3>
              <p className="mt-2 text-sm text-foreground/70">{m.body}</p>
            </li>
          ))}
        </ul>
      </section>

      <footer className="mt-auto text-sm text-foreground/65">Portfolio project · Next.js 16, Supabase, Drizzle, pgvector, Stripe (test mode)</footer>
    </main>
  );
}
