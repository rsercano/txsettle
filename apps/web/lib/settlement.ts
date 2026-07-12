/**
 * Browser-side settlement tooling on top of @txsettle/sdk:
 *
 *  - {@link getProof}: fetch + shape the TxLINE Merkle proof (SDK, browser-side)
 *  - {@link preVerifyProof}: run txoracle `validate_stat_v2` as a signatureless
 *    read-only simulation and read the verifier's boolean from return data —
 *    the exact check `resolve` performs on-chain, at zero cost
 *  - {@link findResolveTx}: locate a resolved market's settlement transaction
 *    in on-chain history by instruction discriminator
 */
import { Program, type Idl, type Provider } from "@coral-xyz/anchor";
import { ComputeBudgetProgram, PublicKey, TransactionMessage, VersionedTransaction, type Connection } from "@solana/web3.js";

import txoracleIdl from "@txsettle/sdk/idl/txoracle.json";
import { getSettlementProof, type SettlementProof } from "@txsettle/sdk/proof";

import { PROGRAM_ID, SIM_FEE_PAYER, TXORACLE_PROGRAM_ID } from "./config";
import { txlineClient } from "./fixtures";
import idlJson from "./idl/txsettle_market.json";
import { withRetry } from "./rpc";

const proofCache = new Map<number, Promise<SettlementProof>>();

/** Fetch the settlement proof for a finished fixture via the SDK (cached per fixture). */
export function getProof(fixtureId: number): Promise<SettlementProof> {
  let promise = proofCache.get(fixtureId);
  if (!promise) {
    promise = getSettlementProof({ fixtureId }, { client: txlineClient(), programId: TXORACLE_PROGRAM_ID }).catch((error) => {
      proofCache.delete(fixtureId); // never cache a failure
      throw error;
    });
    proofCache.set(fixtureId, promise);
  }
  return promise;
}

export interface PreVerifyOutcome {
  verified: boolean;
  computeUnits?: number;
  error?: string;
}

/**
 * Simulate `validate_stat_v2(payload, strategy)` against the proof's on-chain
 * daily root. No wallet needed: the transaction is never signed or sent
 * (sigVerify off, blockhash replaced), and the fee payer is any funded devnet
 * account — the connected wallet when available, a public devnet account
 * otherwise.
 */
export async function preVerifyProof(connection: Connection, proof: SettlementProof, feePayer?: PublicKey): Promise<PreVerifyOutcome> {
  const oracle = new Program({ ...(txoracleIdl as Idl), address: TXORACLE_PROGRAM_ID.toBase58() } as Idl, { connection } as Provider);
  const instruction = await oracle.methods
    .validateStatV2(proof.payload, proof.strategy)
    .accounts({ dailyScoresMerkleRoots: proof.rootsPda })
    .instruction();

  const message = new TransactionMessage({
    payerKey: feePayer ?? SIM_FEE_PAYER,
    recentBlockhash: "11111111111111111111111111111111", // replaced by the RPC node
    instructions: [ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 }), instruction],
  }).compileToV0Message();

  const simulation = await withRetry(() =>
    connection.simulateTransaction(new VersionedTransaction(message), {
      sigVerify: false,
      replaceRecentBlockhash: true,
      commitment: "confirmed",
    }),
  );

  if (simulation.value.err) {
    return { verified: false, error: `simulation failed: ${JSON.stringify(simulation.value.err)}` };
  }
  const returnData = simulation.value.returnData;
  if (!returnData || returnData.programId !== TXORACLE_PROGRAM_ID.toBase58()) {
    return { verified: false, error: "verifier returned no data" };
  }
  const bytes = Buffer.from(returnData.data[0], "base64");
  return { verified: bytes.length > 0 && bytes[0] === 1, computeUnits: simulation.value.unitsConsumed };
}

const RESOLVE_DISCRIMINATOR = Buffer.from((idlJson.instructions.find((ix) => ix.name === "resolve")?.discriminator ?? []) as number[]);

export interface ResolveTxInfo {
  signature: string;
  blockTime: number | null;
}

/**
 * Find the transaction that resolved a market: walk its (short) signature
 * history and match the resolve instruction discriminator. Cached in
 * localStorage — a settlement transaction never changes.
 */
export async function findResolveTx(connection: Connection, market: PublicKey): Promise<ResolveTxInfo | null> {
  const cacheKey = `txsettle:resolveTx:${market.toBase58()}`;
  try {
    const cached = typeof window !== "undefined" ? window.localStorage.getItem(cacheKey) : null;
    if (cached) return JSON.parse(cached) as ResolveTxInfo;
  } catch {
    /* localStorage unavailable — fall through */
  }

  const signatures = await withRetry(() => connection.getSignaturesForAddress(market, { limit: 25 }));
  for (const entry of signatures) {
    if (entry.err) continue;
    const tx = await withRetry(() => connection.getTransaction(entry.signature, { maxSupportedTransactionVersion: 0 }));
    if (!tx) continue;
    const message = tx.transaction.message;
    const keys = message.staticAccountKeys;
    const isResolve = message.compiledInstructions.some(
      (ix) => keys[ix.programIdIndex].equals(PROGRAM_ID) && Buffer.from(ix.data).subarray(0, 8).equals(RESOLVE_DISCRIMINATOR),
    );
    if (isResolve) {
      const info: ResolveTxInfo = { signature: entry.signature, blockTime: entry.blockTime ?? null };
      try {
        window.localStorage.setItem(cacheKey, JSON.stringify(info));
      } catch {
        /* best effort */
      }
      return info;
    }
  }
  return null;
}
