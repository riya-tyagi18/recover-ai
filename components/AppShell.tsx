"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useCallback } from "react";

type AuthUser = {
  id: string;
  name: string;
  email: string;
  role: "user" | "owner";
  customerId?: string | null;
};

const OWNER_NAV = [
  { href: "/overview", label: "Dashboard" },
  { href: "/simulate", label: "All Payments" },
  { href: "/strategy-lab", label: "Strategy Comparison" },
  { href: "/agent", label: "Activity Log" },
  { href: "/analyst", label: "Recovery Analyst" },
  { href: "/security", label: "Security & Audit" },
] as const;

const CUSTOMER_NAV = [
  { href: "/customer/dashboard", label: "My Payments" },
] as const;

const OWNER_PAGES = [
  "/overview",
  "/simulate",
  "/strategy-lab",
  "/agent",
  "/analyst",
  "/security",
];

const NO_SHELL = ["/", "/login", "/connect", "/forgot-password", "/reset-password"];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const hideShell = NO_SHELL.includes(pathname);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        setUser(null);
        if (!hideShell) {
          router.replace("/login");
        }
      } else {
        const data = await res.json();
        setUser(data.user);

        // RBAC enforcement: redirect customer role away from owner-only pages
        if (data.user.role === "user" && OWNER_PAGES.some((p) => pathname.startsWith(p))) {
          router.replace("/customer/dashboard");
        }
      }
    } catch {
      setUser(null);
      if (!hideShell) router.replace("/login");
    } finally {
      setLoading(false);
    }
  }, [hideShell, pathname, router]);

  useEffect(() => {
    if (!hideShell) {
      void checkAuth();
    }
  }, [hideShell, pathname, checkAuth]);

  // Close mobile nav on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  if (hideShell) return <>{children}</>;

  async function handleLogout() {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    setUser(null);
    router.push("/login");
  }

  const isOwner = user?.role === "owner";
  const navItems = isOwner ? OWNER_NAV : CUSTOMER_NAV;
  const homeHref = isOwner ? "/overview" : "/customer/dashboard";

  const sidebar = (
    <aside className="flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface px-5 py-8">
      {/* Logo */}
      <Link href={homeHref} className="mb-8 flex items-center gap-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-muted">
          <span className="font-display text-sm italic font-bold text-accent">R</span>
        </span>
        <div>
          <p className="font-display text-base tracking-tight text-foreground italic leading-none">
            Recover AI
          </p>
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted mt-0.5">
            {isOwner ? "Payment recovery" : "Customer Portal"}
          </p>
        </div>
      </Link>

      {/* Role / Sample data badge */}
      <div className="mb-5 flex flex-col gap-1.5">
        <div className="rounded-lg border border-amber-300/50 bg-amber-50/20 px-3 py-1 text-center">
          <span className="text-[10px] uppercase tracking-[0.14em] text-amber-700 font-medium">
            Sample data
          </span>
        </div>
        {user && (
          <div className="rounded-lg border border-border bg-background px-3 py-1 text-center">
            <span className="text-[10px] uppercase tracking-[0.14em] text-muted font-medium">
              Role: <strong className="text-foreground">{user.role === "owner" ? "Owner" : "Customer"}</strong>
            </span>
          </div>
        )}
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center rounded-lg px-3 py-2.5 text-sm transition-colors ${
                active
                  ? "bg-accent-muted text-accent font-medium"
                  : "text-muted hover:bg-background hover:text-foreground"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <nav className="mt-auto flex flex-col gap-1">
        {/* User Card */}
        {user && (
          <div className="mb-2 rounded-xl border border-border bg-background p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted mb-0.5 font-medium">Signed in as</p>
            <p className="text-xs font-medium text-foreground truncate">{user.name}</p>
            <p className="text-[10px] text-muted truncate font-mono">{user.email}</p>
          </div>
        )}

        {isOwner && (
          <div className="mb-3 rounded-xl border border-border bg-background p-3">
            <p className="text-[10px] uppercase tracking-[0.14em] text-muted mb-1 font-medium">Settings</p>
            <div className="flex items-center justify-between">
              <p className="text-xs text-foreground">Connect payment account</p>
              <span className="rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider bg-border text-muted">
                Soon
              </span>
            </div>
          </div>
        )}

        <a href="/privacy" className="rounded px-2 py-1 text-[11px] text-muted hover:text-foreground transition-colors">Privacy Policy</a>
        <a href="/terms" className="rounded px-2 py-1 text-[11px] text-muted hover:text-foreground transition-colors">Terms &amp; Conditions</a>

        <button
          id="logout-btn"
          type="button"
          onClick={handleLogout}
          className="mt-2 flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-left text-muted hover:bg-background hover:text-foreground transition-colors"
        >
          Log out
          <svg className="ml-auto w-3.5 h-3.5 opacity-50" viewBox="0 0 16 16" fill="none">
            <path d="M6 2H3a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3M11 11l3-3-3-3M14 8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
      </nav>
    </aside>
  );

  return (
    <div className="flex min-h-screen">
      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:w-60">
        {sidebar}
      </div>

      {/* Mobile hamburger */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-30 flex items-center justify-between border-b border-border bg-surface px-4 h-14">
        <Link href={homeHref} className="font-display text-base italic tracking-tight">Recover AI</Link>
        <button
          id="mobile-menu-btn"
          type="button"
          aria-label="Open navigation"
          onClick={() => setMobileOpen(true)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border border-border text-muted hover:text-foreground"
        >
          <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none">
            <path d="M2 4h12M2 8h12M2 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div className="sidebar-overlay lg:hidden" onClick={() => setMobileOpen(false)} />
          <div className="fixed inset-y-0 left-0 z-50 w-60 lg:hidden flex flex-col">
            {sidebar}
          </div>
        </>
      )}

      {/* Main content */}
      <main className="min-w-0 flex-1 lg:ml-60">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-10 py-6 lg:py-8 pt-20 lg:pt-8">
          {children}
        </div>
      </main>
    </div>
  );
}
