/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { AuditLog } from "@/lib/types";
import { formatDateTime } from "@/lib/format";

export function AgentDecisionFlow({ logs }: { logs: AuditLog[] }) {
  // Sort logs by time just in case
  const sortedLogs = [...logs].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  return (
    <div className="rounded-xl border border-border bg-surface p-6">
      <h3 className="font-display text-xl italic mb-6">Agent Decision Flow</h3>
      <div className="relative border-l border-border ml-3 space-y-8 pb-4">
        {sortedLogs.map((log, index) => (
          <div key={log.id} className="relative pl-6">
            <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-accent border-[3px] border-surface" />
            <div className="flex flex-col gap-1">
              <div className="text-[11px] uppercase tracking-wider text-muted flex items-center gap-2">
                <span>{formatDateTime(log.at)}</span>
                <span>•</span>
                <span className="font-medium text-foreground">{log.action}</span>
              </div>
              <p className="text-sm text-foreground">{log.reason}</p>
              {Boolean(log.detail) && (
                <pre className="mt-2 bg-background border border-border p-3 rounded-md text-[10px] overflow-x-auto text-muted max-w-full">
                  {JSON.stringify(log.detail as any, null, 2)}
                </pre>
              )}
            </div>
          </div>
        ))}
        {sortedLogs.length === 0 && (
          <div className="pl-6 text-sm text-muted">No agent activity logged.</div>
        )}
      </div>
    </div>
  );
}
