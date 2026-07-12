/**
 * Minimal TxLINE devnet REST client.
 *
 * TxLINE authenticates every request with two credentials:
 *  - a short-lived **guest JWT** (`Authorization: Bearer ...`), obtained from
 *    `POST /auth/guest/start` and renewed transparently whenever the API
 *    answers 401/403;
 *  - a long-lived **API token** bound to the on-chain subscription
 *    (`X-Api-Token`), taken from the `TXLINE_API_TOKEN` env var by default.
 *
 * Only the three endpoints the settlement flow needs are exposed here:
 * fixtures snapshot, scores snapshot, and stat-validation (Merkle proofs).
 */

/** Configuration for {@link TxLineClient}. Every field falls back to an env var, then to the devnet default. */
export interface TxLineClientOptions {
  /** REST base, default `TXLINE_API_BASE` or `https://txline-dev.txodds.com/api`. */
  apiBase?: string;
  /** Guest-auth endpoint, default `TXLINE_AUTH_URL` or `https://txline-dev.txodds.com/auth/guest/start`. */
  authUrl?: string;
  /** Long-lived subscription token sent as `X-Api-Token`, default `TXLINE_API_TOKEN`. */
  apiToken?: string;
}

/**
 * One fixture row from `GET /fixtures/snapshot` (PascalCase envelope).
 * Only the fields the SDK relies on are typed; the rest stay accessible via the index signature.
 */
export interface Fixture {
  FixtureId: number;
  CompetitionId: number;
  /** Kickoff, Unix epoch milliseconds. */
  StartTime?: number;
  Participant1?: string;
  Participant2?: string;
  Participant1IsHome?: boolean;
  GameState?: number;
  [key: string]: unknown;
}

/**
 * One scores record from `GET /scores/snapshot/{fixtureId}`.
 * The feed mixes camelCase and PascalCase across (and even within) records,
 * so records are kept opaque; read fields case-tolerantly (see `fieldOf` in proof.ts).
 */
export type ScoresRecord = Record<string, unknown>;

/** Raw Merkle-proof response from `GET /scores/stat-validation`. Field casing varies; read case-tolerantly. */
export type StatValidationResponse = Record<string, unknown>;

/**
 * Thin TxLINE REST client with automatic guest-JWT renewal on 401/403.
 *
 * ```ts
 * const txline = new TxLineClient(); // devnet defaults + TXLINE_API_TOKEN from env
 * const fixtures = await txline.fixturesSnapshot(72);
 * ```
 */
export class TxLineClient {
  private readonly apiBase: string;
  private readonly authUrl: string;
  private readonly apiToken: string;
  private jwt = "";
  private renewing: Promise<string> | null = null;

  constructor(options: TxLineClientOptions = {}) {
    this.apiBase = options.apiBase ?? process.env.TXLINE_API_BASE ?? "https://txline-dev.txodds.com/api";
    this.authUrl = options.authUrl ?? process.env.TXLINE_AUTH_URL ?? "https://txline-dev.txodds.com/auth/guest/start";
    this.apiToken = options.apiToken ?? process.env.TXLINE_API_TOKEN ?? "";
  }

  /**
   * Fixtures starting within 30 days after `startEpochDay` (default: today UTC).
   * @param competitionId optional filter (World Cup 2026 = 72)
   * @param startEpochDay days since Unix epoch, UTC
   */
  async fixturesSnapshot(competitionId?: number, startEpochDay?: number): Promise<Fixture[]> {
    const query = new URLSearchParams();
    if (competitionId !== undefined) query.set("competitionId", String(competitionId));
    if (startEpochDay !== undefined) query.set("startEpochDay", String(startEpochDay));
    const qs = query.toString();
    return this.get<Fixture[]>(`/fixtures/snapshot${qs ? `?${qs}` : ""}`);
  }

  /** Latest scores state per action for one fixture (includes the `game_finalised` record once a match is over). */
  async scoresSnapshot(fixtureId: number): Promise<ScoresRecord[]> {
    return this.get<ScoresRecord[]>(`/scores/snapshot/${fixtureId}`);
  }

  /**
   * Merkle proof for the given stat keys of one scores record.
   * @param seq the record's observed per-fixture sequence number, verbatim — never renumber or substitute
   * @param statKeys on-chain stat keys (`period_prefix + base`, e.g. 1/2 = total goals P1/P2)
   */
  async statValidation(fixtureId: number, seq: number, statKeys: number[]): Promise<StatValidationResponse> {
    return this.get<StatValidationResponse>(`/scores/stat-validation?fixtureId=${fixtureId}&seq=${seq}&statKeys=${statKeys.join(",")}`);
  }

  private async get<T>(path: string): Promise<T> {
    let jwt = await this.getJwt();
    let res = await fetch(`${this.apiBase}${path}`, { headers: this.headers(jwt) });
    if (res.status === 401 || res.status === 403) {
      jwt = await this.renewJwt();
      res = await fetch(`${this.apiBase}${path}`, { headers: this.headers(jwt) });
    }
    if (!res.ok) throw new Error(`TxLINE GET ${path} -> ${res.status}: ${await res.text()}`);
    return res.json() as Promise<T>;
  }

  private headers(jwt: string): Record<string, string> {
    return { Authorization: `Bearer ${jwt}`, "X-Api-Token": this.apiToken };
  }

  private async getJwt(): Promise<string> {
    if (this.jwt) return this.jwt;
    return this.renewJwt();
  }

  private async renewJwt(): Promise<string> {
    if (this.renewing) return this.renewing;
    this.renewing = (async () => {
      const res = await fetch(this.authUrl, { method: "POST" });
      if (!res.ok) throw new Error(`TxLINE guest auth failed: ${res.status} ${await res.text()}`);
      const data = (await res.json()) as { token?: string };
      if (!data.token) throw new Error("TxLINE guest auth returned no token");
      this.jwt = data.token;
      return this.jwt;
    })().finally(() => {
      this.renewing = null; // never cache a rejected promise
    });
    return this.renewing;
  }
}
