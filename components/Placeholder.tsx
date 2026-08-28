export function Placeholder({ title, body }: { title: string; body: string }) {
  return (
    <div className="mx-auto max-w-xl pt-16">
      <p className="text-[11px] uppercase tracking-[0.18em] text-accent">Coming next</p>
      <h1 className="font-display mt-2 text-3xl italic">{title}</h1>
      <p className="mt-3 text-sm leading-relaxed text-muted">{body}</p>
    </div>
  );
}
