/**
 * Read-path resilience: the public devnet RPC rate-limits aggressively (HTTP
 * 429). Every read in the app goes through {@link withRetry}, which backs off
 * exponentially with jitter on rate limits and transient network failures.
 */

const RETRYABLE = /429|too many requests|rate.?limit|-32429|timed?\s?out|econnreset|socket hang up|fetch failed|failed to fetch|load failed|network ?error|50[234]/i;

export async function withRetry<T>(fn: () => Promise<T>, retries = 5, baseMs = 600): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      if (attempt === retries || !RETRYABLE.test(message)) throw error;
      const delay = baseMs * 2 ** attempt + Math.random() * 250;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

/** Human-readable message out of wallet/anchor/RPC error shapes. */
export function errorMessage(error: unknown): string {
  if (!error) return "unknown error";
  const anchorError = error as { error?: { errorMessage?: string; errorCode?: { code?: string } } };
  if (anchorError.error?.errorMessage) return anchorError.error.errorMessage;
  if (anchorError.error?.errorCode?.code) return anchorError.error.errorCode.code;
  const message = error instanceof Error ? error.message : String(error);
  if (/user rejected/i.test(message)) return "transaction rejected in wallet";
  return message.length > 220 ? `${message.slice(0, 220)}…` : message;
}
