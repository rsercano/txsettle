/**
 * Unit tests for seq discovery, epoch-day derivation and PDA derivation, plus
 * one live integration test against a finished devnet fixture.
 *
 * Live test: fixture 18213979 (Norway vs England, finished 1-2) — fetches the
 * settlement proof for statKeys [1, 2] and runs the read-only validate_stat_v2
 * simulation against devnet. Skip with SKIP_LIVE=1.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";
import { PublicKey } from "@solana/web3.js";
import {
  DEFAULT_STAT_KEYS,
  TXORACLE_DEVNET_PROGRAM_ID,
  deriveEpochDay,
  deriveScoresRootsPda,
  discoverFinalisedSeq,
  getSettlementProof,
  preVerify,
} from "../src/index.js";

// Credentials live in the repo-root .env (gitignored).
loadEnv({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });

// ---------------------------------------------------------------------------
// discoverFinalisedSeq
// ---------------------------------------------------------------------------

test("discoverFinalisedSeq finds the game_finalised record among other actions (camelCase)", () => {
  const records = [
    { action: "goal", seq: 240 },
    { action: "status", seq: 300 },
    { action: "game_finalised", seq: 312 },
  ];
  assert.equal(discoverFinalisedSeq(records), 312);
});

test("discoverFinalisedSeq reads PascalCase envelopes too", () => {
  const records = [
    { Action: "kickoff", Seq: 1 },
    { Action: "game_finalised", Seq: 555 },
  ];
  assert.equal(discoverFinalisedSeq(records), 555);
});

test("discoverFinalisedSeq picks the highest seq when the marker repeats", () => {
  const records = [
    { action: "game_finalised", seq: 310 },
    { action: "game_finalised", seq: 315 },
  ];
  assert.equal(discoverFinalisedSeq(records), 315);
});

test("discoverFinalisedSeq ignores finalised records without a numeric seq", () => {
  const records = [
    { action: "game_finalised" },
    { action: "game_finalised", seq: "312" },
    { action: "game_finalised", seq: 299 },
  ];
  assert.equal(discoverFinalisedSeq(records), 299);
});

test("discoverFinalisedSeq throws when the fixture is not finalised", () => {
  assert.throws(() => discoverFinalisedSeq([{ action: "goal", seq: 10 }]), /game_finalised/);
  assert.throws(() => discoverFinalisedSeq([]), /game_finalised/);
});

// ---------------------------------------------------------------------------
// deriveEpochDay
// ---------------------------------------------------------------------------

test("deriveEpochDay floors Unix millis to days since epoch", () => {
  // 2026-07-08T20:32:11Z = 1783542731000 ms -> day 20642
  assert.equal(deriveEpochDay(1783542731000), 20642);
  // Exact UTC midnight belongs to the day it starts.
  assert.equal(deriveEpochDay(20642 * 86_400_000), 20642);
  assert.equal(deriveEpochDay(20642 * 86_400_000 - 1), 20641);
  assert.equal(deriveEpochDay(0), 0);
});

test("deriveEpochDay rejects values outside the u16 PDA seed range", () => {
  assert.throws(() => deriveEpochDay(-1), /u16/);
  assert.throws(() => deriveEpochDay(65_536 * 86_400_000), /u16/);
  assert.throws(() => deriveEpochDay(Number.NaN), /invalid/);
});

// ---------------------------------------------------------------------------
// deriveScoresRootsPda
// ---------------------------------------------------------------------------

test("deriveScoresRootsPda derives the documented PDA (seed 'daily_scores_roots' + u16 LE day)", () => {
  const epochDay = 20642;
  const seed = Buffer.alloc(2);
  seed.writeUInt16LE(epochDay);
  const [expected] = PublicKey.findProgramAddressSync([Buffer.from("daily_scores_roots"), seed], TXORACLE_DEVNET_PROGRAM_ID);
  assert.equal(deriveScoresRootsPda(epochDay).toBase58(), expected.toBase58());
  // Different day -> different account.
  assert.notEqual(deriveScoresRootsPda(epochDay + 1).toBase58(), expected.toBase58());
});

// ---------------------------------------------------------------------------
// Live integration (devnet): proof fetch + on-chain pre-verification
// ---------------------------------------------------------------------------

const NORWAY_ENGLAND_FIXTURE = 18213979;
const skipLive = process.env.SKIP_LIVE === "1";

test(
  "live: settlement proof for fixture 18213979 (Norway 1-2 England) verifies on devnet",
  { skip: skipLive && "SKIP_LIVE=1", timeout: 120_000 },
  async () => {
    const proof = await getSettlementProof({ fixtureId: NORWAY_ENGLAND_FIXTURE });

    assert.deepEqual(proof.statKeys, [...DEFAULT_STAT_KEYS]);
    assert.deepEqual(proof.statValues, [1, 2], "final score should be Norway 1 - 2 England");
    assert.ok(proof.seq > 0, "seq discovered from the game_finalised record");
    assert.ok(proof.epochDay > 20_000 && proof.epochDay <= 0xffff, `epochDay ${proof.epochDay} plausible`);
    assert.equal(proof.rootsPda.toBase58(), deriveScoresRootsPda(proof.epochDay).toBase58());
    assert.equal(proof.payload.stats.length, 2);
    assert.equal(proof.strategy.discretePredicates.length, 2);

    const result = await preVerify(proof);
    console.log(`    proof: fixture ${proof.fixtureId} seq ${proof.seq} epochDay ${proof.epochDay}`);
    console.log(`    roots: ${result.rootsAccount}`);
    console.log(`    ${result.explorerUrl}`);
    console.log(`    detail: ${result.detail}`);
    assert.equal(result.verified, true, result.detail);
  },
);
