import { PublicKey } from "@solana/web3.js";

/** txsettle_market program (Solana devnet). */
export const PROGRAM_ID = new PublicKey("45MwWqTXE9nWN2kyVERpZqRXwr6vDDaMyk9sYudG14qx");

/** txoracle verifier program (Solana devnet) — holds the daily_scores_roots accounts. */
export const TXORACLE_PROGRAM_ID = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");

/** Devnet mock-USDC mint all demo markets are denominated in (6 decimals). */
export const MOCK_USDC_MINT = new PublicKey("C8Y9EkaRzanSBg3Ts9vf77Y6T3fFaorCmTkL9HKn3zAR");

/**
 * Funded devnet account used purely as the FEE PAYER of signatureless
 * read-only simulations (proof pre-verification without a connected wallet).
 * Public key only — nothing is ever signed or spent.
 */
export const SIM_FEE_PAYER = new PublicKey("9w1m84c3CtTKpvMkFzpp52iFDf3HoFE6PLQ68xHKxRgF");

export const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";

export const TXLINE_API_TOKEN = process.env.NEXT_PUBLIC_TXLINE_API_TOKEN ?? "";
export const TXLINE_API_BASE = process.env.NEXT_PUBLIC_TXLINE_API_BASE ?? "https://txline-dev.txodds.com/api";
export const TXLINE_AUTH_URL = process.env.NEXT_PUBLIC_TXLINE_AUTH_URL ?? "https://txline-dev.txodds.com/auth/guest/start";

export const USDC_DECIMALS = 6;
export const USDC_BASE = 1_000_000n;

/** TxLINE competition id of the 2026 World Cup. */
export const WORLD_CUP_COMPETITION_ID = 72;

/** Compute-unit budget for resolve (measured ~212K CU incl. validate_stat_v2 CPI). */
export const RESOLVE_CU_LIMIT = 400_000;

export const REPO_URL = "https://github.com/rsercano/txsettle";

export const explorerAddressUrl = (address: string): string => `https://explorer.solana.com/address/${address}?cluster=devnet`;
export const explorerTxUrl = (signature: string): string => `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
