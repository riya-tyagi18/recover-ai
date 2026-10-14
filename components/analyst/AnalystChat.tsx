"use client";

import { useState, useRef, useEffect, FormEvent } from "react";
import { CustomerScatterChart } from "./CustomerScatterChart";
import { SegmentCards } from "./SegmentCards";
import { CustomerDetailCard } from "./CustomerDetailCard";
import { formatInrFromPaise } from "@/lib/format";
import type { CustomerSegmentationResult } from "@/lib/analyst/segmentation";
import type { SessionContext } from "@/lib/analyst/nlp";

type ChatMessage = {
  id: string;
  sender: "user" | "analyst";
  text: string;
  timestamp: string;
  isDataOnlyMode?: boolean;
  toolName?: string;
  toolData?: any;
  clarificationOptions?: { label: string; query: string }[];
};

const SUGGESTIONS = [
  { label: "Customer Risk Analysis", action: "customer_risk" },
  { label: "Top Failure Reasons", action: "top_failures" },
  { label: "Revenue at Risk", action: "revenue_at_risk" },
  { label: "Recovery Recommendations", action: "recommendations" },
] as const;

export function AnalystChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionContext, setSessionContext] = useState<SessionContext>({});
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  // Load initial welcome or default segment view on first mount
  useEffect(() => {
    handleAction("customer_risk", "Show initial customer risk overview");
  }, []);

  async function sendQuery(queryText: string, action?: string, custId?: string) {
    if (!queryText.trim() && !action) return;

    const userMsgId = `user_${Date.now()}`;
    const userMessage: ChatMessage = {
      id: userMsgId,
      sender: "user",
      text: queryText,
      timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/analyst", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-rai-auth": "1", // Pass auth header
        },
        body: JSON.stringify({
          message: action ? undefined : queryText,
          action,
          customerId: custId,
          sessionContext,
        }),
      });

      if (!res.ok) {
        if (res.status === 429) {
          throw new Error("Rate limit exceeded. Please wait a moment before sending more queries.");
        }
        if (res.status === 401) {
          throw new Error("Authentication session expired. Please log in again.");
        }
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `Server responded with ${res.status}`);
      }

      const data = await res.json();

      // Update session context if returned by server
      if (data.updatedContext) {
        setSessionContext((prev) => ({ ...prev, ...data.updatedContext }));
        if (data.updatedContext.lastCustomerId) {
          setSelectedCustomerId(data.updatedContext.lastCustomerId);
        }
      }

      const analystMsgId = `analyst_${Date.now()}`;
      const analystMessage: ChatMessage = {
        id: analystMsgId,
        sender: "analyst",
        text: data.text || "Here are the findings based on the current dataset.",
        timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
        isDataOnlyMode: data.isDataOnlyMode,
        toolName: data.toolName,
        toolData: data.toolData,
        clarificationOptions: data.clarificationOptions,
      };

      setMessages((prev) => [...prev, analystMessage]);
    } catch (err) {
      console.error("Analyst query failure:", err);
      setError(err instanceof Error ? err.message : "Failed to retrieve analysis.");
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!input.trim() || loading) return;
    sendQuery(input);
  }

  function handleAction(actionName: string, label: string) {
    if (loading) return;
    sendQuery(label, actionName);
  }

  async function handleSelectCustomer(customerId: string) {
    setSelectedCustomerId(customerId);
    setSessionContext((prev) => ({ ...prev, lastCustomerId: customerId }));

    try {
      const res = await fetch("/api/analyst", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-rai-auth": "1",
        },
        body: JSON.stringify({
          action: "customer_detail",
          customerId,
          sessionContext: { ...sessionContext, lastCustomerId: customerId },
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.toolData && json.toolData.found) {
          if (json.updatedContext) {
            setSessionContext((prev) => ({ ...prev, ...json.updatedContext }));
          }
          const msgId = `cust_analysis_${Date.now()}`;
          setMessages((prev) => [
            ...prev,
            {
              id: msgId,
              sender: "analyst",
              text: `Detailed diagnostic analysis for **${json.toolData.customer.customer.customerName}** (\`${customerId}\`):`,
              timestamp: new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }),
              isDataOnlyMode: true,
              toolName: "getCustomer",
              toolData: json.toolData,
            },
          ]);
        }
      }
    } catch (err) {
      console.error("Failed to load customer profile:", err);
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] min-h-[580px] card overflow-hidden border-border bg-surface">
      {/* ─── Header & Suggestion Pills ─── */}
      <div className="p-4 sm:p-5 border-b border-border bg-surface-subtle/80 flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-accent-muted flex items-center justify-center text-accent font-display italic font-bold">
              AI
            </div>
            <div>
              <h2 className="font-display text-lg italic text-foreground leading-tight">
                Payment Recovery Analyst
              </h2>
              <p className="text-[11px] text-muted">
                Local NLP &amp; Deterministic Engine · Free text &amp; automated diagnostics
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {sessionContext.lastCustomerId && (
              <span className="badge-pending text-[10px] hidden sm:inline-flex">
                Active Context: <strong className="font-mono ml-1">{sessionContext.lastCustomerId}</strong>
              </span>
            )}
            <span className="badge-recovered text-[10px]">Deterministic Engine Active</span>
          </div>
        </div>

        {/* Suggestion action buttons */}
        <div className="flex flex-wrap gap-2 pt-1">
          {SUGGESTIONS.map((s) => (
            <button
              key={s.action}
              type="button"
              disabled={loading}
              onClick={() => handleAction(s.action, s.label)}
              className="px-3 py-1.5 rounded-lg border border-border bg-surface hover:border-accent hover:text-accent text-xs font-medium text-foreground transition-all active:scale-[0.98] disabled:opacity-50"
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Chat Message Feed ─── */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
        {messages.length === 0 && (
          <div className="h-full flex flex-col items-center justify-center text-center p-8 max-w-md mx-auto text-muted space-y-3">
            <div className="w-12 h-12 rounded-xl bg-accent-muted flex items-center justify-center text-accent text-xl font-display italic">
              R
            </div>
            <h3 className="font-display text-xl italic text-foreground">
              Ask the Recovery Analyst
            </h3>
            <p className="text-xs leading-relaxed">
              Ask questions about any customer (e.g. &ldquo;tell me about riya mehta&rdquo; or &ldquo;cust_42_005&rdquo;), risk segments, payment failure causes, or revenue at risk.
            </p>
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
          >
            {/* Sender & Timestamp */}
            <div className="flex items-center gap-2 mb-1 px-1 text-[10px] text-muted">
              <span>{msg.sender === "user" ? "You" : "Recovery Analyst"}</span>
              <span>·</span>
              <span>{msg.timestamp}</span>
              {msg.isDataOnlyMode && (
                <span className="text-[9px] text-muted border border-border px-1.5 py-0.2 rounded bg-surface-subtle">
                  Running in data-only mode
                </span>
              )}
            </div>

            {/* Bubble */}
            <div
              className={`max-w-3xl rounded-xl p-4 text-xs leading-relaxed space-y-3 ${
                msg.sender === "user"
                  ? "bg-accent text-white"
                  : "card border-border bg-surface text-foreground shadow-sm"
              }`}
            >
              {/* Plain English explanation */}
              <div className="whitespace-pre-wrap">{msg.text}</div>

              {/* Clarification Chips if multiple matches or ambiguous intent */}
              {msg.clarificationOptions && msg.clarificationOptions.length > 0 && (
                <div className="pt-2 border-t border-border-subtle flex flex-wrap gap-1.5">
                  {msg.clarificationOptions.map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => sendQuery(opt.query)}
                      className="px-2.5 py-1 rounded-md border border-accent/40 bg-accent-muted/30 hover:bg-accent hover:text-white text-accent font-medium text-[11px] transition-colors"
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              )}

              {/* ─── Render Rich Payload Elements Based on Tool Data ─── */}
              {msg.toolData && renderToolPayload(msg.toolName, msg.toolData, handleSelectCustomer)}
            </div>
          </div>
        ))}

        {/* Loading Spinner */}
        {loading && (
          <div className="flex items-center gap-2 text-xs text-muted p-2">
            <span className="w-2 h-2 rounded-full bg-accent animate-ping" />
            <span>Retrieving records and executing analysis…</span>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="p-3 rounded-lg border border-red-200 bg-red-50 text-red-800 text-xs">
            {error}
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* ─── Free-Typing Input Form ─── */}
      <form onSubmit={handleSubmit} className="p-3 sm:p-4 border-t border-border bg-surface-subtle">
        <div className="flex items-center gap-2">
          <input
            id="analyst-chat-input"
            type="text"
            placeholder="Ask about a customer ('tell me about riya mehta'), risk segment, failure reasons, or revenue at risk…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-surface text-foreground placeholder:text-muted text-xs outline-none focus:border-accent transition-colors"
          />
          <button
            id="analyst-submit-btn"
            type="submit"
            disabled={loading || !input.trim()}
            className="px-5 py-2.5 rounded-lg bg-accent hover:bg-accent-hover text-white text-xs font-medium transition-all disabled:opacity-50"
          >
            Ask
          </button>
        </div>
      </form>
    </div>
  );
}

/**
 * Renders structured interactive cards and charts directly in the chat stream.
 */
function renderToolPayload(
  toolName?: string,
  data?: any,
  onSelectCustomer?: (id: string) => void
) {
  if (!data) return null;

  // 1. Customer Risk Segmentation (Scatter plot + Segment Cards)
  if (data.segments && data.scatterData) {
    return (
      <div className="space-y-4 pt-3 border-t border-border-subtle w-full">
        <SegmentCards
          segments={data.segments}
          onSelectCustomer={(id) => onSelectCustomer && onSelectCustomer(id)}
        />
        <CustomerScatterChart
          data={data.scatterData}
          onSelectCustomer={(id) => onSelectCustomer && onSelectCustomer(id)}
        />
      </div>
    );
  }

  // 2. Single Customer Analysis
  if (data.found && data.customer && data.customer.primarySegment) {
    return (
      <div className="pt-3 border-t border-border-subtle w-full">
        <CustomerDetailCard data={data.customer} payments={data.payments || []} />
      </div>
    );
  }

  // 3. Unknown Customer with Close Matches
  if (data.found === false && data.closeMatches) {
    return (
      <div className="pt-2 border-t border-border-subtle space-y-2">
        <p className="text-xs text-amber-800 font-medium">
          Query was not found in the dataset. Did you mean one of these accounts?
        </p>
        <div className="flex flex-wrap gap-2">
          {data.closeMatches.map((match: { id: string; name?: string }) => (
            <button
              key={match.id}
              type="button"
              onClick={() => onSelectCustomer && onSelectCustomer(match.id)}
              className="px-2.5 py-1 rounded border border-border bg-surface hover:border-accent text-accent font-mono text-xs transition-colors"
            >
              {match.id} {match.name ? `(${match.name})` : ""}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // 4. Top Failure Reasons Breakdown
  if (data.reasons && Array.isArray(data.reasons)) {
    return (
      <div className="pt-3 border-t border-border-subtle space-y-2 w-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          {data.reasons.map((r: any) => (
            <div key={r.category} className="p-2.5 rounded border border-border bg-surface flex justify-between items-center">
              <div>
                <p className="font-semibold text-foreground">{r.label}</p>
                <p className="text-[10px] text-muted">
                  {r.count} payments · {formatInrFromPaise(r.amountPaise)}
                </p>
              </div>
              <div className="text-right">
                <span className="font-semibold text-foreground">{r.percentage}%</span>
                <p className="text-[10px] text-accent font-medium">
                  {r.recoveryRate.toFixed(0)}% recovered
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 5. Revenue at Risk Breakdown
  if (data.valueAtRiskFormatted && data.byMethod) {
    return (
      <div className="pt-3 border-t border-border-subtle space-y-3 w-full">
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="p-2 rounded border border-border bg-surface">
            <span className="text-[10px] uppercase text-muted font-medium">At Risk</span>
            <p className="font-semibold text-foreground mt-0.5">{data.valueAtRiskFormatted}</p>
          </div>
          <div className="p-2 rounded border border-border bg-surface">
            <span className="text-[10px] uppercase text-muted font-medium">Recovered</span>
            <p className="font-semibold text-accent mt-0.5">{data.recoveredFormatted}</p>
          </div>
          <div className="p-2 rounded border border-border bg-surface">
            <span className="text-[10px] uppercase text-muted font-medium">Recovery Rate</span>
            <p className="font-semibold text-foreground mt-0.5">{data.recoveryRateFormatted}</p>
          </div>
        </div>

        <div className="space-y-1.5 pt-1">
          <p className="text-[11px] font-medium text-foreground">Breakdown by Payment Method:</p>
          {data.byMethod.map((m: any) => (
            <div key={m.method} className="flex justify-between items-center text-xs p-1.5 rounded bg-surface border border-border-subtle">
              <span className="font-medium text-foreground">{m.method}</span>
              <span className="text-muted">
                {m.count} txns · {formatInrFromPaise(m.valuePaise)} ({m.recoveryRate.toFixed(1)}% recovered)
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // 6. Priority Recommendations List
  if (data.criterion && data.customers) {
    return (
      <div className="pt-3 border-t border-border-subtle space-y-2 w-full">
        <p className="text-xs font-semibold text-foreground">Priority Customer Cases:</p>
        <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1 text-xs">
          {data.customers.map((c: any) => (
            <div
              key={c.id}
              onClick={() => onSelectCustomer && onSelectCustomer(c.id)}
              className="p-2 rounded border border-border bg-surface hover:border-accent cursor-pointer flex justify-between items-center transition-colors"
            >
              <div>
                <p className="font-semibold text-foreground flex items-center gap-1.5">
                  <span>{c.name}</span>
                  <span className="font-mono text-[10px] text-muted">({c.id})</span>
                </p>
                <p className="text-[10px] text-muted">{c.recommendedAction}</p>
              </div>
              <div className="text-right">
                <span className="font-semibold text-accent">
                  {formatInrFromPaise(c.valueAtRiskPaise)}
                </span>
                <p className="text-[10px] text-muted">{(c.failureRate * 100).toFixed(0)}% fail rate</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}
