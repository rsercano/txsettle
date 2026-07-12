"use client";

import { useState } from "react";

import { formatUsdc } from "@/lib/format";
import type { MarketView } from "@/lib/markets";

export const OUTCOME_COLORS = ["var(--color-p1)", "var(--color-draw)", "var(--color-p2)"] as const;

export interface OutcomeLabels {
  labels: [string, string, string];
}

export function outcomeLabels(p1?: string, p2?: string): [string, string, string] {
  return [p1 ?? "P1 win", "Draw", p2 ?? "P2 win"];
}

/**
 * Stacked distribution of the three parimutuel pools. Identity is carried by
 * the legend row (color swatch + label + amount), never by color alone; empty
 * pools keep their legend entry so all three outcomes are always readable.
 */
export function PoolsBar({ market, labels, compact = false }: { market: MarketView; labels: [string, string, string]; compact?: boolean }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const total = market.totalPool;

  return (
    <div className="space-y-2">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-panel-2" role="img" aria-label={`Pool split: ${labels.map((label, i) => `${label} ${formatUsdc(market.pools[i])} USDC`).join(", ")}`}>
        {total === 0n ? (
          <div className="h-full w-full" />
        ) : (
          market.pools.map((pool, index) =>
            pool === 0n ? null : (
              <div
                key={index}
                onMouseEnter={() => setHovered(index)}
                onMouseLeave={() => setHovered(null)}
                className="h-full transition-opacity"
                style={{
                  width: `${Number((pool * 10_000n) / total) / 100}%`,
                  background: OUTCOME_COLORS[index],
                  opacity: hovered === null || hovered === index ? 1 : 0.35,
                  // 2px surface gap between adjacent fills
                  boxShadow: "inset 2px 0 0 var(--color-panel)",
                }}
                title={`${labels[index]}: ${formatUsdc(pool)} USDC`}
              />
            ),
          )
        )}
      </div>
      <div className={`flex flex-wrap gap-x-4 gap-y-1 ${compact ? "text-[11px]" : "text-xs"}`}>
        {labels.map((label, index) => (
          <span
            key={index}
            className="inline-flex items-center gap-1.5 text-ink-dim"
            onMouseEnter={() => setHovered(index)}
            onMouseLeave={() => setHovered(null)}
          >
            <span className="h-2 w-2 rounded-[3px]" style={{ background: OUTCOME_COLORS[index] }} />
            <span className={hovered === index ? "text-ink" : ""}>{label}</span>
            <span className="font-mono tabular-nums text-ink-faint">{formatUsdc(market.pools[index])}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
