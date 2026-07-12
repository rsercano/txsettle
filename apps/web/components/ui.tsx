"use client";

import { useState } from "react";

import { explorerAddressUrl, explorerTxUrl } from "@/lib/config";
import { shortAddress, shortHex } from "@/lib/format";
import type { MarketView } from "@/lib/markets";

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`${className} animate-spin`} viewBox="0 0 24 24" fill="none" aria-label="loading">
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-20" />
      <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-bad/40 bg-bad/10 px-4 py-3 text-sm text-ink" role="alert">
      <span className="font-mono text-xs uppercase tracking-widest text-bad">error</span>
      <span className="min-w-0 flex-1 break-words text-ink-dim">{message}</span>
      {onRetry ? (
        <button onClick={onRetry} className="rounded border border-edge-bright px-2.5 py-1 text-xs font-semibold hover:border-accent hover:text-accent">
          Retry
        </button>
      ) : null}
    </div>
  );
}

export function StateBadge({ market, outcomeLabel }: { market: MarketView; outcomeLabel?: string }) {
  if (market.state === "open") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent/10 px-2.5 py-0.5 text-xs font-semibold text-accent">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
        Open
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-good/50 bg-good/10 px-2.5 py-0.5 text-xs font-semibold text-[#4ade4a]">
      <CheckIcon className="h-3 w-3" />
      Resolved{outcomeLabel ? ` · ${outcomeLabel}` : ""}
    </span>
  );
}

export function CheckIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M2.5 8.5l3.5 3.5 7.5-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      title={`Copy ${label}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1200);
        });
      }}
      className="shrink-0 rounded border border-edge px-1 py-0.5 text-[10px] uppercase tracking-wider text-ink-faint transition-colors hover:border-accent hover:text-accent"
    >
      {copied ? "copied" : "copy"}
    </button>
  );
}

/** Truncated 64-char hash, full value on hover, one-click copy. */
export function HashChip({ hex, label = "hash" }: { hex: string; label?: string }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-edge bg-panel-2 px-2 py-1" title={hex}>
      <span className="truncate font-mono text-xs text-ink-dim">{shortHex(hex, 8)}</span>
      <CopyButton value={hex} label={label} />
    </span>
  );
}

/** Truncated base58 address linking to the devnet explorer, with copy. */
export function AddressChip({ address, tx = false, chars = 4 }: { address: string; tx?: boolean; chars?: number }) {
  return (
    <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-edge bg-panel-2 px-2 py-1" title={address}>
      <a
        href={tx ? explorerTxUrl(address) : explorerAddressUrl(address)}
        target="_blank"
        rel="noreferrer"
        className="truncate font-mono text-xs text-accent hover:underline"
      >
        {shortAddress(address, chars)} ↗
      </a>
      <CopyButton value={address} label={tx ? "signature" : "address"} />
    </span>
  );
}

export function SectionTitle({ children, id }: { children: React.ReactNode; id?: string }) {
  return (
    <h2 id={id} className="scroll-mt-24 font-mono text-xs font-semibold uppercase tracking-[0.2em] text-ink-faint">
      {children}
    </h2>
  );
}
