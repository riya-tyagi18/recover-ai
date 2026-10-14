export default function OverviewLoading() {
  return (
    <div className="mx-auto max-w-6xl space-y-8 animate-pulse">
      {/* Header skeleton */}
      <div className="flex items-end justify-between">
        <div>
          <div className="h-8 w-48 bg-border rounded-md mb-2" />
          <div className="h-4 w-72 bg-border-subtle rounded-md" />
        </div>
        <div className="h-4 w-28 bg-border-subtle rounded-md" />
      </div>

      {/* KPI skeleton */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="card p-4 space-y-2">
            <div className="h-3 w-20 bg-border rounded" />
            <div className="h-7 w-28 bg-border-subtle rounded" />
          </div>
        ))}
      </div>

      {/* Charts skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6 min-h-[360px] space-y-4">
          <div className="h-5 w-48 bg-border rounded" />
          <div className="h-4 w-64 bg-border-subtle rounded" />
          <div className="h-56 w-full bg-surface-subtle rounded-lg" />
        </div>
        <div className="card p-6 min-h-[360px] space-y-4">
          <div className="h-5 w-48 bg-border rounded" />
          <div className="h-4 w-64 bg-border-subtle rounded" />
          <div className="h-56 w-full bg-surface-subtle rounded-lg" />
        </div>
      </div>

      {/* Funnel & Failure reasons skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="card p-6 min-h-[200px]" />
        <div className="card p-6 min-h-[200px]" />
      </div>
    </div>
  );
}
