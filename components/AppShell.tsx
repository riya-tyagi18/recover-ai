"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { isLoggedIn, logout } from "@/lib/auth";

const NAV = [
  { href: "/overview", label: "Dashboard", ready: true },
  { href: "/simulate", label: "All Payments", ready: true },
  { href: "/strategy-lab", label: "Strategy Comparison", ready: true },
  { href: "/agent", label: "Activity Log", ready: true },
] as const;

const NO_SHELL_PATHS = ["/", "/login", "/connect"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  // Hide nav on login and connect pages
  const hideShell = NO_SHELL_PATHS.includes(pathname);

  useEffect(() => {
    if (!hideShell && !isLoggedIn()) {
      router.replace("/login");
    }
  }, [pathname, hideShell, router]);

  if (hideShell) {
    return <>{children}</>;
  }

  function handleLogout() {
    logout();
    router.push("/login");
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

        {/* Sample data badge */}
        <div className="mb-6 rounded-lg border border-amber-300/60 bg-amber-50/10 px-3 py-2 text-center">
          <span className="text-[10px] uppercase tracking-[0.14em] text-amber-600">
            Sample data
          </span>
        </div>

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
                {item.label}
              </Link>
            );
          })}
        </nav>

        <nav className="mt-auto flex flex-col gap-1">
          {/* Settings: connect payment account (coming soon) */}
          <div className="mb-2 rounded-xl border border-border bg-surface p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted mb-1">Settings</p>
            <div className="flex items-center justify-between">
              <p className="text-xs text-foreground">Connect payment account</p>
              <span className="text-[9px] uppercase tracking-wider rounded px-1.5 py-0.5 bg-border text-muted">
                Soon
              </span>
            </div>
          </div>

          <a href="/privacy" className="text-[11px] text-muted hover:text-foreground transition-colors">Privacy Policy</a>
          <a href="/terms" className="text-[11px] text-muted hover:text-foreground transition-colors">Terms &amp; Conditions</a>

          <button
            id="logout-btn"
            type="button"
            onClick={handleLogout}
            className="mt-3 rounded-md px-3 py-2 text-sm text-left text-muted hover:bg-background hover:text-foreground transition-colors"
          >
            Log out →
          </button>
        </nav>
      </aside>
      <main className="min-w-0 flex-1 px-10 py-8">{children}</main>
    </div>
  );
}
