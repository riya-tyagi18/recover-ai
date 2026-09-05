import Link from "next/link";

export const metadata = {
  title: "Terms & Conditions — Recover AI",
  description: "Terms of use for the Recover AI payment recovery service.",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-10 py-4">
      <header>
        <p className="text-[11px] uppercase tracking-[0.18em] text-accent">Legal</p>
        <h1 className="font-display mt-1 text-3xl italic tracking-tight">Terms &amp; Conditions</h1>
        <p className="mt-2 text-sm text-muted">Last updated: September 2026</p>
      </header>

      <section className="space-y-4 text-sm leading-relaxed">
        <h2 className="font-display text-xl italic">Service description</h2>
        <p>
          Recover AI provides an automated payment recovery service. By connecting your payment account, you authorise Recover AI to read failed transaction data, analyse failure causes, and attempt recovery via the actions you configure.
        </p>
      </section>

      <section className="space-y-4 text-sm leading-relaxed">
        <h2 className="font-display text-xl italic">Acceptable use</h2>
        <p>
          You may use Recover AI only for lawful payment recovery on transactions you are authorised to process. You must not use the service to retry transactions that have been disputed, charged back, or flagged for fraud.
        </p>
      </section>

      <section className="space-y-4 text-sm leading-relaxed">
        <h2 className="font-display text-xl italic">Automated actions and limits</h2>
        <p>
          The recovery agent applies a maximum of three automated retry attempts per payment. Beyond this limit, cases are held for manual review. This limit exists to protect your customers from excessive charge attempts.
        </p>
        <p>
          Recovery actions are taken according to the strategy assigned to each payment. We do not guarantee recovery — outcomes depend on your customers&apos; bank and payment method status.
        </p>
      </section>

      <section className="space-y-4 text-sm leading-relaxed">
        <h2 className="font-display text-xl italic">Liability</h2>
        <p>
          Recover AI is not liable for failed recovery attempts, gateway errors, or losses arising from payment provider decisions outside our control. The service is provided as-is, without warranty of a specific recovery rate.
        </p>
      </section>

      <section className="space-y-4 text-sm leading-relaxed">
        <h2 className="font-display text-xl italic">Changes to these terms</h2>
        <p>
          We may update these terms. Continued use of the service after notice of changes constitutes acceptance. Material changes will be communicated at least 14 days in advance.
        </p>
      </section>

      <section className="space-y-4 text-sm leading-relaxed">
        <h2 className="font-display text-xl italic">Contact</h2>
        <p>
          For questions about these terms, contact us at{" "}
          <a href="mailto:legal@recover.ai" className="text-accent hover:underline">
            legal@recover.ai
          </a>
          .
        </p>
      </section>

      <div className="border-t border-border pt-6 flex gap-6 text-xs text-muted">
        <Link href="/privacy" className="hover:text-foreground transition-colors">
          Privacy Policy
        </Link>
        <Link href="/overview" className="hover:text-foreground transition-colors">
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
