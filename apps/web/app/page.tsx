import Link from "next/link";

import { MarketsSection } from "@/components/markets-section";
import { SectionTitle } from "@/components/ui";
import { explorerAddressUrl, explorerTxUrl, PROGRAM_ID, REPO_URL } from "@/lib/config";

/** Real on-chain artifacts of the settled demo market (Norway 1-2 England, fixture 18213979). */
const DEMO = {
  rootsAccount: "EdJuEftTBNwXRWJpvYCziVxKT87qMDVu9V6HC7PwGffB", // daily_scores_roots epochDay 20645
  resolveTx: "58P2pfMHKHHZRATCB831RxBLCU5xNytSxrNm4uABjwtF3bskcLBU2PPPj9kTHcvbRZcCPFVhF3aT52SKVEwwD1Se",
};

const STEPS = [
  {
    step: "01",
    title: "Escrow",
    body: "Stakes lock in a token vault owned by the market PDA itself. No authority — not even the market creator — can move a single token out; only a winning claim can.",
    artifactLabel: "market program",
    artifactHref: explorerAddressUrl(PROGRAM_ID.toBase58()),
  },
  {
    step: "02",
    title: "Proof",
    body: "TxODDS publishes a Merkle root of every 5-minute batch of match data on-chain. TxSettle fetches the leaf-to-root proof of the analyst-verified final score from TxLINE.",
    artifactLabel: "daily_scores_roots · epochDay 20645",
    artifactHref: explorerAddressUrl(DEMO.rootsAccount),
  },
  {
    step: "03",
    title: "Payout",
    body: "Anyone submits the proof. resolve() checks it against the published root via txoracle's validate_stat_v2 and derives the winner from the proved goals; claim() splits the pot pro-rata.",
    artifactLabel: "the settlement tx of a real quarterfinal",
    artifactHref: explorerTxUrl(DEMO.resolveTx),
  },
];

export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden border-b border-edge">
        <div aria-hidden className="grid-backdrop pointer-events-none absolute inset-0" />
        <div className="relative mx-auto max-w-6xl px-4 pb-16 pt-20 sm:px-6 sm:pt-28">
          <p className="mb-4 font-mono text-xs uppercase tracking-[0.25em] text-accent">World Cup 2026 · Solana devnet · TxODDS data</p>
          <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
            Markets that <span className="text-accent">settle themselves</span>.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-dim">
            TxSettle escrows World Cup bets on Solana and settles them against the Merkle roots TxODDS publishes on-chain. Anyone can submit the
            settlement proof — and if it doesn&apos;t verify against the published root, the market <em className="text-ink not-italic font-semibold">cannot</em> resolve.
            No admin key. No trusted oracle.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/#markets"
              className="rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-surface transition-opacity hover:opacity-90"
            >
              View live markets
            </Link>
            <a
              href={REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-edge-bright px-5 py-2.5 text-sm font-semibold text-ink-dim transition-colors hover:border-accent hover:text-accent"
            >
              Read the code ↗
            </a>
          </div>
        </div>
      </section>

      <MarketsSection />

      <section id="how-it-works" className="mx-auto max-w-6xl scroll-mt-24 border-t border-edge px-4 py-14 sm:px-6">
        <div className="mb-8 space-y-1.5">
          <SectionTitle>How it works</SectionTitle>
          <h2 className="text-2xl font-bold tracking-tight">Escrow → Proof → Payout, each with its on-chain artifact</h2>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {STEPS.map((item) => (
            <div key={item.step} className="flex flex-col rounded-xl border border-edge bg-panel p-5">
              <span className="font-mono text-xs text-accent">{item.step}</span>
              <h3 className="mt-2 text-xl font-bold">{item.title}</h3>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-ink-dim">{item.body}</p>
              <a
                href={item.artifactHref}
                target="_blank"
                rel="noreferrer"
                className="mt-4 inline-flex items-center gap-1.5 border-t border-edge pt-3 font-mono text-xs text-ink-faint transition-colors hover:text-accent"
              >
                <span className="text-accent">⛓</span> {item.artifactLabel} ↗
              </a>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
