export default function AnalystLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-6 animate-pulse">
      <div className="space-y-2">
        <div className="h-8 w-64 bg-border rounded-md" />
        <div className="h-4 w-96 bg-border-subtle rounded-md" />
      </div>

      <div className="card h-[580px] p-6 space-y-4">
        <div className="h-10 w-full bg-surface-subtle rounded-lg" />
        <div className="h-64 w-full bg-surface-subtle rounded-lg" />
        <div className="h-48 w-full bg-surface-subtle rounded-lg" />
      </div>
    </div>
  );
}
