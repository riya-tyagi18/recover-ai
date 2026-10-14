"use client";

import { useState } from "react";
import { formatInrFromPaise } from "@/lib/format";
import type { SegmentSummary } from "@/lib/analyst/engine";
import { SEGMENT_METADATA, type SegmentType } from "@/lib/analyst/segmentation";

interface SegmentCardsProps {
  segments: SegmentSummary[];
  selectedSegment?: SegmentType | null;
  onSelectSegment?: (segment: SegmentType | null) => void;
  onSelectCustomer: (customerId: string) => void;
}

export function SegmentCards({
  segments,
  selectedSegment,
  onSelectSegment,
  onSelectCustomer,
}: SegmentCardsProps) {
  const [activeSegment, setActiveSegment] = useState<SegmentType | null>(selectedSegment || null);
  const [searchQuery, setSearchQuery] = useState("");

  const handleCardClick = (seg: SegmentType) => {
    const next = activeSegment === seg ? null : seg;
    setActiveSegment(next);
    if (onSelectSegment) onSelectSegment(next);
  };

  const currentSegmentData = segments.find((s) => s.segment === activeSegment);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-display text-lg italic text-foreground">Risk Segment Distribution</h3>
          <p className="text-xs text-muted">
            Click any segment card to inspect and drill down into affected customer accounts.
          </p>
        </div>
        {activeSegment && (
          <button
            type="button"
            onClick={() => handleCardClick(activeSegment)}
            className="text-xs text-accent hover:underline font-medium"
          >
            Clear selection
          </button>
        )}
      </div>

      {/* 5 Segment Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        {segments.map((s) => {
          const meta = SEGMENT_METADATA[s.segment];
          const isSelected = activeSegment === s.segment;

          return (
            <div
              key={s.segment}
              onClick={() => handleCardClick(s.segment)}
              className={`card card-hover p-4 cursor-pointer transition-all border text-left relative flex flex-col justify-between ${
                isSelected
                  ? "border-accent ring-2 ring-accent/20 bg-surface-subtle"
                  : "border-border hover:border-border/80"
              }`}
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: meta.color }}
                  />
                  <span className="font-display text-xl italic font-semibold text-foreground">
                    {s.count}
                  </span>
                </div>
                <p className="font-semibold text-sm text-foreground leading-tight">{s.label}</p>
                <p className="text-[11px] text-muted mt-1 leading-relaxed line-clamp-2">
                  {s.meaning}
                </p>
              </div>

              <div className="pt-3 mt-3 border-t border-border-subtle text-xs space-y-1">
                <div className="flex justify-between text-muted">
                  <span className="text-[10px] uppercase tracking-wider">Avg Fail Rate</span>
                  <span className="font-medium text-foreground">{s.averageFailureRate}%</span>
                </div>
                <div className="flex justify-between text-muted">
                  <span className="text-[10px] uppercase tracking-wider">Revenue at Risk</span>
                  <span className="font-medium text-accent">
                    {formatInrFromPaise(s.revenueAtRiskPaise)}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Customer Drill-Down Section when a Segment Card is active */}
      {activeSegment && currentSegmentData && (
        <div className="card p-5 space-y-3 bg-surface-subtle border-accent/30 animate-fadeIn">
          <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-border-subtle">
            <div className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: SEGMENT_METADATA[activeSegment]?.color }}
              />
              <h4 className="font-semibold text-sm text-foreground">
                {activeSegment} Accounts ({currentSegmentData.customerIds.length} customers)
              </h4>
            </div>
            <input
              type="text"
              placeholder="Filter customer ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs px-2.5 py-1.5 rounded-md border border-border bg-surface text-foreground outline-none focus:border-accent w-48"
            />
          </div>

          <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-1">
            {currentSegmentData.customerIds
              .filter((id) => id.toLowerCase().includes(searchQuery.toLowerCase()))
              .map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSelectCustomer(id)}
                  className="px-2.5 py-1.5 rounded-md border border-border bg-surface hover:border-accent hover:text-accent font-mono text-xs transition-colors flex items-center gap-1.5"
                >
                  <span>{id}</span>
                  <svg className="w-3 h-3 opacity-60" viewBox="0 0 16 16" fill="none">
                    <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              ))}
            {currentSegmentData.customerIds.length === 0 && (
              <p className="text-xs text-muted py-2">No customers in this segment.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
