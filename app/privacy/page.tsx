import Link from "next/link";

export const metadata = {
  title: "Privacy Policy — Recover AI",
  description: "How Recover AI handles your data.",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-10 py-4">
      <header>
        <p className="text-[11px] uppercase tracking-[0.18em] text-accent">Legal</p>
        <h1 className="font-display mt-1 text-3xl italic tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted">Last updated: September 2026</p>
      </header>

      <section className="space-y-4 text-sm leading-relaxed">
        <h2 className="font-display text-xl italic">What we collect</h2>
        <p>
          To operate the payment recovery service, we access transaction data from your connected payment provider — specifically failed payment records, customer identifiers, and failure codes. We do not store full card numbers or bank account credentials.
        </p>
        <p>
          We also collect usage data (page views, feature interactions) to improve the product. This data is aggregated and not linked to individual identifiable users.
        </p>
      </section>

      <section className="space-y-4 text-sm leading-relaxed">
        <h2 className="font-display text-xl italic">How we use it</h2>
        <p>
          Payment data is used solely to run the automated recovery pipeline — detecting failures, selecting a recovery approach, and executing the action. We do not sell, rent, or share your data with third parties for marketing purposes.
        </p>
      </section>

      <section className="space-y-4 text-sm leading-relaxed">
        <h2 className="font-display text-xl italic">Data retention</h2>
        <p>
          Recovery records are retained for up to 90 days to support auditing and dispute resolution. You may request deletion at any time by contacting us.
        </p>
      </section>

      <section className="space-y-4 text-sm leading-relaxed">
        <h2 className="font-display text-xl italic">Security</h2>
        <p>
          All data is transmitted over HTTPS. Payment provider credentials are never stored on our servers — we use read-only OAuth tokens scoped to transaction history only.
        </p>
      </section>

      <section className="space-y-4 text-sm leading-relaxed">
        <h2 className="font-display text-xl italic">Your rights</h2>
        <p>
          You can request access to, correction of, or deletion of your data at any time. To exercise these rights, contact us at the address below.
        </p>
      </section>

      <section className="space-y-4 text-sm leading-relaxed">
        <h2 className="font-display text-xl italic">Contact</h2>
        <p>
          For privacy questions, reach us at{" "}
          <a href="mailto:privacy@recover.ai" className="text-accent hover:underline">
            privacy@recover.ai
          </a>
          .
        </p>
      </section>

      <div className="border-t border-border pt-6 flex gap-6 text-xs text-muted">
        <Link href="/terms" className="hover:text-foreground transition-colors">
          Terms &amp; Conditions
        </Link>
        <Link href="/overview" className="hover:text-foreground transition-colors">
          Back to Dashboard
        </Link>
      </div>
    </div>
  );
}
