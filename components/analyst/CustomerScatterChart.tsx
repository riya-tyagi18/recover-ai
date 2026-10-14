"use client";

import { useState } from "react";
import {
  ResponsiveContainer,
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  Cell,
  CartesianGrid,
} from "recharts";
import { formatInrFromPaise } from "@/lib/format";
import type { ScatterPlotPoint } from "@/lib/analyst/engine";
import { SEGMENT_METADATA, type SegmentType } from "@/lib/analyst/segmentation";

interface CustomerScatterChartProps {
  data: ScatterPlotPoint[];
  highlightCustomerId?: string | null;
  onSelectCustomer?: (customerId: string) => void;
}

export function CustomerScatterChart({
  data,
  highlightCustomerId,
  onSelectCustomer,
}: CustomerScatterChartProps) {
  const [hoveredPoint, setHoveredPoint] = useState<ScatterPlotPoint | null>(null);

  // Group by segment for custom styling or filtering if needed
  const segments: SegmentType[] = [
    "High Risk",
    "High Failure Frequency",
    "Recovery on Retry",
    "High Value",
    "Healthy",
  ];

  return (
    <div className="card p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-display text-lg italic text-foreground">
            Customer Risk Matrix
          </h3>
          <p className="text-xs text-muted">
            Failure Rate (%) vs. Total Transaction Value (₹). Click any point to inspect customer.
          </p>
        </div>
        {highlightCustomerId && (
          <span className="badge-at-risk text-[11px]">
            Selected: <strong className="font-mono ml-1">{highlightCustomerId}</strong>
          </span>
        )}
      </div>

      {/* Chart Canvas */}
      <div className="h-[300px] w-full pt-1">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart margin={{ top: 12, right: 16, bottom: 12, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e8efe9" />
            <XAxis
              type="number"
              dataKey="failureRatePct"
              name="Failure Rate"
              unit="%"
              domain={[0, 100]}
              tick={{ fontSize: 11, fill: "#5e6d66" }}
              tickLine={false}
              axisLine={{ stroke: "#dbe4de" }}
              label={{
                value: "Failure Rate (%)",
                position: "insideBottom",
                offset: -8,
                fontSize: 11,
                fill: "#5e6d66",
              }}
            />
            <YAxis
              type="number"
              dataKey="totalValueInr"
              name="Transaction Value"
              tick={{ fontSize: 11, fill: "#5e6d66" }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(val: number) =>
                val >= 100000
                  ? `₹${(val / 100000).toFixed(1)}L`
                  : val >= 1000
                  ? `₹${(val / 1000).toFixed(0)}k`
                  : `₹${val}`
              }
              label={{
                value: "Transaction Value (₹)",
                angle: -90,
                position: "insideLeft",
                offset: 12,
                fontSize: 11,
                fill: "#5e6d66",
              }}
            />
            <ZAxis type="number" range={[45, 160]} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null;
                const pt = payload[0].payload as ScatterPlotPoint;
                return (
                  <div className="rounded-lg border border-border bg-surface p-3 shadow-md text-xs space-y-1 min-w-[200px]">
                    <div className="flex items-center justify-between pb-1 border-b border-border-subtle">
                      <span className="font-semibold text-foreground">{pt.customerName}</span>
                      <span className="font-mono text-[10px] text-muted">{pt.customerId}</span>
                    </div>
                    <div className="flex justify-between text-muted pt-0.5">
                      <span>Primary Segment:</span>
                      <span
                        className="font-medium"
                        style={{ color: SEGMENT_METADATA[pt.segment]?.color }}
                      >
                        {pt.segment}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted">
                      <span>Failure Rate:</span>
                      <span className="font-semibold text-foreground">{pt.failureRatePct}%</span>
                    </div>
                    <div className="flex justify-between text-muted">
                      <span>Total Value:</span>
                      <span className="font-semibold text-foreground">
                        ₹{pt.totalValueInr.toLocaleString("en-IN")}
                      </span>
                    </div>
                    <div className="flex justify-between text-muted">
                      <span>Value at Risk:</span>
                      <span className="font-semibold text-accent">
                        ₹{pt.valueAtRiskInr.toLocaleString("en-IN")}
                      </span>
                    </div>
                    {pt.isLowConfidence && (
                      <p className="text-[10px] text-amber-700 font-medium pt-1">
                        Low confidence (fewer than 3 attempts)
                      </p>
                    )}
                    <p className="text-[10px] text-muted pt-1 text-center italic">
                      Click point to view full profile
                    </p>
                  </div>
                );
              }}
            />
            <Scatter
              data={data}
              onClick={(e: unknown) => {
                const pt = (e as { payload?: ScatterPlotPoint })?.payload;
                if (pt?.customerId && onSelectCustomer) {
                  onSelectCustomer(pt.customerId);
                }
              }}
            >
              {data.map((entry) => {
                const isSelected = highlightCustomerId === entry.customerId;
                return (
                  <Cell
                    key={entry.customerId}
                    fill={entry.color}
                    stroke={isSelected ? "#141916" : "#ffffff"}
                    strokeWidth={isSelected ? 3 : 1.5}
                    onClick={() => onSelectCustomer && onSelectCustomer(entry.customerId)}
                    style={{ cursor: "pointer", transition: "transform 0.15s ease" }}
                  />
                );
              })}
            </Scatter>
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Consistent Legend */}
      <div className="flex flex-wrap items-center justify-center gap-4 pt-2 border-t border-border-subtle text-xs">
        {segments.map((seg) => {
          const meta = SEGMENT_METADATA[seg];
          return (
            <div key={seg} className="flex items-center gap-1.5 text-muted">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: meta.color }}
              />
              <span className="text-[11px] font-medium text-foreground">{seg}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
