"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV = [
  { href: "/overview", label: "Dashboard", ready: true },
  { href: "/simulate", label: "All Payments", ready: true },
  { href: "/strategy-lab", label: "Strategy Lab", ready: true },
  { href: "/agent", label: "Agent Audit", ready: true },
] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  // Hide sidebar on the connect/landing page
  if (pathname === "/connect" || pathname === "/") {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface px-5 py-8">
        <Link href="/overview" className="mb-10">
          <p className="font-display text-xl tracking-tight text-foreground italic">
            Recover AI
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-muted">
            Payment recovery
          </p>
        </Link>
        <nav className="flex flex-col gap-1">
          {NAV.map((item) => {
            const active =
              pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-accent-muted text-accent"
                    : "text-muted hover:bg-background hover:text-foreground"
                }`}
              >
                <span className="flex items-center justify-between gap-2">
                  {item.label}
                  {!item.ready ? (
                    <span className="text-[10px] uppercase tracking-wider text-muted/70">
                      Soon
                    </span>
                  ) : null}
                </span>
              </Link>
            );
          })}
        </nav>
        <nav className="mt-auto flex flex-col gap-1">
          <a href="/privacy" className="text-[11px] text-muted hover:text-foreground transition-colors">Privacy Policy</a>
          <a href="/terms" className="text-[11px] text-muted hover:text-foreground transition-colors">Terms &amp; Conditions</a>
        </nav>
      </aside>
      <main className="min-w-0 flex-1 px-10 py-8">{children}</main>
    </div>
  );
}
