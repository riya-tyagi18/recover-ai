"use client";

import { useState, useEffect } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { formatInrFromPaise } from "@/lib/format";

export type TimeSeriesPoint = {
  timestamp: string;
  label: string;
  atRiskPaise: number;
  recoveredPaise: number;
  atRiskInr: number;
  recoveredInr: number;
};

export type ReasonSlice = {
  category: string;
  name: string;
  count: number;
  percentage: number;
  amountPaise: number;
  recoveredPaise: number;
  recoveryRate: number;
  color: string;
};

export type MethodStat = {
  method: string;
  name: string;
  count: number;
  recoveredCount: number;
  amountPaise: number;
  recoveredPaise: number;
  recoveryRate: number;
};

interface DashboardChartsProps {
  timeSeries: TimeSeriesPoint[];
  failureReasons: ReasonSlice[];
  paymentMethods: MethodStat[];
  totalPayments: number;
  valueAtRiskPaise: number;
  recoveredPaise: number;
  recoveryRate: number;
}

// Restrained fintech color palette (no purple, no neon)
const PALETTE = [
  "#1e7054", // Emerald (primary)
  "#3b5998", // Slate blue
  "#b45309", // Amber/terracotta
  "#4d7c67", // Muted sage/forest
  "#8c5332", // Warm copper
  "#5a6b7c", // Slate grey
  "#2d5a43", // Deep pine
  "#6b7280", // Neutral grey
];

export function DashboardCharts({
  timeSeries,
  failureReasons,
  paymentMethods,
  totalPayments,
  valueAtRiskPaise,
  recoveredPaise,
  recoveryRate,
}: DashboardChartsProps) {
  const [mounted, setMounted] = useState(false);
  const [activeReasonIndex, setActiveReasonIndex] = useState<number | null>(null);
  const [chartTab, setChartTab] = useState<"reasons" | "methods">("reasons");

  useEffect(() => {
    setMounted(true);
  }, []);

  const totalReasonCount = failureReasons.reduce((sum, r) => sum + r.count, 0);

  // Fallback while client mounts
  if (!mounted) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card p-6 min-h-[360px] flex items-center justify-center">
          <p className="text-xs text-muted">Loading charts…</p>
        </div>
        <div className="card p-6 min-h-[360px] flex items-center justify-center">
          <p className="text-xs text-muted">Loading charts…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* ─── 1. Line/Area Chart: Recovered vs At-Risk Over Time ─── */}
      <div className="card p-6 flex flex-col justify-between">
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div>
              <h2 className="font-display text-xl italic text-foreground">
                Revenue Recovery Timeline
              </h2>
              <p className="text-xs text-muted mt-0.5">
                Cumulative at-risk value vs automated recovered revenue over the batch duration
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1.5 text-muted font-medium">
                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#b45309]" />
                At Risk
              </span>
              <span className="flex items-center gap-1.5 text-muted font-medium">
                <span className="inline-block w-2.5 h-2.5 rounded-sm bg-[#1e7054]" />
                Recovered
              </span>
            </div>
          </div>

          {/* Quick verification summary bar */}
          <div className="my-4 grid grid-cols-3 gap-2 rounded-lg border border-border-subtle bg-surface-subtle p-3 text-xs">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted font-medium">Total At Risk</p>
              <p className="font-semibold text-foreground mt-0.5">
                {formatInrFromPaise(valueAtRiskPaise)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted font-medium">Total Recovered</p>
              <p className="font-semibold text-accent mt-0.5">
                {formatInrFromPaise(recoveredPaise)}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted font-medium">Overall Rate</p>
              <p className="font-semibold text-foreground mt-0.5">
                {recoveryRate.toFixed(1)}%
              </p>
            </div>
          </div>
        </div>

        {/* Area Chart Container */}
        <div className="h-[250px] w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={timeSeries} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="atRiskGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#b45309" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#b45309" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="recoveredGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#1e7054" stopOpacity={0.25} />
                  <stop offset="95%" stopColor="#1e7054" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e8efe9" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#5e6d66" }}
                tickLine={false}
                axisLine={{ stroke: "#dbe4de" }}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#5e6d66" }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(val: number) => `₹${val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val}`}
              />
              <Tooltip
                content={({ active, payload }) => {
                  if (!active || !payload || !payload.length) return null;
                  const pt = payload[0].payload as TimeSeriesPoint;
                  return (
                    <div className="rounded-lg border border-border bg-surface p-3 shadow-md text-xs space-y-1.5 min-w-[170px]">
                      <p className="font-medium text-foreground pb-1 border-b border-border-subtle">
                        {pt.label}
                      </p>
                      <div className="flex justify-between items-center text-muted">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-sm bg-[#b45309]" />
                          Value at risk:
                        </span>
                        <span className="font-semibold text-foreground">
                          {formatInrFromPaise(pt.atRiskPaise)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-muted">
                        <span className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-sm bg-[#1e7054]" />
                          Recovered:
                        </span>
                        <span className="font-semibold text-accent">
                          {formatInrFromPaise(pt.recoveredPaise)}
                        </span>
                      </div>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="atRiskInr"
                name="At Risk"
                stroke="#b45309"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#atRiskGradient)"
              />
              <Area
                type="monotone"
                dataKey="recoveredInr"
                name="Recovered"
                stroke="#1e7054"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#recoveredGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ─── 2. Pie/Donut Chart: Failure Reasons & Breakdown ─── */}
      <div className="card p-6 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-2 mb-2">
            <div>
              <h2 className="font-display text-xl italic text-foreground">
                Payment Failure Diagnostics
              </h2>
              <p className="text-xs text-muted mt-0.5">
                Root causes detected across all failed transactions
              </p>
            </div>
            <div className="inline-flex rounded-md border border-border bg-surface-subtle p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setChartTab("reasons")}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  chartTab === "reasons"
                    ? "bg-surface text-foreground shadow-sm"
                    : "text-muted hover:text-foreground"
                }`}
              >
                Reasons
              </button>
              <button
                type="button"
                onClick={() => setChartTab("methods")}
                className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                  chartTab === "methods"
                    ? "bg-surface text-foreground shadow-sm"
                    : "text-muted hover:text-foreground"
                }`}
              >
                Methods
              </button>
            </div>
          </div>
        </div>

        {chartTab === "reasons" ? (
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-4 items-center pt-2">
            {/* Donut graphic */}
            <div className="sm:col-span-6 h-[230px] relative flex items-center justify-center">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={failureReasons}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="count"
                    onMouseEnter={(_, index) => setActiveReasonIndex(index)}
                    onMouseLeave={() => setActiveReasonIndex(null)}
                  >
                    {failureReasons.map((entry, index) => (
                      <Cell
                        key={`cell-${entry.category}`}
                        fill={entry.color || PALETTE[index % PALETTE.length]}
                        stroke="#ffffff"
                        strokeWidth={2}
                        opacity={
                          activeReasonIndex === null || activeReasonIndex === index ? 1 : 0.6
                        }
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload || !payload.length) return null;
                      const r = payload[0].payload as ReasonSlice;
                      return (
                        <div className="rounded-lg border border-border bg-surface p-2.5 shadow-md text-xs space-y-1">
                          <p className="font-semibold text-foreground">{r.name}</p>
                          <div className="flex justify-between gap-4 text-muted">
                            <span>Count:</span>
                            <span className="font-medium text-foreground">{r.count} payments</span>
                          </div>
                          <div className="flex justify-between gap-4 text-muted">
                            <span>Share:</span>
                            <span className="font-medium text-foreground">{r.percentage}%</span>
                          </div>
                          <div className="flex justify-between gap-4 text-muted">
                            <span>At risk:</span>
                            <span className="font-medium text-foreground">
                              {formatInrFromPaise(r.amountPaise)}
                            </span>
                          </div>
                          <div className="flex justify-between gap-4 text-muted">
                            <span>Recovered:</span>
                            <span className="font-medium text-accent">
                              {formatInrFromPaise(r.recoveredPaise)}
                            </span>
                          </div>
                        </div>
                      );
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>

              {/* Donut center label */}
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="font-display text-2xl italic font-semibold text-foreground">
                  {totalReasonCount}
                </span>
                <span className="text-[10px] uppercase tracking-wider text-muted">
                  Failures
                </span>
              </div>
            </div>

            {/* Compact Legend list */}
            <div className="sm:col-span-6 flex flex-col gap-2 max-h-[230px] overflow-y-auto pr-1">
              {failureReasons.map((r, i) => {
                const color = r.color || PALETTE[i % PALETTE.length];
                const isActive = activeReasonIndex === i;
                return (
                  <div
                    key={r.category}
                    onMouseEnter={() => setActiveReasonIndex(i)}
                    onMouseLeave={() => setActiveReasonIndex(null)}
                    className={`flex items-center justify-between text-xs p-1.5 rounded transition-colors cursor-pointer ${
                      isActive ? "bg-surface-subtle font-medium" : "hover:bg-surface-subtle"
                    }`}
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className="w-2.5 h-2.5 shrink-0 rounded-sm"
                        style={{ backgroundColor: color }}
                      />
                      <span className="truncate text-foreground text-[11px]">{r.name}</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 text-muted text-[11px]">
                      <span className="font-medium text-foreground">{r.count}</span>
                      <span className="w-8 text-right text-[10px]">({r.percentage}%)</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          /* Payment Methods alternative view */
          <div className="space-y-3 pt-3">
            {paymentMethods.map((m) => (
              <div key={m.method} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="font-medium text-foreground">{m.name}</span>
                  <span className="text-muted">
                    {m.recoveredCount}/{m.count} recovered ({m.recoveryRate.toFixed(1)}%) · {formatInrFromPaise(m.recoveredPaise)}
                  </span>
                </div>
                <div className="h-2 w-full bg-border rounded-full overflow-hidden">
                  <div
                    className="h-full bg-accent rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, m.recoveryRate)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
