import { USDC_BASE } from "./config";

/** "12.5" -> 12_500_000n (6-decimal base units). Returns null on invalid input. */
export function parseUsdc(input: string): bigint | null {
  const match = input.trim().match(/^(\d+)(?:\.(\d{1,6}))?$/);
  if (!match) return null;
  const whole = BigInt(match[1]);
  const frac = BigInt((match[2] ?? "").padEnd(6, "0") || "0");
  return whole * USDC_BASE + frac;
}

/** 12_500_000n -> "12.5" (trailing zeros trimmed, thousands separators). */
export function formatUsdc(base: bigint, maxFrac = 2): string {
  const negative = base < 0n;
  const abs = negative ? -base : base;
  const whole = abs / USDC_BASE;
  const frac = abs % USDC_BASE;
  const wholeStr = whole.toLocaleString("en-US");
  if (frac === 0n || maxFrac === 0) return `${negative ? "-" : ""}${wholeStr}`;
  const fracStr = frac.toString().padStart(6, "0").slice(0, maxFrac).replace(/0+$/, "");
  return `${negative ? "-" : ""}${wholeStr}${fracStr ? `.${fracStr}` : ""}`;
}

export function shortAddress(address: string, chars = 4): string {
  return `${address.slice(0, chars)}…${address.slice(-chars)}`;
}

/** 32-byte array -> lowercase hex string. */
export function bytesToHex(bytes: number[] | Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function shortHex(hex: string, chars = 6): string {
  return `${hex.slice(0, chars)}…${hex.slice(-chars)}`;
}

export function formatDateUtc(ms: number): string {
  return new Date(ms).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
    hour12: false,
  });
}
