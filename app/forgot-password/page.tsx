"use client";

import { useState, FormEvent } from "react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [demoToken, setDemoToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      setSubmitted(true);
      if (data.demoResetToken) {
        setDemoToken(data.demoResetToken);
      }
    } catch {
      setError("Failed to send reset link. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent-muted mb-4">
            <span className="font-display text-2xl italic font-bold text-accent">R</span>
          </div>
          <h1 className="font-display text-3xl italic tracking-tight text-foreground">Recover AI</h1>
          <p className="mt-1 text-muted text-xs">Reset your account password</p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-sm space-y-5">
          {!submitted ? (
            <>
              <div>
                <h2 className="font-display text-xl italic text-foreground">Forgot your password?</h2>
                <p className="mt-1 text-xs text-muted leading-relaxed">
                  Enter your email address below. If an account matches, we will send you a secure, single-use link to reset your password.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label htmlFor="reset-email" className="block text-xs uppercase tracking-[0.14em] text-muted">
                    Email address
                  </label>
                  <input
                    id="reset-email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted outline-none focus:border-accent transition-colors"
                    placeholder="you@example.com"
                    required
                  />
                </div>

                {error && (
                  <div className="rounded-xl border border-red-500/30 bg-red-50/30 dark:bg-red-950/20 px-3.5 py-2.5 text-xs text-red-600 dark:text-red-400">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white hover:bg-accent-hover active:scale-[0.98] transition-all disabled:opacity-60 shadow-sm"
                >
                  {loading ? "Sending link..." : "Send Reset Link"}
                </button>
              </form>
            </>
          ) : (
            <div className="space-y-4">
              <div className="rounded-xl border border-accent/30 bg-accent-muted/30 p-4 text-xs text-foreground leading-relaxed">
                <span className="font-semibold block mb-1 text-accent">Reset link dispatched</span>
                If an account exists with <strong className="font-medium text-foreground">{email}</strong>, a password reset link has been dispatched. The link expires in 30 minutes.
              </div>

              {demoToken && (
                <div className="rounded-xl border border-amber-300/60 bg-amber-50/30 dark:bg-amber-950/20 p-4 text-xs space-y-2">
                  <span className="font-semibold text-amber-800 dark:text-amber-300 block">
                    Demo Mode Active (No mail service needed)
                  </span>
                  <p className="text-muted text-[11px]">
                    You can immediately test the password reset flow with your demo token:
                  </p>
                  <Link
                    href={`/reset-password?token=${demoToken}`}
                    className="inline-flex items-center gap-1 font-medium text-accent hover:underline text-xs"
                  >
                    Set new password now →
                  </Link>
                </div>
              )}
            </div>
          )}

          <div className="pt-2 text-center">
            <Link href="/login" className="text-xs text-accent hover:underline">
              ← Back to sign in
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
