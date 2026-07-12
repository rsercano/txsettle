"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

import { REPO_URL } from "@/lib/config";

const WalletMultiButton = dynamic(() => import("@solana/wallet-adapter-react-ui").then((m) => m.WalletMultiButton), {
  ssr: false,
  loading: () => <div className="h-10 w-36 animate-pulse rounded-lg border border-edge bg-panel-2" />,
});

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-baseline gap-0.5 font-bold tracking-tight ${className}`}>
      <span className="rounded-[5px] bg-accent px-1.5 py-0.5 font-mono text-surface">Tx</span>
      <span>Settle</span>
    </span>
  );
}

export function Nav() {
  return (
    <header className="sticky top-0 z-40 border-b border-edge bg-surface/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <Wordmark className="text-lg" />
          <span className="hidden rounded-full border border-edge px-2 py-0.5 font-mono text-[11px] uppercase tracking-widest text-ink-faint sm:inline">
            devnet
          </span>
        </Link>
        <nav className="flex items-center gap-2 sm:gap-5">
          <Link href="/#markets" className="hidden text-sm text-ink-dim transition-colors hover:text-ink sm:inline">
            Markets
          </Link>
          <Link href="/#how-it-works" className="hidden text-sm text-ink-dim transition-colors hover:text-ink sm:inline">
            How it works
          </Link>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="hidden text-sm text-ink-dim transition-colors hover:text-ink sm:inline">
            GitHub
          </a>
          <WalletMultiButton />
        </nav>
      </div>
    </header>
  );
}
