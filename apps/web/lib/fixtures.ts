/**
 * Fixture metadata (team names, kickoff) via the @txsettle/sdk TxLINE client —
 * fetched browser-side (TxLINE serves permissive CORS; guest JWT + the devnet
 * demo API token). Falls back to "Fixture #id" when TxLINE is unreachable.
 */
import { TxLineClient } from "@txsettle/sdk/txline";

import { TXLINE_API_BASE, TXLINE_API_TOKEN, TXLINE_AUTH_URL, WORLD_CUP_COMPETITION_ID } from "./config";

export interface FixtureInfo {
  fixtureId: number;
  participant1: string;
  participant2: string;
  startTime?: number;
}

let client: TxLineClient | undefined;

export function txlineClient(): TxLineClient {
  if (!client) {
    client = new TxLineClient({ apiBase: TXLINE_API_BASE, authUrl: TXLINE_AUTH_URL, apiToken: TXLINE_API_TOKEN });
  }
  return client;
}

let fixturesPromise: Promise<Map<number, FixtureInfo>> | undefined;

/**
 * World Cup fixtures indexed by id. TxLINE's snapshot window is
 * [startEpochDay, +30 days], so two overlapping snapshots (30 days back and
 * yesterday) cover the whole tournament, past and upcoming.
 */
export function getFixtures(): Promise<Map<number, FixtureInfo>> {
  if (!fixturesPromise) {
    fixturesPromise = loadFixtures().catch((error) => {
      fixturesPromise = undefined; // never cache a failure
      throw error;
    });
  }
  return fixturesPromise;
}

async function loadFixtures(): Promise<Map<number, FixtureInfo>> {
  const today = Math.floor(Date.now() / 86_400_000);
  const snapshots = await Promise.all([
    txlineClient().fixturesSnapshot(WORLD_CUP_COMPETITION_ID, today - 30),
    txlineClient().fixturesSnapshot(WORLD_CUP_COMPETITION_ID, today - 1),
  ]);
  const map = new Map<number, FixtureInfo>();
  for (const fixture of snapshots.flat()) {
    if (typeof fixture.FixtureId !== "number") continue;
    map.set(fixture.FixtureId, {
      fixtureId: fixture.FixtureId,
      participant1: fixture.Participant1 ?? `Fixture #${fixture.FixtureId} P1`,
      participant2: fixture.Participant2 ?? `Fixture #${fixture.FixtureId} P2`,
      startTime: typeof fixture.StartTime === "number" ? fixture.StartTime : undefined,
    });
  }
  return map;
}
