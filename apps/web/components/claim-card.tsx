"use client";

import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useState } from "react";

import type { UserFunds } from "@/components/market-detail";
import { outcomeName } from "@/components/markets-section";
import { SectionTitle, Spinner } from "@/components/ui";
import { explorerTxUrl } from "@/lib/config";
import type { FixtureInfo } from "@/lib/fixtures";
import { formatUsdc } from "@/lib/format";
import { claimPayout, estimatePayout, walletProgram, OUTCOMES, type MarketView, type PositionView } from "@/lib/markets";
import { errorMessage } from "@/lib/rpc";

type SendState = { kind: "idle" } | { kind: "sending" } | { kind: "done"; signature: string } | { kind: "error"; message: string };

/** Post-resolution position summary + claim action (pro-rata payout or refund mode). */
export function ClaimCard({
  market,
  fixture,
  position,
  funds,
  onDone,
}: {
  market: MarketView;
  fixture: FixtureInfo | undefined;
  position: PositionView | null;
  funds: UserFunds | null;
  onDone: () => void;
}) {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const [state, setState] = useState<SendState>({ kind: "idle" });

  if (market.outcome === null) return null;
  const winnerIndex = OUTCOMES.indexOf(market.outcome);
  const refundMode = market.pools[winnerIndex] === 0n;

  const submit = async () => {
    if (!wallet || !funds) return;
    setState({ kind: "sending" });
    try {
      const program = walletProgram(connection, wallet);
      const signature = await claimPayout(program, {
        market: new PublicKey(market.address),
        mint: new PublicKey(market.mint),
        userToken: new PublicKey(funds.tokenAccount),
        owner: wallet.publicKey,
      });
      setState({ kind: "done", signature });
      onDone();
    } catch (error) {
      setState({ kind: "error", message: errorMessage(error) });
    }
  };

  const payout = position ? estimatePayout(market, position) : 0n;
  const won = position !== null && (refundMode || position.outcome === winnerIndex);

  return (
    <section className="rounded-xl border border-edge bg-panel p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <SectionTitle>Your position</SectionTitle>
        {refundMode ? <span className="text-xs text-warn">nobody backed the winner — every stake is refundable</span> : null}
      </div>

      {!wallet ? (
        <p className="text-sm text-ink-dim">Connect a wallet to check whether you hold a winning position on this market.</p>
      ) : position === null ? (
        <p className="text-sm text-ink-dim">This wallet holds no position on this market.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-edge bg-panel-2 p-3">
              <p className="text-[11px] uppercase tracking-wider text-ink-faint">staked on</p>
              <p className="mt-1 text-sm font-semibold">{outcomeName(OUTCOMES[position.outcome], fixture)}</p>
            </div>
            <div className="rounded-lg border border-edge bg-panel-2 p-3">
              <p className="text-[11px] uppercase tracking-wider text-ink-faint">stake</p>
              <p className="mt-1 font-mono text-sm font-semibold tabular-nums">{formatUsdc(position.amount)} USDC</p>
            </div>
            <div className="rounded-lg border border-edge bg-panel-2 p-3">
              <p className="text-[11px] uppercase tracking-wider text-ink-faint">{refundMode ? "refund" : "payout"}</p>
              <p className={`mt-1 font-mono text-sm font-semibold tabular-nums ${won ? "text-good" : "text-ink-faint"}`}>
                {formatUsdc(payout)} USDC
              </p>
            </div>
          </div>

          {position.claimed ? (
            <p className="text-sm text-ink-dim">Already claimed ✓ — the vault paid this position out.</p>
          ) : won ? (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void submit()}
                disabled={state.kind === "sending"}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-surface transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {state.kind === "sending" ? <Spinner className="h-4 w-4" /> : null}
                {state.kind === "sending" ? "Confirm in wallet…" : refundMode ? "Claim refund" : "Claim payout"}
              </button>
              {state.kind === "done" ? (
                <a href={explorerTxUrl(state.signature)} target="_blank" rel="noreferrer" className="font-mono text-xs text-good hover:underline">
                  claimed ✓ view tx ↗
                </a>
              ) : null}
              {state.kind === "error" ? <span className="text-xs text-bad">{state.message}</span> : null}
            </div>
          ) : (
            <p className="text-sm text-ink-dim">This position did not win — losing stakes were split among the winners.</p>
          )}
        </div>
      )}
    </section>
  );
}
