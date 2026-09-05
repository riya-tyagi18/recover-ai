"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BatchDetail } from "@/lib/batch-types";

type Step = {
  label: string;
  done: boolean;
  active: boolean;
};

type FlowState =
  | "idle"
  | "connecting"
  | "analysing"
  | "recovering"
  | "done"
  | "error";

const PROVIDERS = [
  { id: "razorpay", name: "Razorpay", abbr: "RZ" },
  { id: "stripe", name: "Stripe", abbr: "ST" },
  { id: "payu", name: "PayU", abbr: "PU" },
];

export default function ConnectPage() {
  const router = useRouter();
  const [flowState, setFlowState] = useState<FlowState>("idle");
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function startConnect(providerId: string) {
    setSelectedProvider(providerId);
    setFlowState("connecting");

    const allSteps: Step[] = [
      { label: "Authenticating with your payment provider", done: false, active: true },
      { label: "Importing your transaction history", done: false, active: false },
      { label: "Identifying failed payments", done: false, active: false },
      { label: "Running recovery analysis", done: false, active: false },
      { label: "Dashboard ready", done: false, active: false },
    ];
    setSteps(allSteps);

    try {
      // Step 0: auth handshake (fake OAuth delay)
      await delay(900);
      markStep(0, true, 1);

      // Step 1: import transactions
      setFlowState("analysing");
      await delay(700);
      markStep(1, true, 2);

      // Step 2: identify failures
      await delay(500);
      markStep(2, true, 3);

      // Step 3: run recovery analysis — actually call the API
      setFlowState("recovering");
      const batchRes = await fetch("/api/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ seed: 42, count: 100 }),
      });
      
      let batchData: { batch?: BatchDetail; error?: string } = {};
      if (batchRes.headers.get("content-type")?.includes("application/json")) {
        batchData = await batchRes.json();
      }
      if (!batchRes.ok || !batchData.batch) {
        throw new Error(batchData.error ?? `Failed to load transactions (${batchRes.status}).`);
      }

      // Run the recovery pipeline
      const runRes = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ batchId: batchData.batch.id }),
      });
      
      let runData: { error?: string } = {};
      if (runRes.headers.get("content-type")?.includes("application/json")) {
        runData = await runRes.json();
      }
      if (!runRes.ok) {
        throw new Error(runData.error ?? `Recovery pipeline failed (${runRes.status}).`);
      }

      markStep(3, true, 4);
      await delay(400);

      // Step 4: done
      markStep(4, true, -1);
      setFlowState("done");

      await delay(800);
      router.push("/overview");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setFlowState("error");
    }
  }

  function markStep(idx: number, done: boolean, nextIdx: number) {
    setSteps((prev) =>
      prev.map((s, i) => ({
        ...s,
        done: i <= idx ? done : s.done,
        active: i === nextIdx,
      }))
    );
  }

  function delay(ms: number) {
    return new Promise<void>((r) => setTimeout(r, ms));
  }

  if (flowState === "idle") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md">
          {/* Hero */}
          <div className="mb-10 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-accent-muted mb-6">
              <span className="font-display text-2xl italic text-accent">R</span>
            </div>
            <h1 className="font-display text-4xl italic tracking-tight">
              Recover AI
            </h1>
            <p className="mt-3 text-muted text-base leading-relaxed max-w-sm mx-auto">
              Connect your payment account. We&apos;ll automatically find and
              recover failed transactions.
            </p>
          </div>

          {/* Provider cards */}
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.16em] text-muted mb-4">
              Select your payment provider
            </p>
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => void startConnect(p.id)}
                className="w-full flex items-center gap-4 rounded-xl border border-border bg-surface px-5 py-4 text-left transition-all hover:border-accent hover:shadow-sm active:scale-[0.98]"
              >
                <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-accent-muted text-[11px] font-bold tracking-wider text-accent">{p.abbr}</span>
                <div className="flex-1">
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-muted mt-0.5">Authorise read-only access</p>
                </div>
                <span className="text-muted text-lg">→</span>
              </button>
            ))}
          </div>

          <p className="mt-6 text-center text-xs text-muted leading-relaxed">
            Read-only access · No charges made
          </p>
        </div>
      </div>
    );
  }

  if (flowState === "error") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-4">
        <div className="w-full max-w-md text-center">
          <div className="text-4xl mb-4">⚠️</div>
          <h2 className="font-display text-2xl italic">Connection failed</h2>
          <p className="mt-2 text-sm text-muted">{error}</p>
          <button
            type="button"
            onClick={() => {
              setFlowState("idle");
              setError(null);
              setSteps([]);
            }}
            className="mt-6 rounded-md bg-accent px-6 py-2 text-sm text-white hover:bg-accent-hover transition-colors"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  // Loading / progress state
  const providerName = PROVIDERS.find((p) => p.id === selectedProvider)?.name ?? "your account";
  const headings: Record<FlowState, string> = {
    connecting: `Connecting to ${providerName}…`,
    analysing: "Scanning your transactions…",
    recovering: "Running recovery analysis…",
    done: "Dashboard ready ✓",
    idle: "",
    error: "",
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div
            className={`inline-flex items-center justify-center w-14 h-14 rounded-full mb-5 ${
              flowState === "done"
                ? "bg-green-100"
                : "bg-accent-muted"
            }`}
          >
            {flowState === "done" ? (
              <span className="text-2xl">✓</span>
            ) : (
              <Spinner />
            )}
          </div>
          <h2 className="font-display text-2xl italic">{headings[flowState]}</h2>
        </div>

        <div className="space-y-4">
          {steps.map((step, i) => (
            <div key={i} className="flex items-center gap-3">
              <div
                className={`shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs border transition-all duration-300 ${
                  step.done
                    ? "bg-accent border-accent text-white"
                    : step.active
                    ? "border-accent border-2 bg-accent-muted"
                    : "border-border bg-surface text-muted"
                }`}
              >
                {step.done ? "✓" : i + 1}
              </div>
              <p
                className={`text-sm transition-colors duration-200 ${
                  step.done
                    ? "text-foreground"
                    : step.active
                    ? "text-foreground"
                    : "text-muted"
                }`}
              >
                {step.label}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-5 w-5 text-accent"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
