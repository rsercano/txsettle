/**
 * Settlement-proof construction.
 *
 * {@link getSettlementProof} turns a finished TxLINE fixture into the exact
 * pair of arguments the on-chain txoracle program's `validate_stat_v2`
 * instruction takes (`StatValidationInput` payload + `NDimensionalStrategy`),
 * plus everything a settlement transaction needs around them: the epoch day
 * the proof anchors to and the `daily_scores_roots` PDA holding the published
 * Merkle root for that day.
 *
 * Proof path: stat leaf -> eventStatRoot -> fixture sub-tree -> main tree ->
 * the 32-byte root stored in the on-chain `daily_scores_roots` account. If
 * `validate_stat_v2` returns `true` for this payload, the stat values are
 * cryptographically committed to by TxODDS' on-chain publication — no trusted
 * oracle in the settlement path.
 */
// Default import on purpose: under tsx's ESM loader the CJS lexer misses anchor's
// re-exported names (BN & co.), so the namespace form leaves anchor.BN undefined.
import anchor from "@coral-xyz/anchor";
import type { BN } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { TxLineClient, type ScoresRecord, type StatValidationResponse } from "./txline.js";

/** txoracle program on Solana devnet. The shipped IDL carries the MAINNET address — always override with this one on devnet. */
export const TXORACLE_DEVNET_PROGRAM_ID = new PublicKey("6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J");

/** Default stat keys: total goals for participant 1 and participant 2 (period prefix 0 = full match). */
export const DEFAULT_STAT_KEYS: readonly number[] = [1, 2];

const MILLIS_PER_DAY = 86_400_000;

// ---------------------------------------------------------------------------
// validate_stat_v2 argument types (camelCase mirror of the txoracle IDL types)
// ---------------------------------------------------------------------------

/** One Merkle proof step: sibling hash + which side it sits on. */
export interface ProofNode {
  /** 32 bytes. */
  hash: number[];
  isRightSibling: boolean;
}

/** A single provable key-value statistic — the leaf of the inner-most Merkle tree. */
export interface ScoreStat {
  key: number;
  value: number;
  period: number;
}

/** A stat plus its proof up to the event's stat root. */
export interface StatLeaf {
  stat: ScoreStat;
  statProof: ProofNode[];
}

/** Update counters for one fixture within a 5-minute scores batch. */
export interface ScoresUpdateStats {
  updateCount: number;
  /** Unix ms; the epoch day for the roots PDA is derived from this. */
  minTimestamp: BN;
  maxTimestamp: BN;
}

/** Summary of one fixture's events within a batch, carrying the fixture's events sub-tree root. */
export interface ScoresBatchSummary {
  fixtureId: BN;
  updateStats: ScoresUpdateStats;
  eventsSubTreeRoot: number[];
}

/** First argument of `validate_stat_v2`: the full Merkle path from stats to the daily root. */
export interface StatValidationInput {
  ts: BN;
  fixtureSummary: ScoresBatchSummary;
  fixtureProof: ProofNode[];
  mainTreeProof: ProofNode[];
  eventStatRoot: number[];
  stats: StatLeaf[];
}

/** Anchor enum encoding of the txoracle `Comparison` type. */
export type Comparison = { greaterThan: Record<string, never> } | { lessThan: Record<string, never> } | { equalTo: Record<string, never> };

/** Anchor enum encoding of the txoracle `BinaryExpression` type. */
export type BinaryExpression = { add: Record<string, never> } | { subtract: Record<string, never> };

/** `value <comparison> threshold` check applied to a proved stat. */
export interface TraderPredicate {
  threshold: number;
  comparison: Comparison;
}

/** Predicate over one proved stat (`single`) or over two combined stats (`binary`). Indexes refer to `StatValidationInput.stats`. */
export type StatPredicate =
  | { single: { index: number; predicate: TraderPredicate } }
  | { binary: { indexA: number; indexB: number; op: BinaryExpression; predicate: TraderPredicate } };

/** Euclidean-distance target for a proved stat (unused by the exact-equality strategy this SDK builds). */
export interface GeometricTarget {
  statIndex: number;
  prediction: number;
}

/** Second argument of `validate_stat_v2`: what must hold for the proved stats. */
export interface NDimensionalStrategy {
  geometricTargets: GeometricTarget[];
  distancePredicate: TraderPredicate | null;
  discretePredicates: StatPredicate[];
}

// ---------------------------------------------------------------------------
// Settlement proof
// ---------------------------------------------------------------------------

/** Parameters for {@link getSettlementProof}. */
export interface GetSettlementProofParams {
  /** TxLINE fixture id of a finished match. */
  fixtureId: number;
  /**
   * Sequence number of the scores record to prove. When omitted the SDK looks
   * up the fixture's `game_finalised` record (the analyst-verified final
   * outcome) and uses its seq.
   */
  seq?: number;
  /** On-chain stat keys to prove. Default `[1, 2]` = full-match goals P1/P2. */
  statKeys?: number[];
}

/** Optional collaborators for {@link getSettlementProof}. */
export interface GetSettlementProofOptions {
  /** Reuse an existing TxLINE client (default: a fresh one from env config). */
  client?: TxLineClient;
  /** txoracle program id used for the PDA derivation (default: devnet). */
  programId?: PublicKey;
}

/** Everything needed to verify (and later settle on) a TxLINE stat proof on-chain. */
export interface SettlementProof {
  fixtureId: number;
  /** Sequence number of the proved scores record. */
  seq: number;
  /** Stat keys in proof order. */
  statKeys: number[];
  /** Proved values, index-aligned with {@link statKeys}. */
  statValues: number[];
  /** Days since Unix epoch of the proof's own minTimestamp — never derived from the local clock. */
  epochDay: number;
  /** `daily_scores_roots` PDA for {@link epochDay}; holds the published Merkle root the proof must chain up to. */
  rootsPda: PublicKey;
  /** First argument of `validate_stat_v2`, exactly as the program expects it. */
  payload: StatValidationInput;
  /** Second argument of `validate_stat_v2`: exact-equality predicates for every proved stat. */
  strategy: NDimensionalStrategy;
}

/**
 * Fetch the Merkle stat proof for a finished fixture and shape it into the
 * `validate_stat_v2` argument pair.
 *
 * ```ts
 * const proof = await getSettlementProof({ fixtureId: 18213979 });
 * const result = await preVerify(proof); // read-only on-chain check
 * ```
 *
 * @throws if the fixture has no `game_finalised` record yet (and no explicit
 *         `seq` was given), or if the validation response is malformed.
 */
export async function getSettlementProof(params: GetSettlementProofParams, options: GetSettlementProofOptions = {}): Promise<SettlementProof> {
  const client = options.client ?? new TxLineClient();
  const programId = options.programId ?? TXORACLE_DEVNET_PROGRAM_ID;
  const statKeys = params.statKeys && params.statKeys.length > 0 ? [...params.statKeys] : [...DEFAULT_STAT_KEYS];

  const seq = params.seq ?? discoverFinalisedSeq(await client.scoresSnapshot(params.fixtureId));
  const validation = await client.statValidation(params.fixtureId, seq, statKeys);
  const { payload, statValues, minTimestamp } = buildValidationPayload(validation, params.fixtureId, statKeys);

  // Epoch day MUST come from the proof's own timestamp, not from the clock:
  // the proof chains up to the daily root of the day the data was published.
  const epochDay = deriveEpochDay(minTimestamp);
  const rootsPda = deriveScoresRootsPda(epochDay, programId);

  // Exact-equality strategy: every proved stat must equal the value the proof claims.
  const strategy: NDimensionalStrategy = {
    geometricTargets: [],
    distancePredicate: null,
    discretePredicates: payload.stats.map((leaf, index) => ({
      single: { index, predicate: { threshold: leaf.stat.value, comparison: { equalTo: {} } } },
    })),
  };

  return { fixtureId: params.fixtureId, seq, statKeys, statValues, epochDay, rootsPda, payload, strategy };
}

/**
 * Find the seq of a fixture's `game_finalised` record — the single
 * analyst-verified final-outcome marker — in a list of scores records.
 * Case-tolerant: the feed mixes camelCase and PascalCase envelopes.
 *
 * @throws if no `game_finalised` record with a numeric seq exists (match not finished, or feed not final yet).
 */
export function discoverFinalisedSeq(records: ScoresRecord[]): number {
  let best: number | undefined;
  for (const record of records) {
    if (fieldOf<string>(record, "action") !== "game_finalised") continue;
    const seq = fieldOf<number>(record, "seq");
    if (typeof seq !== "number") continue;
    if (best === undefined || seq > best) best = seq;
  }
  if (best === undefined) throw new Error("no game_finalised record found — fixture is not finalised yet");
  return best;
}

/**
 * Days since Unix epoch (UTC) for a proof timestamp in Unix milliseconds.
 * @throws if the result does not fit the on-chain u16 PDA seed.
 */
export function deriveEpochDay(timestampMs: number): number {
  if (!Number.isFinite(timestampMs)) throw new Error(`invalid proof timestamp: ${timestampMs}`);
  const epochDay = Math.floor(timestampMs / MILLIS_PER_DAY);
  if (epochDay < 0 || epochDay > 0xffff) throw new Error(`epochDay ${epochDay} out of u16 range`);
  return epochDay;
}

/** PDA of the `daily_scores_roots` account for one epoch day: seeds `["daily_scores_roots", epochDay as u16 LE]`. */
export function deriveScoresRootsPda(epochDay: number, programId: PublicKey = TXORACLE_DEVNET_PROGRAM_ID): PublicKey {
  const daySeed = Buffer.alloc(2);
  daySeed.writeUInt16LE(epochDay);
  const [pda] = PublicKey.findProgramAddressSync([Buffer.from("daily_scores_roots"), daySeed], programId);
  return pda;
}

// ---------------------------------------------------------------------------
// Feed parsing helpers (case-tolerant: TxLINE mixes camelCase and PascalCase)
// ---------------------------------------------------------------------------

function fieldOf<T = unknown>(obj: unknown, key: string): T | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const record = obj as Record<string, unknown>;
  const pascal = key.charAt(0).toUpperCase() + key.slice(1);
  const camel = key.charAt(0).toLowerCase() + key.slice(1);
  return (record[camel] ?? record[pascal]) as T | undefined;
}

/** Proof hashes arrive as number[]; accept hex/base64 strings too, always yield exactly 32 bytes. */
function toBytes32(value: unknown): number[] {
  const bytes = Array.isArray(value)
    ? Uint8Array.from(value as number[])
    : value instanceof Uint8Array
      ? value
      : typeof value === "string"
        ? value.length === 64
          ? Buffer.from(value, "hex")
          : Buffer.from(value, "base64")
        : undefined;
  if (!bytes || bytes.length !== 32) throw new Error(`expected a 32-byte hash, got: ${JSON.stringify(value)?.slice(0, 80)}`);
  return Array.from(bytes);
}

function toProofNodes(nodes: unknown, what: string): ProofNode[] {
  if (!Array.isArray(nodes)) throw new Error(`${what} missing from stat-validation response`);
  return nodes.map((node) => ({
    hash: toBytes32(fieldOf(node, "hash") ?? node),
    isRightSibling: Boolean(fieldOf(node, "isRightSibling")),
  }));
}

function buildValidationPayload(
  validation: StatValidationResponse,
  fixtureId: number,
  statKeys: number[],
): { payload: StatValidationInput; statValues: number[]; minTimestamp: number } {
  const summary = fieldOf<Record<string, unknown>>(validation, "summary");
  const updateStats = fieldOf<Record<string, unknown>>(summary, "updateStats");
  const minTimestamp = fieldOf<number>(updateStats, "minTimestamp");
  if (typeof minTimestamp !== "number") throw new Error("stat-validation response has no summary.updateStats.minTimestamp");

  const statsToProve = fieldOf<unknown[]>(validation, "statsToProve") ?? [];
  const statProofs = fieldOf<unknown[]>(validation, "statProofs") ?? [];
  if (statsToProve.length !== statKeys.length) throw new Error(`expected ${statKeys.length} stats in proof, got ${statsToProve.length}`);

  const stats: StatLeaf[] = statsToProve.map((statObj, i) => ({
    stat: {
      key: fieldOf<number>(statObj, "key") ?? statKeys[i],
      value: fieldOf<number>(statObj, "value") ?? 0,
      period: fieldOf<number>(statObj, "period") ?? 0,
    },
    statProof: toProofNodes(statProofs[i], `statProofs[${i}]`),
  }));

  const payload: StatValidationInput = {
    ts: new anchor.BN(minTimestamp),
    fixtureSummary: {
      fixtureId: new anchor.BN(fieldOf<number>(summary, "fixtureId") ?? fixtureId),
      updateStats: {
        updateCount: fieldOf<number>(updateStats, "updateCount") ?? 0,
        minTimestamp: new anchor.BN(minTimestamp),
        maxTimestamp: new anchor.BN(fieldOf<number>(updateStats, "maxTimestamp") ?? minTimestamp),
      },
      eventsSubTreeRoot: toBytes32(fieldOf(summary, "eventStatsSubTreeRoot")),
    },
    fixtureProof: toProofNodes(fieldOf(validation, "subTreeProof"), "subTreeProof"),
    mainTreeProof: toProofNodes(fieldOf(validation, "mainTreeProof"), "mainTreeProof"),
    eventStatRoot: toBytes32(fieldOf(validation, "eventStatRoot")),
    stats,
  };

  return { payload, statValues: stats.map((leaf) => leaf.stat.value), minTimestamp };
}
