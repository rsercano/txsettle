"use client";

import type { PublicKey } from "@solana/web3.js";
import { useState } from "react";

import { Spinner } from "@/components/ui";
import { explorerTxUrl } from "@/lib/config";

type FaucetState = { kind: "idle" } | { kind: "minting" } | { kind: "done"; signature: string } | { kind: "error"; message: string };

/** Mints 500 mock-USDC to the connected wallet via POST /api/faucet. */
export function FaucetButton({ wallet, onMinted }: { wallet: PublicKey; onMinted: () => void }) {
  const [state, setState] = useState<FaucetState>({ kind: "idle" });

  const drip = async () => {
    setState({ kind: "minting" });
    try {
      const response = await fetch("/api/faucet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ wallet: wallet.toBase58() }),
      });
      const data = (await response.json()) as { signature?: string; error?: string };
      if (!response.ok || !data.signature) throw new Error(data.error ?? `faucet responded ${response.status}`);
      setState({ kind: "done", signature: data.signature });
      onMinted();
    } catch (error) {
      setState({ kind: "error", message: error instanceof Error ? error.message : String(error) });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => void drip()}
        disabled={state.kind === "minting"}
        className="inline-flex items-center gap-2 rounded-lg border border-accent/50 bg-accent/10 px-3.5 py-2 text-sm font-semibold text-accent transition-colors hover:bg-accent/20 disabled:opacity-60"
      >
        {state.kind === "minting" ? <Spinner className="h-3.5 w-3.5" /> : null}
        {state.kind === "minting" ? "Minting…" : "Get 500 test USDC"}
      </button>
      {state.kind === "done" ? (
        <a href={explorerTxUrl(state.signature)} target="_blank" rel="noreferrer" className="font-mono text-xs text-good hover:underline">
          minted ✓ view tx ↗
        </a>
      ) : null}
      {state.kind === "error" ? <span className="text-xs text-bad">{state.message}</span> : null}
    </div>
  );
}
