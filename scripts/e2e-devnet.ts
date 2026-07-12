/**
 * Live devnet end-to-end run of the full TxSettle market cycle against the
 * REAL txoracle verifier and a REAL finished World Cup fixture:
 *
 *   18213979 — Norway 1-2 England (quarterfinal, 2026-07-11) -> P2Win
 *
 *   1. create a 6-decimal mock-USDC mint + the market (PDA is per fixture)
 *   2. two fresh bettors place on opposite outcomes (escrow into the vault)
 *   3. a TAMPERED proof (claiming 2-1) is submitted first — txoracle returns
 *      false and resolve aborts with ProofRejected
 *   4. the genuine TxLINE Merkle proof resolves the market permissionlessly
 *   5. the winner claims the whole pot pro-rata; the loser and a double claim
 *      are rejected
 *
 * Prints every transaction signature with a devnet explorer link.
 * Safe to re-run: completed stages are detected and skipped (the market PDA
 * for a fixture exists exactly once per program deployment).
 *
 * Run: npx tsx scripts/e2e-devnet.ts
 */
import "dotenv/config";
import * as fs from "node:fs";

// Default import: under tsx's ESM loader the CJS lexer misses anchor's re-exported names.
import anchor from "@anchor-lang/core";
import { createMint, getAccount, getOrCreateAssociatedTokenAccount, mintTo } from "@solana/spl-token";
import { getSettlementProof, type NDimensionalStrategy, type SettlementProof, type StatValidationInput } from "@txsettle/sdk";

const { BN, web3 } = anchor;
const { ComputeBudgetProgram, Connection, Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } = web3;

const FIXTURE_ID = 18213979; // Norway 1-2 England -> P2Win
const P1WIN = 0;
const P2WIN = 2;
const USDC = 1_000_000n;
const RPC_URL = process.env.SOLANA_RPC ?? "https://api.devnet.solana.com";
const WALLET_PATH = process.env.DEV_WALLET_PATH ?? "/Users/sercan/IdeaProjects/matchday/_keys/matchday-dev.json";
const IDL_PATH = new URL("../target/idl/txsettle_market.json", import.meta.url);

const explorerTx = (signature: string) => `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
const explorerAddress = (address: { toBase58(): string }) => `https://explorer.solana.com/address/${address.toBase58()}?cluster=devnet`;

function logTx(label: string, signature: string): void {
  console.log(`  ${label}`);
  console.log(`    ${explorerTx(signature)}`);
}

function loadKeypair(path: string): InstanceType<typeof Keypair> {
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(path, "utf8")) as number[]));
}

function equalityStrategy(payload: StatValidationInput): NDimensionalStrategy {
  return {
    geometricTargets: [],
    distancePredicate: null,
    discretePredicates: payload.stats.map((leaf, index) => ({
      single: { index, predicate: { threshold: leaf.stat.value, comparison: { equalTo: {} } } },
    })),
  };
}

function withStatValues(payload: StatValidationInput, values: number[]): StatValidationInput {
  return {
    ...payload,
    stats: payload.stats.map((leaf, i) => ({ stat: { ...leaf.stat, value: values[i] }, statProof: leaf.statProof })),
  };
}

async function expectProgramError(promise: Promise<unknown>, codes: string[], label: string): Promise<void> {
  try {
    await promise;
    throw new Error(`${label}: expected one of [${codes.join(", ")}] but the transaction SUCCEEDED`);
  } catch (error) {
    const anchorCode = (error as { error?: { errorCode?: { code?: string } } }).error?.errorCode?.code;
    const message = anchorCode ?? (error as Error).message ?? String(error);
    const matched = codes.find((code) => message.includes(code));
    if (!matched) throw error;
    console.log(`  ${label}: rejected with ${matched} (as expected)`);
  }
}

const wallet = loadKeypair(WALLET_PATH);
const connection = new Connection(RPC_URL, "confirmed");
const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(wallet), { commitment: "confirmed" });
anchor.setProvider(provider);

const idl = JSON.parse(fs.readFileSync(IDL_PATH, "utf8")) as anchor.Idl;
const program = new anchor.Program(idl, provider);
const computeBudgetIx = ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 });

const [marketPda] = PublicKey.findProgramAddressSync([Buffer.from("market"), new BN(FIXTURE_ID).toArrayLike(Buffer, "le", 8)], program.programId);
const [vaultPda] = PublicKey.findProgramAddressSync([Buffer.from("vault"), marketPda.toBuffer()], program.programId);
const positionPda = (owner: InstanceType<typeof PublicKey>) =>
  PublicKey.findProgramAddressSync([Buffer.from("pos"), marketPda.toBuffer(), owner.toBuffer()], program.programId)[0];

console.log("TxSettle devnet end-to-end — fixture", FIXTURE_ID, "(Norway 1-2 England)");
console.log("  program:", program.programId.toBase58());
console.log("    " + explorerAddress(program.programId));
console.log("  wallet:", wallet.publicKey.toBase58(), `(${(await connection.getBalance(wallet.publicKey)) / LAMPORTS_PER_SOL} SOL)`);
console.log("  market PDA:", marketPda.toBase58());
console.log("    " + explorerAddress(marketPda));

// ---------------------------------------------------------------------------
console.log("\n[1/5] Fetching the TxLINE settlement proof");
const proof: SettlementProof = await getSettlementProof({ fixtureId: FIXTURE_ID });
console.log(`  proved final stats: P1 goals = ${proof.statValues[0]}, P2 goals = ${proof.statValues[1]} (periods ${proof.payload.stats.map((s) => s.stat.period).join("/")})`);
console.log(`  epochDay ${proof.epochDay} -> daily_scores_roots ${proof.rootsPda.toBase58()}`);
console.log("    " + explorerAddress(proof.rootsPda));

// ---------------------------------------------------------------------------
console.log("\n[2/5] Market + mock-USDC mint");
let mint: InstanceType<typeof PublicKey>;
const existingMarket = await connection.getAccountInfo(marketPda);
if (existingMarket) {
  const market = await program.account.market.fetch(marketPda);
  mint = market.mint as InstanceType<typeof PublicKey>;
  console.log("  market already exists (state:", Object.keys(market.state as object)[0] + "), reusing mint", mint.toBase58());
} else {
  mint = await createMint(connection, wallet, wallet.publicKey, null, 6);
  console.log("  mock-USDC mint:", mint.toBase58());
  const closeTs = Math.floor(Date.now() / 1000) + 7200;
  const signature = await program.methods
    .createMarket(new BN(FIXTURE_ID), new BN(closeTs))
    .accountsPartial({ payer: wallet.publicKey, market: marketPda, mint, vault: vaultPda })
    .rpc();
  logTx(`create_market (close_ts ${closeTs})`, signature);
}

const marketState = async () => Object.keys((await program.account.market.fetch(marketPda)).state as object)[0];

// ---------------------------------------------------------------------------
console.log("\n[3/5] Two bettors place on opposite outcomes");
if ((await marketState()) === "resolved") {
  console.log("  market is already resolved — skipping to the summary");
} else {
  const user1 = Keypair.generate(); // will back England (P2Win) — the actual result
  const user2 = Keypair.generate(); // will back Norway (P1Win)
  console.log("  bettor 1 (P2Win / England):", user1.publicKey.toBase58());
  console.log("  bettor 2 (P1Win / Norway): ", user2.publicKey.toBase58());

  const userTokens = new Map<string, InstanceType<typeof PublicKey>>();
  for (const user of [user1, user2]) {
    const fund = new web3.Transaction().add(
      SystemProgram.transfer({ fromPubkey: wallet.publicKey, toPubkey: user.publicKey, lamports: Math.floor(0.02 * LAMPORTS_PER_SOL) }),
    );
    await provider.sendAndConfirm(fund);
    const tokenAccount = await getOrCreateAssociatedTokenAccount(connection, wallet, mint, user.publicKey);
    await mintTo(connection, wallet, mint, tokenAccount.address, wallet, 1_000n * USDC);
    userTokens.set(user.publicKey.toBase58(), tokenAccount.address);
  }

  const place = async (user: InstanceType<typeof Keypair>, outcome: number, amount: bigint) =>
    program.methods
      .place(outcome, new BN(amount.toString()))
      .accountsPartial({
        owner: user.publicKey,
        market: marketPda,
        position: positionPda(user.publicKey),
        mint,
        userToken: userTokens.get(user.publicKey.toBase58())!,
        vault: vaultPda,
      })
      .signers([user])
      .rpc();

  logTx("place: bettor 1 stakes 100 USDC on P2Win", await place(user1, P2WIN, 100n * USDC));
  logTx("place: bettor 2 stakes 50 USDC on P1Win", await place(user2, P1WIN, 50n * USDC));
  console.log(`  vault escrow: ${(await getAccount(connection, vaultPda)).amount / USDC} USDC`);

  // -------------------------------------------------------------------------
  console.log("\n[4/5] Permissionless resolve against the on-chain daily root");
  const tampered = withStatValues(proof.payload, [2, 1]);
  await expectProgramError(
    program.methods
      .resolve(tampered, equalityStrategy(tampered))
      .accountsPartial({ market: marketPda, dailyScoresRoots: proof.rootsPda })
      .preInstructions([computeBudgetIx])
      .rpc(),
    ["ProofRejected", "InvalidStatProof"],
    "tampered proof claiming Norway 2-1",
  );

  const resolveSignature = await program.methods
    .resolve(proof.payload, proof.strategy)
    .accountsPartial({ market: marketPda, dailyScoresRoots: proof.rootsPda })
    .preInstructions([computeBudgetIx])
    .rpc();
  logTx("resolve: genuine proof verified by txoracle validate_stat_v2", resolveSignature);
  const resolved = await program.account.market.fetch(marketPda);
  console.log("  market outcome:", Object.keys(resolved.outcome as object)[0], "| state:", Object.keys(resolved.state as object)[0]);

  // -------------------------------------------------------------------------
  console.log("\n[5/5] Claims");
  const claim = async (user: InstanceType<typeof Keypair>) =>
    program.methods
      .claim()
      .accountsPartial({
        owner: user.publicKey,
        market: marketPda,
        position: positionPda(user.publicKey),
        mint,
        vault: vaultPda,
        userToken: userTokens.get(user.publicKey.toBase58())!,
      })
      .signers([user])
      .rpc();

  const before = (await getAccount(connection, userTokens.get(user1.publicKey.toBase58())!)).amount;
  logTx("claim: bettor 1 (winner)", await claim(user1));
  const after = (await getAccount(connection, userTokens.get(user1.publicKey.toBase58())!)).amount;
  console.log(`  bettor 1 payout: ${(after - before) / USDC} USDC (staked 100, pot 150)`);

  await expectProgramError(claim(user2), ["NotAWinner"], "claim by bettor 2 (loser)");
  await expectProgramError(claim(user1), ["AlreadyClaimed"], "second claim by bettor 1");
  console.log(`  vault after claims: ${(await getAccount(connection, vaultPda)).amount} base units`);
}

// ---------------------------------------------------------------------------
const market = await program.account.market.fetch(marketPda);
console.log("\nFinal market state");
console.log("  fixture:", (market.fixtureId as InstanceType<typeof BN>).toString());
console.log("  state:", Object.keys(market.state as object)[0], "| outcome:", market.outcome ? Object.keys(market.outcome as object)[0] : "none");
console.log("  pools [P1Win, Draw, P2Win]:", (market.pools as InstanceType<typeof BN>[]).map((pool) => pool.toString()).join(", "));
console.log("  market:", explorerAddress(marketPda));
console.log("\nSettlement was derived on-chain from TxODDS' published Merkle root — no admin key, no trusted oracle.");
