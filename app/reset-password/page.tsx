"use client";

import { useState, FormEvent, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
      setError("Password must contain both letters and numbers.");
      return;
    }

    if (!token) {
      setError("Reset token is missing. Please click the link from your email.");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword: password }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to reset password.");
      }

      setSuccess(true);
    } catch (err: unknown) {
      setError((err as Error).message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-md">
      {/* Logo */}
      <div className="mb-8 text-center">
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-accent-muted mb-4">
          <span className="font-display text-2xl italic font-bold text-accent">R</span>
        </div>
        <h1 className="font-display text-3xl italic tracking-tight text-foreground">Recover AI</h1>
        <p className="mt-1 text-muted text-xs">Set new account password</p>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-6 sm:p-8 shadow-sm space-y-5">
        {!success ? (
          <>
            <div>
              <h2 className="font-display text-xl italic text-foreground">Create new password</h2>
              <p className="mt-1 text-xs text-muted">
                Your new password must be at least 8 characters with letters and numbers. Setting a new password will invalidate all active sessions.
              </p>
            </div>

            {!token && (
              <div className="rounded-xl border border-amber-300/50 bg-amber-50/20 p-3.5 text-xs text-amber-800 dark:text-amber-300">
                Warning: No reset token detected in the URL. Please ensure you clicked the full link sent to your email.
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label htmlFor="new-pass" className="block text-xs uppercase tracking-[0.14em] text-muted">
                  New Password
                </label>
                <input
                  id="new-pass"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError(null); }}
                  className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted outline-none focus:border-accent transition-colors"
                  placeholder="Min 8 characters"
                  required
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="confirm-pass" className="block text-xs uppercase tracking-[0.14em] text-muted">
                  Confirm Password
                </label>
                <input
                  id="confirm-pass"
                  type="password"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
                  className="w-full rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-foreground placeholder:text-muted outline-none focus:border-accent transition-colors"
                  placeholder="Repeat new password"
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
                disabled={loading || !token}
                className="w-full rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white hover:bg-accent-hover active:scale-[0.98] transition-all disabled:opacity-60 shadow-sm"
              >
                {loading ? "Updating password..." : "Update Password"}
              </button>
            </form>
          </>
        ) : (
          <div className="space-y-4 text-center">
            <div className="mx-auto w-12 h-12 rounded-full bg-accent-muted text-accent flex items-center justify-center">
              <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none">
                <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h2 className="font-display text-xl italic text-foreground">Password updated!</h2>
            <p className="text-xs text-muted leading-relaxed">
              Your password has been changed and all old active sessions were successfully invalidated. You can now sign in with your new credentials.
            </p>
            <button
              type="button"
              onClick={() => router.push("/login")}
              className="w-full rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white hover:bg-accent-hover transition-colors shadow-sm"
            >
              Sign in now
            </button>
          </div>
        )}

        {!success && (
          <div className="pt-2 text-center">
            <Link href="/login" className="text-xs text-accent hover:underline">
              ← Return to sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <Suspense fallback={<p className="text-sm text-muted">Loading reset interface...</p>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
