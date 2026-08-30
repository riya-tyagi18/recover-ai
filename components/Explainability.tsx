export function Explainability({
  happened,
  understood,
  reasoning,
  outcome,
}: {
  happened: string;
  understood: string;
  reasoning: string;
  outcome: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h3 className="font-display text-xl italic mb-4">Explainability</h3>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <ExplainStep title="What happened" description={happened} />
        <ExplainStep title="What the agent understood" description={understood} />
        <ExplainStep title="Why it chose this action" description={reasoning} />
        <ExplainStep title="Expected outcome" description={outcome} />
      </div>
    </div>
  );
}

function ExplainStep({ title, description }: { title: string; description: string }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] uppercase tracking-[0.14em] text-accent font-medium">{title}</div>
      <div className="text-sm text-foreground leading-relaxed">{description}</div>
    </div>
  );
}
