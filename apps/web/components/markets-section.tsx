"use client";

import { useConnection } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { PoolsBar, outcomeLabels } from "@/components/pools-bar";
import { ErrorBox, SectionTitle, Spinner, StateBadge } from "@/components/ui";
import { getFixtures, type FixtureInfo } from "@/lib/fixtures";
import { formatDateUtc, formatUsdc } from "@/lib/format";
import { fetchMarkets, type MarketView, type OutcomeKey } from "@/lib/markets";

export function fixtureTitle(fixture: FixtureInfo | undefined, fixtureId: number): string {
  return fixture ? `${fixture.participant1} vs ${fixture.participant2}` : `Fixture #${fixtureId}`;
}

export function outcomeName(outcome: OutcomeKey, fixture?: FixtureInfo): string {
  if (outcome === "draw") return "Draw";
  if (outcome === "p1Win") return fixture ? `${fixture.participant1} win` : "P1 win";
  return fixture ? `${fixture.participant2} win` : "P2 win";
}

export function MarketsSection() {
  const { connection } = useConnection();
  const [markets, setMarkets] = useState<MarketView[] | null>(null);
  const [fixtures, setFixtures] = useState<Map<number, FixtureInfo>>(new Map());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    setMarkets(null);
    fetchMarkets(connection)
      .then(setMarkets)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
    // Team names are progressive enhancement — markets render with fixture ids if TxLINE is unreachable.
    getFixtures()
      .then(setFixtures)
      .catch(() => undefined);
  }, [connection]);

  useEffect(load, [load]);

  return (
    <section id="markets" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-12 sm:px-6">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div className="space-y-1.5">
          <SectionTitle>Live markets · devnet</SectionTitle>
          <h2 className="text-2xl font-bold tracking-tight">Every market on the program</h2>
        </div>
        <span className="hidden font-mono text-xs text-ink-faint sm:block">getProgramAccounts · 45MwWq…14qx</span>
      </div>

      {error ? (
        <ErrorBox message={`Could not load markets from devnet RPC: ${error}`} onRetry={load} />
      ) : markets === null ? (
        <div className="flex items-center gap-3 rounded-xl border border-edge bg-panel px-5 py-8 text-ink-dim">
          <Spinner /> Loading markets from devnet…
        </div>
      ) : markets.length === 0 ? (
        <div className="rounded-xl border border-edge bg-panel px-5 py-8 text-ink-dim">No markets found on the program yet.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {markets.map((market) => {
            const fixture = fixtures.get(market.fixtureId);
            return (
              <Link
                key={market.address}
                href={`/market/${market.address}`}
                className="group rounded-xl border border-edge bg-panel p-5 transition-colors hover:border-accent/60"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold tracking-tight group-hover:text-accent">{fixtureTitle(fixture, market.fixtureId)}</h3>
                    <p className="mt-0.5 font-mono text-xs text-ink-faint">
                      fixture {market.fixtureId}
                      {fixture?.startTime ? ` · ${formatDateUtc(fixture.startTime)} UTC` : ""}
                    </p>
                  </div>
                  <StateBadge market={market} outcomeLabel={market.outcome ? outcomeName(market.outcome, fixture) : undefined} />
                </div>
                <PoolsBar market={market} labels={outcomeLabels(fixture?.participant1, fixture?.participant2)} compact />
                <div className="mt-3 flex items-baseline justify-between border-t border-edge pt-3">
                  <span className="text-xs text-ink-faint">total pool</span>
                  <span className="font-mono text-sm font-semibold tabular-nums">{formatUsdc(market.totalPool)} USDC</span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
