"use client";

import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useState } from "react";

import { CheckIcon, SectionTitle, Spinner } from "@/components/ui";
import { explorerTxUrl } from "@/lib/config";
import type { FixtureInfo } from "@/lib/fixtures";
import { resolveMarket, walletProgram, type MarketView } from "@/lib/markets";
import { errorMessage } from "@/lib/rpc";
import { getProof, preVerifyProof } from "@/lib/settlement";

type StepId = "fetch" | "preverify" | "send";
type StepStatus = "todo" | "running" | "done" | "failed";

const STEP_META: Record<StepId, { title: string; detail: string }> = {
  fetch: {
    title: "Fetch the settlement proof",
    detail: "TxLINE Merkle proof of the analyst-verified final score (game_finalised, period 100) — fetched in your browser via @txsettle/sdk.",
  },
  preverify: {
    title: "Pre-verify against the on-chain root",
    detail: "Free read-only simulation of txoracle validate_stat_v2 — the exact check resolve() will run on-chain.",
  },
  send: {
    title: "Submit resolve()",
    detail: "Permissionless: the program re-derives the daily-root account from the proof itself, CPIs into the verifier, and derives the outcome from the proved goals.",
  },
};

/**
 * The settlement showpiece on open markets: anyone — no special key — fetches
 * TxODDS' Merkle proof, pre-verifies it off-chain, then settles the market.
 */
export function ResolveCard({ market, fixture, onResolved }: { market: MarketView; fixture: FixtureInfo | undefined; onResolved: () => void }) {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();
  const [status, setStatus] = useState<Record<StepId, StepStatus>>({ fetch: "todo", preverify: "todo", send: "todo" });
  const [notes, setNotes] = useState<Partial<Record<StepId, string>>>({});
  const [error, setError] = useState<string | null>(null);
  const [signature, setSignature] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const setStep = (step: StepId, state: StepStatus, note?: string) => {
    setStatus((prev) => ({ ...prev, [step]: state }));
    if (note !== undefined) setNotes((prev) => ({ ...prev, [step]: note }));
  };

  const run = async () => {
    setRunning(true);
    setError(null);
    setSignature(null);
    setStatus({ fetch: "todo", preverify: "todo", send: "todo" });
    setNotes({});
    let current: StepId = "fetch";
    try {
      setStep("fetch", "running");
      const proof = await getProof(market.fixtureId);
      setStep(
        "fetch",
        "done",
        `proved final score ${proof.statValues[0]}–${proof.statValues[1]} · epochDay ${proof.epochDay} · ${
          proof.payload.stats[0].statProof.length + proof.payload.fixtureProof.length + proof.payload.mainTreeProof.length
        }+ Merkle siblings`,
      );

      current = "preverify";
      setStep("preverify", "running");
      const verdict = await preVerifyProof(connection, proof, wallet?.publicKey);
      if (!verdict.verified) throw new Error(verdict.error ?? "verifier rejected the proof");
      setStep("preverify", "done", `validate_stat_v2 → TRUE (${verdict.computeUnits?.toLocaleString("en-US")} CU simulated)`);

      if (!wallet) {
        setStep("send", "todo", "connect a wallet to submit — resolving costs only the devnet tx fee");
        return;
      }
      current = "send";
      setStep("send", "running");
      const program = walletProgram(connection, wallet);
      const sig = await resolveMarket(program, new PublicKey(market.address), proof);
      setSignature(sig);
      setStep("send", "done", "market resolved — outcome now derives from the proved goal counts");
      onResolved();
    } catch (err) {
      const message = errorMessage(err);
      setStep(current, "failed");
      if (/game_finalised/.test(message)) {
        setError("This fixture has no analyst-verified final result yet — a market can only settle once TxLINE publishes game_finalised.");
      } else {
        setError(message);
      }
    } finally {
      setRunning(false);
    }
  };

  return (
    <section className="rounded-xl border border-edge bg-panel p-5">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <SectionTitle>Settle this market</SectionTitle>
        <span className="font-mono text-[11px] uppercase tracking-widest text-accent">permissionless</span>
      </div>
      <p className="mb-4 text-sm text-ink-dim">
        No admin resolves {fixture ? `${fixture.participant1} vs ${fixture.participant2}` : "this market"} — <em className="not-italic text-ink">you</em> do.
        If the proof doesn&apos;t hash up to the root TxODDS published on-chain, the transaction fails and the market stays open.
      </p>

      <ol className="space-y-3">
        {(Object.keys(STEP_META) as StepId[]).map((step, index) => (
          <li key={step} className="flex gap-3 rounded-lg border border-edge bg-panel-2 p-3">
            <span
              className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-xs ${
                status[step] === "done"
                  ? "border-good/60 bg-good/15 text-good"
                  : status[step] === "failed"
                    ? "border-bad/60 bg-bad/15 text-bad"
                    : status[step] === "running"
                      ? "border-accent/60 text-accent"
                      : "border-edge-bright text-ink-faint"
              }`}
            >
              {status[step] === "done" ? <CheckIcon className="h-3.5 w-3.5" /> : status[step] === "running" ? <Spinner className="h-3.5 w-3.5" /> : status[step] === "failed" ? "✕" : index + 1}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{STEP_META[step].title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-ink-faint">{notes[step] ?? STEP_META[step].detail}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void run()}
          disabled={running}
          className="inline-flex items-center gap-2 rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-surface transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {running ? <Spinner className="h-4 w-4" /> : null}
          {running ? "Working…" : wallet ? "Fetch proof & resolve" : "Fetch proof & pre-verify"}
        </button>
        {signature ? (
          <a href={explorerTxUrl(signature)} target="_blank" rel="noreferrer" className="font-mono text-xs text-good hover:underline">
            resolved ✓ view tx ↗
          </a>
        ) : null}
        {error ? <span className="max-w-md text-xs text-bad">{error}</span> : null}
      </div>
    </section>
  );
}
