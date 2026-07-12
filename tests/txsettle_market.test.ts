/**
 * Localnet integration tests for the txsettle_market program, run via
 * `anchor test --provider.cluster localnet`.
 *
 * The Anchor test validator clones the REAL txoracle program and the
 * daily_scores_roots accounts for the test fixtures' epoch days from devnet
 * (see [test.validator] in Anchor.toml), and the settlement proofs are fetched
 * live from TxLINE — so `resolve` here exercises the exact verifier the devnet
 * deployment talks to.
 *
 * Fixtures used (both finished, analyst-verified):
 *  - 18213979 Norway 1-2 England (epochDay 20645) -> P2Win, pro-rata payout path
 *  - 18218149 Spain 2-1 Belgium (epochDay 20644) -> P1Win, nobody-picked-winner refund path
 */
import "dotenv/config";
import assert from "node:assert/strict";
import test from "node:test";

// Default import: under tsx's ESM loader the CJS lexer misses anchor's re-exported names.
import anchor from "@anchor-lang/core";
import type { Program } from "@anchor-lang/core";
import { createMint, getAccount, getOrCreateAssociatedTokenAccount, mintTo, type Account as TokenAccount } from "@solana/spl-token";
import { getSettlementProof, type NDimensionalStrategy, type SettlementProof, type StatValidationInput } from "@txsettle/sdk";

import type { TxsettleMarket } from "../target/types/txsettle_market.js";

const { BN, web3 } = anchor;
const { ComputeBudgetProgram, Keypair, PublicKey, LAMPORTS_PER_SOL } = web3;

const FIXTURE_A = 18213979; // Norway 1-2 England -> P2Win
const FIXTURE_B = 18218149; // Spain 2-1 Belgium -> P1Win
const USDC = 1_000_000n; // 6-decimal mock-USDC base units
const P1WIN = 0;
const DRAW = 1;
const P2WIN = 2;

const provider = anchor.AnchorProvider.env();
anchor.setProvider(provider);
const program = anchor.workspace.txsettleMarket as Program<TxsettleMarket>;
const connection = provider.connection;
const payer = (provider.wallet as anchor.Wallet).payer;

const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });

function marketPda(fixtureId: number): InstanceType<typeof PublicKey> {
  return PublicKey.findProgramAddressSync([Buffer.from("market"), new BN(fixtureId).toArrayLike(Buffer, "le", 8)], program.programId)[0];
}

function vaultPda(market: InstanceType<typeof PublicKey>): InstanceType<typeof PublicKey> {
  return PublicKey.findProgramAddressSync([Buffer.from("vault"), market.toBuffer()], program.programId)[0];
}

function positionPda(market: InstanceType<typeof PublicKey>, owner: InstanceType<typeof PublicKey>): InstanceType<typeof PublicKey> {
  return PublicKey.findProgramAddressSync([Buffer.from("pos"), market.toBuffer(), owner.toBuffer()], program.programId)[0];
}

/** Assert that a program call fails with one of the given Anchor error codes. */
async function expectError(promise: Promise<unknown>, ...codes: string[]): Promise<void> {
  try {
    await promise;
  } catch (error) {
    const anchorCode = (error as { error?: { errorCode?: { code?: string } } }).error?.errorCode?.code;
    const message = anchorCode ?? (error as Error).message ?? String(error);
    assert.ok(
      codes.some((code) => message.includes(code)),
      `expected one of [${codes.join(", ")}], got: ${message}`,
    );
    return;
  }
  assert.fail(`expected one of [${codes.join(", ")}] but the transaction succeeded`);
}

/** The exact-equality strategy the program demands, rebuilt for arbitrary stat values. */
function equalityStrategy(payload: StatValidationInput): NDimensionalStrategy {
  return {
    geometricTargets: [],
    distancePredicate: null,
    discretePredicates: payload.stats.map((leaf, index) => ({
      single: { index, predicate: { threshold: leaf.stat.value, comparison: { equalTo: {} } } },
    })),
  };
}

/** Copy a payload with different stat values (Merkle proofs left untouched -> must fail verification). */
function withStatValues(payload: StatValidationInput, values: number[]): StatValidationInput {
  return {
    ...payload,
    stats: payload.stats.map((leaf, i) => ({ stat: { ...leaf.stat, value: values[i] }, statProof: leaf.statProof })),
  };
}

// Shared state across sequential test steps.
let proofA: SettlementProof;
let proofB: SettlementProof;
let mint: InstanceType<typeof PublicKey>;
const user1 = Keypair.generate();
const user2 = Keypair.generate();
const user3 = Keypair.generate();
const tokenAccounts = new Map<string, TokenAccount>();

const marketA = marketPda(FIXTURE_A);
const marketB = marketPda(FIXTURE_B);

async function place(user: InstanceType<typeof Keypair>, market: InstanceType<typeof PublicKey>, outcome: number, amount: bigint): Promise<string> {
  return program.methods
    .place(outcome, new BN(amount.toString()))
    .accountsPartial({
      owner: user.publicKey,
      market,
      position: positionPda(market, user.publicKey),
      mint,
      userToken: tokenAccounts.get(user.publicKey.toBase58())!.address,
      vault: vaultPda(market),
    })
    .signers([user])
    .rpc();
}

async function claim(user: InstanceType<typeof Keypair>, market: InstanceType<typeof PublicKey>): Promise<string> {
  return program.methods
    .claim()
    .accountsPartial({
      owner: user.publicKey,
      market,
      position: positionPda(market, user.publicKey),
      mint,
      vault: vaultPda(market),
      userToken: tokenAccounts.get(user.publicKey.toBase58())!.address,
    })
    .signers([user])
    .rpc();
}

async function balanceOf(user: InstanceType<typeof Keypair>): Promise<bigint> {
  return (await getAccount(connection, tokenAccounts.get(user.publicKey.toBase58())!.address)).amount;
}

test("setup: fetch real TxLINE proofs, create mock-USDC mint and funded users", async () => {
  assert.ok(process.env.TXLINE_API_TOKEN, "TXLINE_API_TOKEN must be set in the root .env");

  [proofA, proofB] = await Promise.all([getSettlementProof({ fixtureId: FIXTURE_A }), getSettlementProof({ fixtureId: FIXTURE_B })]);

  // The validator clones daily_scores_roots for exactly these epoch days (Anchor.toml).
  assert.equal(proofA.epochDay, 20645, "fixture A proof must anchor to the cloned epochDay 20645 roots account");
  assert.equal(proofB.epochDay, 20644, "fixture B proof must anchor to the cloned epochDay 20644 roots account");
  assert.deepEqual(proofA.statValues, [1, 2], "Norway 1-2 England");
  assert.deepEqual(proofB.statValues, [2, 1], "Spain 2-1 Belgium");
  assert.ok(proofA.payload.stats.every((leaf) => leaf.stat.period === 100));

  mint = await createMint(connection, payer, payer.publicKey, null, 6);
  for (const user of [user1, user2, user3]) {
    const signature = await connection.requestAirdrop(user.publicKey, 2 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(signature);
    const tokenAccount = await getOrCreateAssociatedTokenAccount(connection, payer, mint, user.publicKey);
    tokenAccounts.set(user.publicKey.toBase58(), tokenAccount);
    await mintTo(connection, payer, mint, tokenAccount.address, payer, 1_000n * USDC);
  }
});

test("create_market initialises the market and vault", async () => {
  const closeTs = Math.floor(Date.now() / 1000) + 3600;
  await program.methods
    .createMarket(new BN(FIXTURE_A), new BN(closeTs))
    .accountsPartial({ payer: payer.publicKey, market: marketA, mint, vault: vaultPda(marketA) })
    .rpc();

  const market = await program.account.market.fetch(marketA);
  assert.equal(market.fixtureId.toNumber(), FIXTURE_A);
  assert.equal(market.mint.toBase58(), mint.toBase58());
  assert.equal(market.vault.toBase58(), vaultPda(marketA).toBase58());
  assert.equal(market.closeTs.toNumber(), closeTs);
  assert.deepEqual(market.state, { open: {} });
  assert.equal(market.outcome, null);
  assert.deepEqual(
    market.pools.map((pool) => pool.toString()),
    ["0", "0", "0"],
  );
});

test("create_market rejects a close_ts in the past", async () => {
  const closeTs = Math.floor(Date.now() / 1000) - 60;
  await expectError(
    program.methods
      .createMarket(new BN(999), new BN(closeTs))
      .accountsPartial({ payer: payer.publicKey, market: marketPda(999), mint, vault: vaultPda(marketPda(999)) })
      .rpc(),
    "CloseTsInPast",
  );
});

test("place escrows stakes, accumulates and updates pools", async () => {
  await place(user1, marketA, P2WIN, 100n * USDC);
  await place(user1, marketA, P2WIN, 20n * USDC); // top-up accumulates
  await place(user3, marketA, P2WIN, 41n * USDC);
  await place(user2, marketA, P1WIN, 50n * USDC);

  const market = await program.account.market.fetch(marketA);
  assert.deepEqual(
    market.pools.map((pool) => pool.toString()),
    [(50n * USDC).toString(), "0", (161n * USDC).toString()],
  );

  const position1 = await program.account.position.fetch(positionPda(marketA, user1.publicKey));
  assert.equal(position1.outcome, P2WIN);
  assert.equal(position1.amount.toString(), (120n * USDC).toString());
  assert.equal(position1.claimed, false);
  assert.equal(position1.owner.toBase58(), user1.publicKey.toBase58());
  assert.equal(position1.market.toBase58(), marketA.toBase58());

  assert.equal(await balanceOf(user1), 880n * USDC);
  assert.equal((await getAccount(connection, vaultPda(marketA))).amount, 211n * USDC);
});

test("place rejects switching outcome, invalid outcome and zero amount", async () => {
  await expectError(place(user1, marketA, DRAW, 1n * USDC), "OutcomeSwitch");
  await expectError(place(user2, marketA, 3, 1n * USDC), "InvalidOutcome");
  await expectError(place(user2, marketA, P1WIN, 0n), "ZeroAmount");
});

test("resolve rejects a tampered payload (claimed 2-1 instead of the real 1-2)", async () => {
  // Swap the goal counts and rebuild a matching equality strategy: every
  // in-program consistency check passes, but the Merkle leaves no longer hash
  // up to the on-chain daily root. txoracle rejects this either by erroring
  // (InvalidStatProof — observed live for tampered leaves) or by returning
  // FALSE, which resolve must catch from CPI return data (ProofRejected) —
  // a successful CPI alone is never treated as verification.
  const tampered = withStatValues(proofA.payload, [2, 1]);
  await expectError(
    program.methods
      .resolve(tampered, equalityStrategy(tampered))
      .accountsPartial({ market: marketA, dailyScoresRoots: proofA.rootsPda })
      .preInstructions([computeBudgetIx])
      .rpc(),
    "ProofRejected",
    "InvalidStatProof",
  );

  // The market must be untouched by the failed resolve.
  const market = await program.account.market.fetch(marketA);
  assert.deepEqual(market.state, { open: {} });
  assert.equal(market.outcome, null);
});

test("resolve rejects a wrong (even genuine) daily_scores_roots account", async () => {
  await expectError(
    program.methods
      .resolve(proofA.payload, proofA.strategy)
      .accountsPartial({ market: marketA, dailyScoresRoots: proofB.rootsPda }) // valid PDA, wrong epoch day
      .preInstructions([computeBudgetIx])
      .rpc(),
    "WrongRootsAccount",
  );
});

test("resolve rejects a proof for a different fixture", async () => {
  await expectError(
    program.methods
      .resolve(proofB.payload, proofB.strategy)
      .accountsPartial({ market: marketA, dailyScoresRoots: proofB.rootsPda })
      .preInstructions([computeBudgetIx])
      .rpc(),
    "FixtureMismatch",
  );
});

test("resolve rejects a strategy that does not pin the proved values", async () => {
  const loose: NDimensionalStrategy = { geometricTargets: [], distancePredicate: null, discretePredicates: [] };
  await expectError(
    program.methods
      .resolve(proofA.payload, loose)
      .accountsPartial({ market: marketA, dailyScoresRoots: proofA.rootsPda })
      .preInstructions([computeBudgetIx])
      .rpc(),
    "StrategyNotExactEquality",
  );
});

test("resolve verifies the real proof against the cloned txoracle and settles P2Win", async () => {
  const signature = await program.methods
    .resolve(proofA.payload, proofA.strategy)
    .accountsPartial({ market: marketA, dailyScoresRoots: proofA.rootsPda })
    .preInstructions([computeBudgetIx])
    .rpc();
  console.log("    resolve tx:", signature);

  const market = await program.account.market.fetch(marketA);
  assert.deepEqual(market.state, { resolved: {} });
  assert.deepEqual(market.outcome, { p2Win: {} });
});

test("resolved market accepts no further bets and cannot be resolved twice", async () => {
  await expectError(place(user2, marketA, P1WIN, 1n * USDC), "MarketNotOpen");
  await expectError(
    program.methods
      .resolve(proofA.payload, proofA.strategy)
      .accountsPartial({ market: marketA, dailyScoresRoots: proofA.rootsPda })
      .preInstructions([computeBudgetIx])
      .rpc(),
    "MarketNotOpen",
  );
});

test("claims pay winners pro-rata, reject losers and double claims", async () => {
  const total = 211n * USDC;
  const winningPool = 161n * USDC;
  const expected1 = (120n * USDC * total) / winningPool; // floor division, matches on-chain u128 math
  const expected3 = (41n * USDC * total) / winningPool;

  const before1 = await balanceOf(user1);
  await claim(user1, marketA);
  assert.equal((await balanceOf(user1)) - before1, expected1);

  const before3 = await balanceOf(user3);
  await claim(user3, marketA);
  assert.equal((await balanceOf(user3)) - before3, expected3);

  await expectError(claim(user2, marketA), "NotAWinner");
  await expectError(claim(user1, marketA), "AlreadyClaimed");

  // Only rounding dust may remain in the vault.
  const dust = total - expected1 - expected3;
  assert.equal((await getAccount(connection, vaultPda(marketA))).amount, dust);
  assert.ok(dust < 2n, `dust should be < 2 base units, got ${dust}`);
});

test("refund mode: when nobody picked the winner, every position claims its stake back", async () => {
  const closeTs = Math.floor(Date.now() / 1000) + 3600;
  await program.methods
    .createMarket(new BN(FIXTURE_B), new BN(closeTs))
    .accountsPartial({ payer: payer.publicKey, market: marketB, mint, vault: vaultPda(marketB) })
    .rpc();

  // Spain won 2-1 (P1Win) — both users bet on other outcomes.
  await place(user1, marketB, DRAW, 30n * USDC);
  await place(user2, marketB, P2WIN, 40n * USDC);

  await program.methods
    .resolve(proofB.payload, proofB.strategy)
    .accountsPartial({ market: marketB, dailyScoresRoots: proofB.rootsPda })
    .preInstructions([computeBudgetIx])
    .rpc();
  const market = await program.account.market.fetch(marketB);
  assert.deepEqual(market.outcome, { p1Win: {} });

  const before1 = await balanceOf(user1);
  const before2 = await balanceOf(user2);
  await claim(user1, marketB);
  await claim(user2, marketB);
  assert.equal((await balanceOf(user1)) - before1, 30n * USDC);
  assert.equal((await balanceOf(user2)) - before2, 40n * USDC);
  assert.equal((await getAccount(connection, vaultPda(marketB))).amount, 0n);

  await expectError(claim(user1, marketB), "AlreadyClaimed");
});
