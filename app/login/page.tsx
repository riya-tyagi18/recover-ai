"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { login, DEMO_USER, DEMO_PASS } from "@/lib/auth";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (login(username, password)) {
      router.push("/overview");
    } else {
      setError("Invalid credentials. Use the demo account below.");
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-10 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent-muted mb-6">
            <span className="font-display text-2xl italic text-accent">R</span>
          </div>
          <h1 className="font-display text-4xl italic tracking-tight">Recover AI</h1>
          <p className="mt-3 text-muted text-sm leading-relaxed">
            Sign in to your account
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="username" className="block text-xs uppercase tracking-[0.14em] text-muted">
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={(e) => { setUsername(e.target.value); setError(null); }}
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground placeholder:text-muted outline-none focus:border-accent transition-colors"
              placeholder="Username"
              required
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="password" className="block text-xs uppercase tracking-[0.14em] text-muted">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => { setPassword(e.target.value); setError(null); }}
              className="w-full rounded-xl border border-border bg-surface px-4 py-3 text-sm text-foreground placeholder:text-muted outline-none focus:border-accent transition-colors"
              placeholder="Password"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}

          <button
            type="submit"
            id="login-submit"
            className="w-full rounded-xl bg-accent px-5 py-3 text-sm font-medium text-white hover:bg-accent-hover active:scale-[0.98] transition-all"
          >
            Sign in
          </button>
        </form>

        {/* Demo hint */}
        <div className="mt-6 rounded-xl border border-border bg-surface px-4 py-3 text-center">
          <p className="text-xs text-muted">
            Demo account&nbsp;&nbsp;·&nbsp;&nbsp;
            <span className="font-mono text-foreground">{DEMO_USER}</span>
            {" / "}
            <span className="font-mono text-foreground">{DEMO_PASS}</span>
          </p>
        </div>
      </div>
    </div>
  );
}
