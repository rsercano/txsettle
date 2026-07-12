/**
 * # @txsettle/sdk
 *
 * Trustless settlement proofs for TxLINE World Cup data on Solana.
 *
 * TxODDS publishes a Merkle root of every 5-minute batch of match data to the
 * txoracle program on-chain (`daily_scores_roots` accounts, one per UTC day).
 * This SDK fetches the Merkle proof for a finished fixture's verified final
 * stats from TxLINE and checks it against that on-chain root — so a
 * prediction market can settle on data that is *provably* what TxODDS
 * published, with no trusted oracle or admin key in the settlement path.
 *
 * Typical flow:
 *
 * ```ts
 * import { getSettlementProof, preVerify } from "@txsettle/sdk";
 *
 * // 1. Build the validate_stat_v2 argument pair for a finished fixture.
 * //    seq is auto-discovered from the fixture's game_finalised record.
 * const proof = await getSettlementProof({ fixtureId: 18213979 });
 *
 * // 2. Dry-run the exact on-chain check as a free read-only simulation.
 * const { verified, detail } = await preVerify(proof);
 *
 * // 3. (WIP) Submit proof.payload + proof.strategy to the TxSettle market
 * //    program's permissionless `resolve` to settle a market.
 * ```
 *
 * @packageDocumentation
 */

export { TxLineClient } from "./txline.js";
export type { Fixture, ScoresRecord, StatValidationResponse, TxLineClientOptions } from "./txline.js";

export { DEFAULT_STAT_KEYS, TXORACLE_DEVNET_PROGRAM_ID, deriveEpochDay, deriveScoresRootsPda, discoverFinalisedSeq, getSettlementProof } from "./proof.js";
export type {
  BinaryExpression,
  Comparison,
  GeometricTarget,
  GetSettlementProofOptions,
  GetSettlementProofParams,
  NDimensionalStrategy,
  ProofNode,
  ScoreStat,
  ScoresBatchSummary,
  ScoresUpdateStats,
  SettlementProof,
  StatLeaf,
  StatPredicate,
  StatValidationInput,
  TraderPredicate,
} from "./proof.js";

export { preVerify } from "./verify.js";
export type { PreVerifyOptions, PreVerifyResult } from "./verify.js";
