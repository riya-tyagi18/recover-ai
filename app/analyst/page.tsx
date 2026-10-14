import { AnalystChat } from "@/components/analyst/AnalystChat";

export const metadata = {
  title: "Payment Recovery Analyst — Recover AI",
  description:
    "AI-powered payment recovery analyst and customer risk segmentation grounded in live transaction data.",
};

export default function AnalystPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl italic tracking-tight text-foreground">
              Payment Recovery Analyst
            </h1>
            <span className="badge-at-risk">Sample data</span>
          </div>
          <p className="mt-2 text-sm text-muted">
            Conversational analysis and risk segmentation grounded in live payment metrics.
          </p>
        </div>
      </header>

      {/* Main interactive analyst chat & diagnostic interface */}
      <AnalystChat />
    </div>
  );
}
