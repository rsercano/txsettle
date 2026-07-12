/**
 * POST /api/faucet { wallet: string }
 *
 * Mints 500 mock-USDC (devnet demo token, 6 decimals) to the caller's
 * associated token account, creating the ATA when needed. Signs with the
 * mint-authority keypair at DEV_WALLET_PATH — a throwaway devnet key.
 * Naive in-memory rate limit: one drip per wallet / per IP per 10 minutes.
 */
import * as fs from "node:fs";

import { createAssociatedTokenAccountIdempotentInstruction, createMintToInstruction, getAssociatedTokenAddressSync } from "@solana/spl-token";
import { Connection, Keypair, PublicKey, Transaction, sendAndConfirmTransaction } from "@solana/web3.js";
import { NextResponse } from "next/server";

import { MOCK_USDC_MINT, RPC_URL, USDC_BASE } from "@/lib/config";
import { withRetry } from "@/lib/rpc";

export const runtime = "nodejs";

const DRIP_AMOUNT = 500n * USDC_BASE;
const COOLDOWN_MS = 10 * 60 * 1000;
/** One drip per wallet per cooldown; a few per IP (multi-wallet demos from one machine). */
const MAX_PER_IP = 4;

const drips = new Map<string, number[]>();

function isLimited(key: string, max: number): boolean {
  const cutoff = Date.now() - COOLDOWN_MS;
  return (drips.get(key) ?? []).filter((ts) => ts > cutoff).length >= max;
}

function recordDrip(keys: string[]): void {
  const now = Date.now();
  const cutoff = now - COOLDOWN_MS;
  // Naive in-memory bookkeeping — prune so the map can't grow unbounded.
  if (drips.size > 5_000) {
    for (const [entry, timestamps] of drips) {
      if (timestamps.every((ts) => ts <= cutoff)) drips.delete(entry);
    }
  }
  for (const key of keys) drips.set(key, [...(drips.get(key) ?? []).filter((ts) => ts > cutoff), now]);
}

let authority: Keypair | undefined;

function mintAuthority(): Keypair {
  if (!authority) {
    // Hosted (Vercel): key material in DEV_WALLET_JSON; local: file at DEV_WALLET_PATH.
    const json = process.env.DEV_WALLET_JSON;
    const path = process.env.DEV_WALLET_PATH;
    const raw = json ?? (path ? fs.readFileSync(path, "utf8") : undefined);
    if (!raw) throw new Error("Set DEV_WALLET_JSON or DEV_WALLET_PATH for the faucet signer");
    authority = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(raw) as number[]));
  }
  return authority;
}

export async function POST(request: Request): Promise<NextResponse> {
  let wallet: PublicKey;
  try {
    const body = (await request.json()) as { wallet?: string };
    wallet = new PublicKey(body.wallet ?? "");
  } catch {
    return NextResponse.json({ error: "body must be { wallet: <base58 pubkey> }" }, { status: 400 });
  }

  const ip = (request.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const limitKeys = [`w:${wallet.toBase58()}`, `ip:${ip}`];
  if (isLimited(limitKeys[0], 1) || isLimited(limitKeys[1], MAX_PER_IP)) {
    return NextResponse.json({ error: "faucet cooldown: try again in a few minutes" }, { status: 429 });
  }

  try {
    const payer = mintAuthority();
    const connection = new Connection(process.env.SOLANA_RPC ?? RPC_URL, "confirmed");
    const ata = getAssociatedTokenAddressSync(MOCK_USDC_MINT, wallet);

    const tx = new Transaction().add(
      createAssociatedTokenAccountIdempotentInstruction(payer.publicKey, ata, wallet, MOCK_USDC_MINT),
      createMintToInstruction(MOCK_USDC_MINT, ata, payer.publicKey, DRIP_AMOUNT),
    );
    const signature = await withRetry(() => sendAndConfirmTransaction(connection, tx, [payer], { commitment: "confirmed" }), 3);

    recordDrip(limitKeys);
    return NextResponse.json({ signature, tokenAccount: ata.toBase58(), amount: DRIP_AMOUNT.toString() });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("faucet error:", message);
    return NextResponse.json({ error: `faucet failed: ${message}` }, { status: 500 });
  }
}
