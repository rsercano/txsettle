"use client";

import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useState } from "react";

import { FaucetButton } from "@/components/faucet-button";
import { OUTCOME_COLORS } from "@/components/pools-bar";
import { SectionTitle, Spinner } from "@/components/ui";
import type { UserFunds } from "@/components/market-detail";
import { explorerTxUrl } from "@/lib/config";
import { formatUsdc, parseUsdc } from "@/lib/format";
import { placeBet, walletProgram, type MarketView, type PositionView } from "@/lib/markets";
import { errorMessage } from "@/lib/rpc";

const QUICK_AMOUNTS = ["10", "25", "100"];

type SendState = { kind: "idle" } | { kind: "sending" } | { kind: "done"; signature: string } | { kind: "error"; message: string };

export function PlaceBet({
  market,
  labels,
  funds,
  position,
  bettingOpen,
  onDone,
}: {
  market: MarketView;
  labels: [string, string, string];
  funds: UserFunds | null;
  position: PositionView | null;
  bettingOpen: boolean;
  onDone: () => void;
}) {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  // A position never switches sides on-chain — pre-select and lock the picker to it.
  const [outcome, setOutcome] = useState<number | null>(position ? position.outcome : null);
  const [amount, setAmount] = useState("25");
  const [state, setState] = useState<SendState>({ kind: "idle" });

  const lockedOutcome = position ? position.outcome : null;
  const selected = lockedOutcome ?? outcome;
  const amountBase = parseUsdc(amount);
  const insufficient = funds !== null && amountBase !== null && amountBase > funds.usdcBase;
  const noSol = funds !== null && funds.solLamports < 2_000_000n; // ~0.002 SOL for fees + position rent

  const submit = async () => {
    if (!wallet || selected === null || !amountBase || !funds) return;
    setState({ kind: "sending" });
    try {
      const program = walletProgram(connection, wallet);
      const signature = await placeBet(program, {
        market: new PublicKey(market.address),
        mint: new PublicKey(market.mint),
        userToken: new PublicKey(funds.tokenAccount),
        owner: wallet.publicKey,
        outcome: selected,
        amount: amountBase,
      });
      setState({ kind: "done", signature });
      onDone();
    } catch (error) {
      setState({ kind: "error", message: errorMessage(error) });
    }
  };

  return (
    <section className="rounded-xl border border-edge bg-panel p-5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <SectionTitle>Place a bet</SectionTitle>
        {funds ? (
          <span className="font-mono text-xs tabular-nums text-ink-dim">
            balance {formatUsdc(funds.usdcBase)} USDC · {(Number(funds.solLamports) / 1e9).toFixed(3)} SOL
          </span>
        ) : null}
      </div>

      {!wallet ? (
        <p className="text-sm text-ink-dim">Connect a wallet to stake test USDC — escrow goes straight into the market&apos;s vault PDA.</p>
      ) : !bettingOpen ? (
        <p className="text-sm text-ink-dim">Betting is closed for this market — it can only be resolved now.</p>
      ) : (
        <div className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-3">
            {labels.map((label, index) => {
              const active = selected === index;
              const locked = lockedOutcome !== null && lockedOutcome !== index;
              return (
                <button
                  key={index}
                  type="button"
                  disabled={locked}
                  onClick={() => setOutcome(index)}
                  className={`rounded-lg border px-3 py-2.5 text-left text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                    active ? "border-transparent text-surface" : "border-edge-bright bg-panel-2 text-ink hover:border-accent/60"
                  }`}
                  style={active ? { background: OUTCOME_COLORS[index] } : undefined}
                >
                  {label}
                  <span className={`mt-0.5 block font-mono text-[11px] font-normal ${active ? "text-surface/80" : "text-ink-faint"}`}>
                    pool {formatUsdc(market.pools[index])}
                  </span>
                </button>
              );
            })}
          </div>
          {lockedOutcome !== null ? (
            <p className="text-xs text-ink-faint">
              Your position is on <span className="text-ink">{labels[lockedOutcome]}</span> — stakes accumulate, switching sides is rejected on-chain.
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-lg border border-edge-bright bg-panel-2 focus-within:border-accent">
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="decimal"
                aria-label="Stake amount in USDC"
                className="w-28 bg-transparent px-3 py-2 font-mono text-sm tabular-nums outline-none"
                placeholder="0.00"
              />
              <span className="pr-3 font-mono text-xs text-ink-faint">USDC</span>
            </div>
            {QUICK_AMOUNTS.map((quick) => (
              <button
                key={quick}
                type="button"
                onClick={() => setAmount(quick)}
                className="rounded border border-edge px-2.5 py-1.5 font-mono text-xs text-ink-dim hover:border-accent hover:text-accent"
              >
                {quick}
              </button>
            ))}
          </div>

          {funds && funds.usdcBase === 0n ? (
            <div className="space-y-2 rounded-lg border border-edge bg-panel-2 p-3">
              <p className="text-sm text-ink-dim">You have no test USDC yet — mint some to play.</p>
              <FaucetButton wallet={wallet.publicKey} onMinted={onDone} />
            </div>
          ) : null}
          {noSol ? (
            <p className="text-xs text-warn">
              This wallet has almost no devnet SOL for fees — grab some at{" "}
              <a href="https://faucet.solana.com" target="_blank" rel="noreferrer" className="underline">
                faucet.solana.com
              </a>
              .
            </p>
          ) : null}

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => void submit()}
              disabled={selected === null || !amountBase || insufficient || state.kind === "sending" || (funds?.usdcBase ?? 0n) === 0n}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-surface transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {state.kind === "sending" ? <Spinner className="h-4 w-4" /> : null}
              {state.kind === "sending" ? "Confirm in wallet…" : "Place bet"}
            </button>
            {amountBase === null ? <span className="text-xs text-bad">enter a valid amount (max 6 decimals)</span> : null}
            {insufficient ? <span className="text-xs text-bad">amount exceeds your balance</span> : null}
            {state.kind === "done" ? (
              <a href={explorerTxUrl(state.signature)} target="_blank" rel="noreferrer" className="font-mono text-xs text-good hover:underline">
                bet placed ✓ view tx ↗
              </a>
            ) : null}
            {state.kind === "error" ? <span className="text-xs text-bad">{state.message}</span> : null}
          </div>
        </div>
      )}
    </section>
  );
}
