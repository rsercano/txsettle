/**
 * Off-chain pre-verification of settlement proofs.
 *
 * {@link preVerify} runs the txoracle program's `validate_stat_v2` as a
 * read-only `.view()` simulation on devnet: the program walks each stat proof
 * to the event stat root, then the fixture sub-tree and main-tree proofs up to
 * the Merkle root stored in the on-chain `daily_scores_roots` account for the
 * proof's epoch day. A `true` result is a cryptographic match — the exact same
 * check a settlement transaction will perform on-chain, at zero cost.
 */
// Default import on purpose: under tsx's ESM loader the CJS lexer misses anchor's
// re-exported names (BN, Program & co.), so the namespace form leaves them undefined.
import anchor from "@coral-xyz/anchor";
import { ComputeBudgetProgram, Connection, Keypair, PublicKey } from "@solana/web3.js";
import * as fs from "node:fs";
import { TXORACLE_DEVNET_PROGRAM_ID, type SettlementProof } from "./proof.js";

// Read the IDL at runtime instead of a JSON import: import attributes are not
// supported consistently across the TS/tsx/Node matrix this SDK targets.
const IDL_URL = new URL("../idl/txoracle.json", import.meta.url);

/** Options for {@link preVerify}. Every field falls back to an env var, then to the devnet default. */
export interface PreVerifyOptions {
  /** RPC endpoint, default `SOLANA_RPC` or `https://api.devnet.solana.com`. */
  rpcUrl?: string;
  /**
   * Fee payer for the simulation. `.view()` simulates a transaction, so the
   * payer must be a funded account — no signature is broadcast and nothing is
   * spent. Defaults to the keypair JSON at {@link walletPath}.
   */
  payer?: Keypair;
  /** Path to a keypair JSON used as {@link payer}, default `DEV_WALLET_PATH`. */
  walletPath?: string;
  /** txoracle program id, default devnet (`TXORACLE_PROGRAM_ID` env also honored). */
  programId?: PublicKey;
}

/** Outcome of a {@link preVerify} run. */
export interface PreVerifyResult {
  /** `true` iff `validate_stat_v2` accepted the proof against the on-chain daily root. */
  verified: boolean;
  /** Base58 address of the `daily_scores_roots` account the proof was checked against. */
  rootsAccount: string;
  /** Solana explorer link for {@link rootsAccount} (devnet cluster). */
  explorerUrl: string;
  /** Human-readable diagnostics: what was proved, or why verification failed. */
  detail: string;
}

/**
 * Simulate `validate_stat_v2(payload, strategy)` against the proof's
 * `daily_scores_roots` account and report whether the chain accepts it.
 *
 * Never submits a transaction. Throws only on local misconfiguration (missing
 * fee-payer keypair); network and program-level failures are reported as
 * `verified: false` with a diagnostic `detail`.
 */
export async function preVerify(proof: SettlementProof, options: PreVerifyOptions = {}): Promise<PreVerifyResult> {
  const rpcUrl = options.rpcUrl ?? process.env.SOLANA_RPC ?? "https://api.devnet.solana.com";
  const programId = options.programId ?? envProgramId() ?? TXORACLE_DEVNET_PROGRAM_ID;
  const payer = options.payer ?? loadPayer(options.walletPath ?? process.env.DEV_WALLET_PATH);

  const rootsAccount = proof.rootsPda.toBase58();
  const explorerUrl = `https://explorer.solana.com/address/${rootsAccount}?cluster=devnet`;
  const fail = (detail: string): PreVerifyResult => ({ verified: false, rootsAccount, explorerUrl, detail });

  try {
    const connection = new Connection(rpcUrl, "confirmed");
    const rootsInfo = await connection.getAccountInfo(proof.rootsPda);
    if (!rootsInfo) return fail(`daily_scores_roots account for epochDay ${proof.epochDay} does not exist on this cluster`);

    const provider = new anchor.AnchorProvider(connection, new anchor.Wallet(payer), { commitment: "confirmed" });
    // The shipped IDL carries the MAINNET program address — override with the devnet id.
    const idl = { ...(JSON.parse(fs.readFileSync(IDL_URL, "utf8")) as Record<string, unknown>), address: programId.toBase58() };
    const program = new anchor.Program(idl as anchor.Idl, provider);

    const verified = Boolean(
      await program.methods
        .validateStatV2(proof.payload, proof.strategy)
        .accounts({ dailyScoresMerkleRoots: proof.rootsPda })
        .preInstructions([ComputeBudgetProgram.setComputeUnitLimit({ units: 1_400_000 })])
        .view(),
    );

    const proved = proof.payload.stats.map((leaf) => `statKey ${leaf.stat.key} = ${leaf.stat.value}`).join(", ");
    return {
      verified,
      rootsAccount,
      explorerUrl,
      detail: verified
        ? `validate_stat_v2 view passed against daily_scores_roots epochDay ${proof.epochDay}: ${proved}`
        : `on-chain program rejected the proof: ${proved}`,
    };
  } catch (error) {
    return fail(`verification failed: ${(error as Error).message ?? String(error)}`);
  }
}

function envProgramId(): PublicKey | undefined {
  const id = process.env.TXORACLE_PROGRAM_ID;
  return id ? new PublicKey(id) : undefined;
}

function loadPayer(walletPath: string | undefined): Keypair {
  if (!walletPath) {
    throw new Error("preVerify needs a funded fee payer for the view() simulation: pass options.payer/options.walletPath or set DEV_WALLET_PATH");
  }
  if (!fs.existsSync(walletPath)) throw new Error(`fee-payer keypair not found at ${walletPath}`);
  return Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync(walletPath, "utf8")) as number[]));
}
