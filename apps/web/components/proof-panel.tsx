"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useCallback, useEffect, useState } from "react";

import { outcomeName } from "@/components/markets-section";
import { AddressChip, CheckIcon, ErrorBox, HashChip, SectionTitle, Spinner } from "@/components/ui";
import type { FixtureInfo } from "@/lib/fixtures";
import { bytesToHex } from "@/lib/format";
import type { MarketView } from "@/lib/markets";
import { findResolveTx, getProof, preVerifyProof, type PreVerifyOutcome, type ResolveTxInfo } from "@/lib/settlement";
import type { SettlementProof } from "@txsettle/sdk/proof";

const MILLIS_PER_DAY = 86_400_000;

/**
 * THE MONEY SHOT — "Verify this settlement".
 *
 * Renders the real Merkle chain of custody for a resolved market: stat leaves
 * (period 100) → eventStatRoot → fixture sub-tree → main tree → the on-chain
 * daily_scores_roots account, with the actual hashes, the epochDay derivation,
 * explorer links, and a free live re-verification against devnet.
 */
export function ProofPanel({ market, fixture }: { market: MarketView; fixture: FixtureInfo | undefined }) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  const [proof, setProof] = useState<SettlementProof | null>(null);
  const [proofError, setProofError] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<PreVerifyOutcome | { kind: "running" } | null>(null);
  const [resolveTx, setResolveTx] = useState<ResolveTxInfo | null>(null);

  const verify = useCallback(
    (settlementProof: SettlementProof) => {
      setVerdict({ kind: "running" });
      preVerifyProof(connection, settlementProof, publicKey ?? undefined)
        .then(setVerdict)
        .catch((error: unknown) => setVerdict({ verified: false, error: error instanceof Error ? error.message : String(error) }));
    },
    [connection, publicKey],
  );

  const load = useCallback(() => {
    setProofError(null);
    setProof(null);
    getProof(market.fixtureId)
      .then((settlementProof) => {
        setProof(settlementProof);
        verify(settlementProof); // auto-run the live check — the panel should light up on its own
      })
      .catch((error: unknown) => setProofError(error instanceof Error ? error.message : String(error)));
    findResolveTx(connection, new PublicKey(market.address))
      .then(setResolveTx)
      .catch(() => setResolveTx(null));
  }, [connection, market.address, market.fixtureId, verify]);

  useEffect(load, [load]);

  const p1 = fixture?.participant1 ?? "P1";
  const p2 = fixture?.participant2 ?? "P2";

  return (
    <section className="overflow-hidden rounded-xl border border-accent/30 bg-panel">
      <div className="border-b border-edge bg-panel-2 px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SectionTitle>Verify this settlement</SectionTitle>
          <LiveVerdictBadge verdict={verdict} onRerun={proof ? () => verify(proof) : undefined} />
        </div>
        <p className="mt-1.5 max-w-2xl text-sm text-ink-dim">
          The outcome below was not decided by anyone. It hashes out of TxODDS&apos; published data — follow the chain of custody from the final
          whistle down to the root on Solana.
        </p>
      </div>

      {proofError ? (
        <div className="p-5">
          <ErrorBox message={`Could not fetch the settlement proof from TxLINE: ${proofError}`} onRetry={load} />
        </div>
      ) : !proof ? (
        <div className="flex items-center gap-3 p-6 text-ink-dim">
          <Spinner /> Fetching the Merkle proof from TxLINE (browser-side, via @txsettle/sdk)…
        </div>
      ) : (
        <ol className="relative space-y-0 p-5">
          {/* 1 — stat leaves */}
          <ProofStep index={1} title="Final score — the proved stat leaves" last={false}>
            <p className="text-xs leading-relaxed text-ink-faint">
              From the analyst-verified <span className="font-mono text-ink-dim">game_finalised</span> record — every leaf carries{" "}
              <span className="font-mono text-ink-dim">period&nbsp;100</span>, the program rejects anything else (a mid-game score also proves, but
              it is not <em>final</em>).
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {proof.payload.stats.map((leaf, index) => (
                <div key={index} className="rounded-lg border border-edge bg-panel-2 p-3">
                  <p className="text-[11px] uppercase tracking-wider text-ink-faint">
                    statKey {leaf.stat.key} · full-match goals · {index === 0 ? p1 : p2}
                  </p>
                  <p className="mt-1 font-mono text-2xl font-bold tabular-nums">{leaf.stat.value}</p>
                  <details className="mt-2">
                    <summary className="cursor-pointer font-mono text-[11px] text-accent-dim hover:text-accent">
                      Merkle path · {leaf.statProof.length} siblings ↑
                    </summary>
                    <div className="mt-2 flex flex-col items-start gap-1.5">
                      {leaf.statProof.map((node, nodeIndex) => (
                        <HashChip key={nodeIndex} hex={bytesToHex(node.hash)} label={`sibling ${nodeIndex + 1}`} />
                      ))}
                    </div>
                  </details>
                </div>
              ))}
            </div>
          </ProofStep>

          {/* 2 — event stat root */}
          <ProofStep index={2} title="…hash up to the event's stat root" last={false}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">eventStatRoot</span>
              <HashChip hex={bytesToHex(proof.payload.eventStatRoot)} label="eventStatRoot" />
            </div>
          </ProofStep>

          {/* 3 — fixture sub-tree */}
          <ProofStep index={3} title="…into this fixture's sub-tree in the 5-minute batch" last={false}>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-[11px] uppercase tracking-wider text-ink-faint">eventsSubTreeRoot</span>
              <HashChip hex={bytesToHex(proof.payload.fixtureSummary.eventsSubTreeRoot)} label="eventsSubTreeRoot" />
              <span className="font-mono text-xs text-ink-faint">
                + {proof.payload.fixtureProof.length} sibling{proof.payload.fixtureProof.length === 1 ? "" : "s"}
              </span>
            </div>
          </ProofStep>

          {/* 4 — main tree */}
          <ProofStep index={4} title="…through the batch's main tree" last={false}>
            <p className="text-xs leading-relaxed text-ink-faint">
              {proof.payload.mainTreeProof.length} more sibling{proof.payload.mainTreeProof.length === 1 ? " chains" : "s chain"} the sub-tree into
              the 32-byte root TxODDS committed for this batch. Change one goal anywhere and this hash chain breaks.
            </p>
            <div className="mt-2 flex flex-col items-start gap-1.5">
              {proof.payload.mainTreeProof.map((node, nodeIndex) => (
                <HashChip key={nodeIndex} hex={bytesToHex(node.hash)} label={`main-tree sibling ${nodeIndex + 1}`} />
              ))}
            </div>
          </ProofStep>

          {/* 5 — on-chain root */}
          <ProofStep index={5} title="…to the root TxODDS published ON-CHAIN" last={false}>
            <div className="rounded-lg border border-edge bg-panel-2 p-3 font-mono text-xs leading-relaxed">
              <p className="text-ink-faint">
                proof timestamp <span className="text-ink-dim">{proof.payload.ts.toString()}</span> ms
              </p>
              <p className="text-ink-faint">
                ÷ 86,400,000 ms/day → epochDay <span className="font-bold text-accent">{Math.floor(proof.payload.ts.toNumber() / MILLIS_PER_DAY)}</span>
              </p>
              <p className="mt-1 text-ink-faint">
                PDA(&quot;daily_scores_roots&quot;, {proof.epochDay}) on txoracle:
              </p>
              <div className="mt-1.5">
                <AddressChip address={proof.rootsPda.toBase58()} chars={6} />
              </div>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-ink-faint">
              The program never trusts a client-supplied account — it re-derives this address from the proof&apos;s own timestamp. The daily root
              inside it is the trust anchor for the whole chain above.
            </p>
          </ProofStep>

          {/* 6 — verdict */}
          <ProofStep index={6} title="Verified on-chain, outcome derived from proved goals" last>
            <div className="space-y-3">
              <div className="rounded-lg border border-edge bg-panel-2 p-3">
                <p className="font-mono text-xs text-ink-faint">
                  validate_stat_v2(payload, exact-equality strategy) → <VerdictInline verdict={verdict} />
                </p>
                <p className="mt-2 font-mono text-sm">
                  proved {p1} <span className="font-bold tabular-nums">{proof.statValues[0]}</span> — <span className="font-bold tabular-nums">{proof.statValues[1]}</span> {p2}
                  {market.outcome ? (
                    <>
                      {"  "}→ <span className="font-bold text-good">{outcomeName(market.outcome, fixture)}</span>
                    </>
                  ) : null}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-ink-faint">
                <span>settlement tx</span>
                {resolveTx ? (
                  <AddressChip address={resolveTx.signature} tx chars={6} />
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-ink-faint">
                    <Spinner className="h-3 w-3" /> locating in on-chain history…
                  </span>
                )}
                {resolveTx?.blockTime ? <span>{new Date(resolveTx.blockTime * 1000).toUTCString()}</span> : null}
              </div>
            </div>
          </ProofStep>
        </ol>
      )}
    </section>
  );
}

function ProofStep({ index, title, last, children }: { index: number; title: string; last: boolean; children: React.ReactNode }) {
  return (
    <li className="relative flex gap-4 pb-6 last:pb-0">
      {!last ? <span aria-hidden className="absolute left-[13px] top-8 h-[calc(100%-1.5rem)] w-px bg-edge" /> : null}
      <span className="z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent/50 bg-panel font-mono text-xs font-bold text-accent">
        {index}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="pt-1 text-sm font-bold tracking-tight">{title}</h3>
        <div className="mt-2">{children}</div>
      </div>
    </li>
  );
}

function LiveVerdictBadge({ verdict, onRerun }: { verdict: PreVerifyOutcome | { kind: "running" } | null; onRerun?: () => void }) {
  if (verdict && "kind" in verdict) {
    return (
      <span className="inline-flex items-center gap-2 rounded-full border border-edge px-3 py-1 font-mono text-xs text-ink-dim">
        <Spinner className="h-3 w-3" /> verifying live on devnet…
      </span>
    );
  }
  if (!verdict) return null;
  if (verdict.verified) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-good/60 bg-good/15 px-3 py-1 font-mono text-xs font-bold text-[#4ade4a]">
        <CheckIcon className="h-3.5 w-3.5" /> VERIFIED · {verdict.computeUnits?.toLocaleString("en-US")} CU
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-bad/60 bg-bad/15 px-3 py-1 font-mono text-xs font-bold text-bad" title={verdict.error}>
        ✕ NOT VERIFIED
      </span>
      {onRerun ? (
        <button onClick={onRerun} className="rounded border border-edge px-2 py-1 font-mono text-[11px] text-ink-dim hover:border-accent hover:text-accent">
          retry
        </button>
      ) : null}
    </span>
  );
}

function VerdictInline({ verdict }: { verdict: PreVerifyOutcome | { kind: "running" } | null }) {
  if (!verdict || "kind" in verdict) return <span className="text-ink-dim">checking…</span>;
  return verdict.verified ? <span className="font-bold text-good">TRUE</span> : <span className="font-bold text-bad">FALSE</span>;
}
