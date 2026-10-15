"use client";

import { useState, FormEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type TabRole = "customer" | "owner";
type AuthMode = "signin" | "register" | "otp";

export default function LoginPage() {
  const router = useRouter();

  const [tabRole, setTabRole] = useState<TabRole>("customer");
  const [mode, setMode] = useState<AuthMode>("signin");

  // Form fields
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");

  // OTP state
  const [otpUserId, setOtpUserId] = useState<string | null>(null);
  const [demoOtpCode, setDemoOtpCode] = useState<string | null>(null);

  // Status
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // demoMode starts as false — we check the server on mount to avoid showing
  // the demo panel when DEMO_MODE is off (e.g. on a production Vercel deployment).
  const [demoMode, setDemoMode] = useState<boolean>(false);

  // On mount: redirect if already logged in, and fetch server-side demo flag
  useEffect(() => {
    // Check existing session
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          router.replace(data.user.role === "owner" ? "/overview" : "/customer/dashboard");
        }
      })
      .catch(() => {});

    // Fetch server-side demo flag (avoids hardcoding true on the client)
    fetch("/api/auth/config")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data && typeof data.demoMode === "boolean") {
          setDemoMode(data.demoMode);
        }
      })
      .catch(() => {});
  }, [router]);

  // Clear form fields when switching modes so data doesn't leak between views
  function switchMode(next: AuthMode) {
    setMode(next);
    setError(null);
    setPassword("");
    setConfirmPassword("");
  }

  function switchTab(next: TabRole) {
    setTabRole(next);
    if (next === "owner") setMode("signin");
    setError(null);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      // ── Registration ──────────────────────────────────────────────────────
      if (mode === "register") {
        // Client-side confirmPassword check (server validates everything else)
        if (password !== confirmPassword) {
          setError("Passwords do not match.");
          setLoading(false);
          return;
        }

        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, email, password }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to create account.");
        }
        router.push("/customer/dashboard");
        return;
      }

      // ── OTP verification ──────────────────────────────────────────────────
      if (mode === "otp") {
        const res = await fetch("/api/auth/verify-otp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: otpUserId, code: otpCode }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Invalid verification code.");
        }
        router.push(data.user.role === "owner" ? "/overview" : "/customer/dashboard");
        return;
      }

      // ── Sign in ───────────────────────────────────────────────────────────
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Incorrect username or password.");
      }

      if (data.requiresOtp) {
        setOtpUserId(data.userId);
        if (data.demoOtpCode) {
          setDemoOtpCode(data.demoOtpCode);
          setOtpCode(data.demoOtpCode);
        }
        setMode("otp");
        return;
      }

      router.push(data.user.role === "owner" ? "/overview" : "/customer/dashboard");
    } catch (err: unknown) {
      setError((err as Error).message || "An error occurred.");
    } finally {
      setLoading(false);
    }
  }

  function fillDemoOwner() {
    setTabRole("owner");
    setMode("signin");
    setEmail("host");
    setPassword("password");
    setConfirmPassword("");
    setError(null);
  }

  function fillDemoCustomer() {
    setTabRole("customer");
    setMode("signin");
    setEmail("customer@recover.ai");
    setPassword("password");
    setConfirmPassword("");
    setError(null);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent-muted mb-4 shadow-sm">
            <span className="font-display text-2xl italic font-bold text-accent">R</span>
          </div>
          <h1 className="font-display text-4xl italic tracking-tight text-foreground">Recover AI</h1>
          <p className="mt-2 text-muted text-sm leading-relaxed">
            Autonomous payment recovery platform
          </p>
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-sm">
          {/* ── OTP screen ─────────────────────────────────────────────── */}
          {mode === "otp" && (
            <div className="mb-6 space-y-4">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => { setMode("signin"); setOtpCode(""); setDemoOtpCode(null); setError(null); }}
                  className="text-xs text-accent hover:underline flex items-center gap-1"
                >
                  ← Back to sign in
                </button>
              </div>

              <div>
                <h2 className="font-display text-xl italic text-foreground">Two-step verification</h2>
                <p className="text-xs text-muted mt-1">
                  We sent a 6-digit verification code to your email. Enter it below to sign in.
                </p>
              </div>

              {demoOtpCode && (
                <div className="rounded-xl border border-accent/40 bg-accent-muted/40 p-3.5 text-xs text-foreground">
                  <span className="font-semibold text-accent block mb-1">Demo Mode Active</span>
                  No mail service is required. Your demo verification code is:{" "}
                  <strong className="font-mono text-sm tracking-widest text-accent bg-surface px-2 py-0.5 rounded border border-accent/20">
                    {demoOtpCode}
                  </strong>
                </div>
              )}
            </div>
          )}

          {/* ── Role tabs (signin / register only) ───────────────────── */}
          {mode !== "otp" && (
            <>
              <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-background p-1 border border-border">
                <button
                  type="button"
                  id="tab-customer"
                  onClick={() => switchTab("customer")}
                  className={`rounded-lg py-2 text-xs font-medium transition-all ${
                    tabRole === "customer"
                      ? "bg-surface text-foreground shadow-sm font-semibold"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  Customer
                </button>
                <button
                  type="button"
                  id="tab-owner"
                  onClick={() => switchTab("owner")}
                  className={`rounded-lg py-2 text-xs font-medium transition-all ${
                    tabRole === "owner"
                      ? "bg-surface text-foreground shadow-sm font-semibold"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  Business owner
                </button>
              </div>

              <div className="mb-6">
                <h2 className="font-display text-xl italic text-foreground">
                  {tabRole === "customer"
                    ? mode === "register"
                      ? "Create customer account"
                      : "Customer sign in"
                    : "Business owner sign in"}
                </h2>
                <p className="text-xs text-muted mt-1">
                  {tabRole === "customer"
                    ? mode === "register"
                      ? "Track your payment recoveries and subscription status"
                      : "Sign in to view your payment history and recovery actions"
                    : "Access dashboard analytics, strategy lab, and AI recovery agent"}
                </p>
              </div>
            </>
          )}

          {/* ── Form ─────────────────────────────────────────────────── */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name — register only */}
            {mode === "register" && (
              <div className="space-y-1">
                <label htmlFor="reg-name" className="block text-xs uppercase tracking-[0.14em] text-muted">
                  Full name
                </label>
                <input
                  id="reg-name"
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setError(null); }}
                  className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted outline-none focus:border-accent transition-colors"
                  placeholder="e.g. Priya Sharma"
                  required
                />
              </div>
            )}

            {/* Email / username — signin and register */}
            {mode !== "otp" && (
              <div className="space-y-1">
                <label htmlFor="auth-email" className="block text-xs uppercase tracking-[0.14em] text-muted">
                  {tabRole === "owner" ? "Email or Username" : mode === "register" ? "Email address" : "Email address"}
                </label>
                <input
                  id="auth-email"
                  type="text"
                  autoComplete={mode === "register" ? "email" : "username"}
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError(null); }}
                  className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted outline-none focus:border-accent transition-colors"
                  placeholder={tabRole === "owner" ? "host or owner@recover.ai" : "you@example.com"}
                  required
                />
              </div>
            )}

            {/* Password — signin and register */}
            {mode !== "otp" && (
              <div className="space-y-1">
                <div className="flex justify-between items-center">
                  <label htmlFor="auth-password" className="block text-xs uppercase tracking-[0.14em] text-muted">
                    Password
                  </label>
                  {mode === "signin" && (
                    <Link href="/forgot-password" className="text-xs text-accent hover:underline">
                      Forgot password?
                    </Link>
                  )}
                </div>
                <input
                  id="auth-password"
                  type="password"
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted outline-none focus:border-accent transition-colors"
                  placeholder={mode === "register" ? "Min 8 chars, letters and numbers" : "••••••••"}
                  required
                />
                {mode === "register" && (
                  <p className="text-[11px] text-muted pt-0.5">
                    Must be at least 8 characters and contain both letters and numbers.
                  </p>
                )}
              </div>
            )}

            {/* Confirm password — register only */}
            {mode === "register" && (
              <div className="space-y-1">
                <label htmlFor="auth-confirm-password" className="block text-xs uppercase tracking-[0.14em] text-muted">
                  Confirm password
                </label>
                <input
                  id="auth-confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
                  className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted outline-none focus:border-accent transition-colors"
                  placeholder="Repeat your password"
                  required
                />
              </div>
            )}

            {/* OTP code */}
            {mode === "otp" && (
              <div className="space-y-1">
                <label htmlFor="auth-otp" className="block text-xs uppercase tracking-[0.14em] text-muted">
                  6-digit Code
                </label>
                <input
                  id="auth-otp"
                  type="text"
                  maxLength={6}
                  pattern="[0-9]{6}"
                  value={otpCode}
                  onChange={(e) => { setOtpCode(e.target.value); setError(null); }}
                  className="w-full rounded-xl border border-border bg-background px-4 py-3 text-center text-xl font-mono tracking-widest text-foreground placeholder:text-muted outline-none focus:border-accent transition-colors"
                  placeholder="000000"
                  required
                  autoFocus
                />
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-500/30 bg-red-50/30 dark:bg-red-950/20 px-3.5 py-2.5 text-xs text-red-600 dark:text-red-400 leading-relaxed">
                {error}
              </div>
            )}

            <button
              type="submit"
              id="login-submit"
              disabled={loading}
              className="w-full rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white hover:bg-accent-hover active:scale-[0.98] transition-all disabled:opacity-60 shadow-sm"
            >
              {loading
                ? "Please wait..."
                : mode === "register"
                ? "Create Account"
                : mode === "otp"
                ? "Verify and Sign in"
                : "Sign in"}
            </button>
          </form>

          {/* ── Sign-up / sign-in toggle (customers) ─────────────────── */}
          {tabRole === "customer" && mode !== "otp" && (
            <div className="mt-5 text-center text-xs text-muted">
              {mode === "signin" ? (
                <p>
                  Don&apos;t have an account?{" "}
                  <button
                    type="button"
                    id="switch-register"
                    onClick={() => switchMode("register")}
                    className="font-medium text-accent hover:underline"
                  >
                    Create customer account
                  </button>
                </p>
              ) : (
                <p>
                  Already have an account?{" "}
                  <button
                    type="button"
                    id="switch-signin"
                    onClick={() => switchMode("signin")}
                    className="font-medium text-accent hover:underline"
                  >
                    Sign in
                  </button>
                </p>
              )}
            </div>
          )}

          {tabRole === "owner" && mode !== "otp" && (
            <p className="mt-5 text-center text-[11px] text-muted">
              Owner accounts are created via seed script or by invitation from an existing owner.
            </p>
          )}
        </div>

        {/* ── Demo Credentials Panel (only when demoMode is true server-side) ── */}
        {demoMode && (
          <div className="mt-6 rounded-2xl border border-border bg-surface p-4 text-xs space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-foreground text-[11px] uppercase tracking-wider">
                Demo Credentials
              </span>
              <span className="rounded px-1.5 py-0.5 text-[9px] uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300 font-medium">
                DEMO_MODE=true
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              <button
                type="button"
                id="fill-demo-owner"
                onClick={fillDemoOwner}
                className="flex flex-col text-left rounded-xl border border-border bg-background p-2.5 hover:border-accent transition-colors"
              >
                <span className="text-[10px] uppercase tracking-wider text-muted font-medium">
                  Business Owner
                </span>
                <span className="font-mono text-foreground font-semibold mt-0.5">host</span>
                <span className="text-[10px] text-muted">password: password</span>
              </button>

              <button
                type="button"
                id="fill-demo-customer"
                onClick={fillDemoCustomer}
                className="flex flex-col text-left rounded-xl border border-border bg-background p-2.5 hover:border-accent transition-colors"
              >
                <span className="text-[10px] uppercase tracking-wider text-muted font-medium">
                  Customer
                </span>
                <span className="font-mono text-foreground font-semibold mt-0.5 truncate">customer@recover.ai</span>
                <span className="text-[10px] text-muted">password: password</span>
              </button>
            </div>
            <p className="text-[10px] text-muted text-center pt-1">
              Click either box to fill demo credentials. In production mode, demo accounts do not exist.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
