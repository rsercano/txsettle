"use client";

import { getAssociatedTokenAddressSync } from "@solana/spl-token";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ClaimCard } from "@/components/claim-card";
import { fixtureTitle, outcomeName } from "@/components/markets-section";
import { PlaceBet } from "@/components/place-bet";
import { PoolsBar, outcomeLabels } from "@/components/pools-bar";
import { ProofPanel } from "@/components/proof-panel";
import { ResolveCard } from "@/components/resolve-card";
import { AddressChip, ErrorBox, SectionTitle, Spinner, StateBadge } from "@/components/ui";
import { getFixtures, type FixtureInfo } from "@/lib/fixtures";
import { formatDateUtc, formatUsdc } from "@/lib/format";
import { fetchMarket, fetchPosition, type MarketView, type PositionView } from "@/lib/markets";
import { withRetry } from "@/lib/rpc";

export interface UserFunds {
  solLamports: bigint;
  usdcBase: bigint;
  hasTokenAccount: boolean;
  tokenAccount: string;
}

export function MarketDetail({ address }: { address: string }) {
  const { connection } = useConnection();
  const { publicKey } = useWallet();

  const marketKey = useMemo(() => {
    try {
      return new PublicKey(address);
    } catch {
      return null;
    }
  }, [address]);

  const [market, setMarket] = useState<MarketView | null>(null);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [fixture, setFixture] = useState<FixtureInfo | undefined>(undefined);
  const [position, setPosition] = useState<PositionView | null>(null);
  const [funds, setFunds] = useState<UserFunds | null>(null);

  const loadMarket = useCallback(() => {
    if (!marketKey) return;
    setMarketError(null);
    fetchMarket(connection, marketKey)
      .then((view) => {
        setMarket(view);
        getFixtures()
          .then((fixtures) => setFixture(fixtures.get(view.fixtureId)))
          .catch(() => undefined);
      })
      .catch((error: unknown) => setMarketError(error instanceof Error ? error.message : String(error)));
  }, [connection, marketKey]);

  const loadUser = useCallback(() => {
    if (!marketKey || !publicKey || !market) {
      setPosition(null);
      setFunds(null);
      return;
    }
    fetchPosition(connection, marketKey, publicKey)
      .then(setPosition)
      .catch(() => setPosition(null));

    const mint = new PublicKey(market.mint);
    const ata = getAssociatedTokenAddressSync(mint, publicKey);
    void (async () => {
      try {
        const [lamports, tokenBalance] = await Promise.all([
          withRetry(() => connection.getBalance(publicKey)),
          withRetry(() => connection.getTokenAccountBalance(ata)).catch(() => null),
        ]);
        setFunds({
          solLamports: BigInt(lamports),
          usdcBase: tokenBalance ? BigInt(tokenBalance.value.amount) : 0n,
          hasTokenAccount: tokenBalance !== null,
          tokenAccount: ata.toBase58(),
        });
      } catch {
        setFunds(null);
      }
    })();
  }, [connection, marketKey, publicKey, market]);

  useEffect(loadMarket, [loadMarket]);
  useEffect(loadUser, [loadUser]);

  const refreshAll = useCallback(() => {
    loadMarket();
    loadUser();
  }, [loadMarket, loadUser]);

  if (!marketKey) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <ErrorBox message={`"${address}" is not a valid Solana address.`} />
      </div>
    );
  }

  if (marketError) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <ErrorBox message={`Could not load this market from devnet: ${marketError}`} onRetry={loadMarket} />
      </div>
    );
  }

  if (!market) {
    return (
      <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-16 text-ink-dim sm:px-6">
        <Spinner /> Loading market from devnet…
      </div>
    );
  }

  const labels = outcomeLabels(fixture?.participant1, fixture?.participant2);
  const bettingOpen = market.state === "open" && Date.now() / 1000 < market.closeTs;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-10 sm:px-6">
      <Link href="/#markets" className="font-mono text-xs text-ink-faint transition-colors hover:text-accent">
        ← all markets
      </Link>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <StateBadge market={market} outcomeLabel={market.outcome ? outcomeName(market.outcome, fixture) : undefined} />
          <span className="font-mono text-xs text-ink-faint">fixture {market.fixtureId}</span>
          {fixture?.startTime ? <span className="font-mono text-xs text-ink-faint">kickoff {formatDateUtc(fixture.startTime)} UTC</span> : null}
        </div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{fixtureTitle(fixture, market.fixtureId)}</h1>
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-faint">
          <span>market</span>
          <AddressChip address={market.address} />
          <span>vault</span>
          <AddressChip address={market.vault} />
        </div>
      </header>

      <section className="rounded-xl border border-edge bg-panel p-5">
        <div className="mb-4 flex items-baseline justify-between">
          <SectionTitle>Parimutuel pools</SectionTitle>
          <span className="font-mono text-sm font-semibold tabular-nums">{formatUsdc(market.totalPool)} USDC total</span>
        </div>
        <PoolsBar market={market} labels={labels} />
        {market.state === "open" ? (
          <p className="mt-3 text-xs text-ink-faint">
            Betting {bettingOpen ? "closes" : "closed"} {formatDateUtc(market.closeTs * 1000)} UTC · winners split the whole pot pro-rata
          </p>
        ) : null}
      </section>

      {market.state === "open" ? (
        <>
          <PlaceBet market={market} labels={labels} funds={funds} position={position} onDone={refreshAll} bettingOpen={bettingOpen} />
          <ResolveCard market={market} fixture={fixture} onResolved={refreshAll} />
        </>
      ) : (
        <>
          <ClaimCard market={market} fixture={fixture} position={position} funds={funds} onDone={refreshAll} />
          <ProofPanel market={market} fixture={fixture} />
        </>
      )}

      {!publicKey && market.state === "open" ? (
        <p className="text-sm text-ink-faint">Connect a wallet (top right) to stake test USDC on this market.</p>
      ) : null}
    </div>
  );
}
