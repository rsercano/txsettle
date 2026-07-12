/**
 * On-chain reads and instruction builders for the txsettle_market program.
 * Mirrors the flows in tests/txsettle_market.test.ts one-to-one.
 */
import { AnchorProvider, BN, Program, type Provider } from "@coral-xyz/anchor";
import { ComputeBudgetProgram, PublicKey, type Connection, type Transaction, type VersionedTransaction } from "@solana/web3.js";

import type { SettlementProof } from "@txsettle/sdk/proof";

import { PROGRAM_ID, RESOLVE_CU_LIMIT } from "./config";
import idlJson from "./idl/txsettle_market.json";
import type { TxsettleMarket } from "./idl/txsettle_market";
import { withRetry } from "./rpc";

export type OutcomeKey = "p1Win" | "draw" | "p2Win";
export const OUTCOMES: readonly OutcomeKey[] = ["p1Win", "draw", "p2Win"] as const;

export interface MarketView {
  address: string;
  fixtureId: number;
  mint: string;
  vault: string;
  closeTs: number;
  state: "open" | "resolved";
  outcome: OutcomeKey | null;
  /** Total staked per outcome [P1Win, Draw, P2Win], 6-decimal base units. */
  pools: [bigint, bigint, bigint];
  totalPool: bigint;
}

export interface PositionView {
  address: string;
  outcome: number;
  amount: bigint;
  claimed: boolean;
}

const IDL = idlJson as TxsettleMarket;

export function readOnlyProgram(connection: Connection): Program<TxsettleMarket> {
  return new Program<TxsettleMarket>(IDL, { connection } as Provider);
}

/** Structural match of anchor's provider `Wallet` interface (what wallet-adapter's `useAnchorWallet` returns). */
export interface WalletLike {
  publicKey: PublicKey;
  signTransaction<T extends Transaction | VersionedTransaction>(transaction: T): Promise<T>;
  signAllTransactions<T extends Transaction | VersionedTransaction>(transactions: T[]): Promise<T[]>;
}

export function walletProgram(connection: Connection, wallet: WalletLike): Program<TxsettleMarket> {
  return new Program<TxsettleMarket>(IDL, new AnchorProvider(connection, wallet, { commitment: "confirmed" }));
}

export function marketPda(fixtureId: number): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("market"), new BN(fixtureId).toArrayLike(Buffer, "le", 8)], PROGRAM_ID)[0];
}

export function vaultPda(market: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("vault"), market.toBuffer()], PROGRAM_ID)[0];
}

export function positionPda(market: PublicKey, owner: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([Buffer.from("pos"), market.toBuffer(), owner.toBuffer()], PROGRAM_ID)[0];
}

type RawMarket = Awaited<ReturnType<Program<TxsettleMarket>["account"]["market"]["fetch"]>>;

function toMarketView(address: PublicKey, account: RawMarket): MarketView {
  const pools = account.pools.map((pool) => BigInt(pool.toString())) as [bigint, bigint, bigint];
  return {
    address: address.toBase58(),
    fixtureId: account.fixtureId.toNumber(),
    mint: account.mint.toBase58(),
    vault: account.vault.toBase58(),
    closeTs: account.closeTs.toNumber(),
    state: "resolved" in account.state ? "resolved" : "open",
    outcome: account.outcome ? (Object.keys(account.outcome)[0] as OutcomeKey) : null,
    pools,
    totalPool: pools[0] + pools[1] + pools[2],
  };
}

/** All markets of the program via getProgramAccounts, open (soonest close first) before resolved. */
export async function fetchMarkets(connection: Connection): Promise<MarketView[]> {
  const program = readOnlyProgram(connection);
  const all = await withRetry(() => program.account.market.all());
  return all
    .map((entry) => toMarketView(entry.publicKey, entry.account))
    .sort((a, b) => (a.state === b.state ? a.closeTs - b.closeTs : a.state === "open" ? -1 : 1));
}

export async function fetchMarket(connection: Connection, address: PublicKey): Promise<MarketView> {
  const program = readOnlyProgram(connection);
  const account = await withRetry(() => program.account.market.fetch(address));
  return toMarketView(address, account);
}

export async function fetchPosition(connection: Connection, market: PublicKey, owner: PublicKey): Promise<PositionView | null> {
  const program = readOnlyProgram(connection);
  const address = positionPda(market, owner);
  const account = await withRetry(() => program.account.position.fetchNullable(address));
  if (!account) return null;
  return {
    address: address.toBase58(),
    outcome: account.outcome,
    amount: BigInt(account.amount.toString()),
    claimed: account.claimed,
  };
}

/** `place(outcome, amount)` exactly as the test suite builds it (transfer_checked escrow into the vault PDA). */
export async function placeBet(
  program: Program<TxsettleMarket>,
  params: { market: PublicKey; mint: PublicKey; userToken: PublicKey; owner: PublicKey; outcome: number; amount: bigint },
): Promise<string> {
  return program.methods
    .place(params.outcome, new BN(params.amount.toString()))
    .accountsPartial({
      owner: params.owner,
      market: params.market,
      position: positionPda(params.market, params.owner),
      mint: params.mint,
      userToken: params.userToken,
      vault: vaultPda(params.market),
    })
    .rpc();
}

export async function claimPayout(
  program: Program<TxsettleMarket>,
  params: { market: PublicKey; mint: PublicKey; userToken: PublicKey; owner: PublicKey },
): Promise<string> {
  return program.methods
    .claim()
    .accountsPartial({
      owner: params.owner,
      market: params.market,
      position: positionPda(params.market, params.owner),
      mint: params.mint,
      vault: vaultPda(params.market),
      userToken: params.userToken,
    })
    .rpc();
}

/**
 * Permissionless settlement: submit the TxLINE Merkle proof; the program
 * re-derives the daily_scores_roots PDA from the proof's own timestamp and
 * CPIs into txoracle validate_stat_v2 (needs ~212K CU, budget 400K).
 */
export async function resolveMarket(program: Program<TxsettleMarket>, market: PublicKey, proof: SettlementProof): Promise<string> {
  return program.methods
    .resolve(proof.payload, proof.strategy)
    .accountsPartial({ market, dailyScoresRoots: proof.rootsPda })
    .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: RESOLVE_CU_LIMIT })])
    .rpc();
}

/** Estimated claim for a position on a resolved market (mirrors on-chain floor math, incl. refund mode). */
export function estimatePayout(market: MarketView, position: PositionView): bigint {
  if (market.outcome === null) return 0n;
  const winnerIndex = OUTCOMES.indexOf(market.outcome);
  const winningPool = market.pools[winnerIndex];
  if (winningPool === 0n) return position.amount; // refund mode
  if (position.outcome !== winnerIndex) return 0n;
  return (position.amount * market.totalPool) / winningPool;
}
