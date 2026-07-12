# TxSettle

**Trustless settlement infrastructure for TxLINE prediction markets on Solana.**

TxODDS publishes Merkle roots of every 5-minute batch of World Cup match data on-chain (the txoracle program's `daily_scores_roots` accounts). TxSettle turns that into a settlement primitive: it fetches the Merkle proof for a finished fixture's analyst-verified final stats from TxLINE, shapes it into the exact argument pair of the on-chain `validate_stat_v2` instruction, and verifies it against the published root — so a prediction market can resolve on data that is *provably* what TxODDS published, with no admin key and no trusted oracle deciding winners. If the proof doesn't verify, the market cannot resolve. That's the whole point.

Built for the **TxODDS x Solana World Cup Hackathon 2026 — Prediction Markets & Settlement track**, by the same author as the Consumer-track entry [MatchDay](https://github.com/rsercano/matchday) (a Telegram watch-party bot; distinct project, shared feed knowledge only).

> **Status:** SDK, the parimutuel market program and the web UI are live end-to-end on devnet — a real World Cup quarterfinal (Norway 1-2 England) has been settled permissionlessly against TxODDS' published Merkle root, and the UI's "Verify this settlement" panel replays the full proof chain against the on-chain root in the browser.
>
> **Market program (devnet):** [`45MwWqTXE9nWN2kyVERpZqRXwr6vDDaMyk9sYudG14qx`](https://explorer.solana.com/address/45MwWqTXE9nWN2kyVERpZqRXwr6vDDaMyk9sYudG14qx?cluster=devnet)

## Architecture

```
              TxLINE devnet API                      Solana devnet
        ┌────────────────────────────┐      ┌───────────────────────────────┐
        │ /scores/snapshot           │      │ txoracle program              │
        │ /scores/stat-validation ───┼──┐   │   daily_scores_roots (PDA/day)│
        └────────────────────────────┘  │   │   validate_stat_v2 ──► bool   │
                                        ▼   └────────────▲──────────────────┘
   ┌─────────────────────────────────────────────┐       │ view() / CPI
   │ @txsettle/sdk                               │───────┘
   │  getSettlementProof() ► preVerify()         │
   └──────────────────┬──────────────────────────┘
                      ▼
   ┌─────────────────────────────────────────────┐
   │ programs/txsettle_market                    │   parimutuel 1X2 markets:
   │  create_market · place · resolve · claim    │   resolve() is permissionless —
   └──────────────────┬──────────────────────────┘   anyone with the proof settles
                      ▼
   ┌─────────────────────────────────────────────┐
   │ apps/web (Next.js)                          │   market UI + "verify this
   │                                             │   settlement" proof explorer
   └─────────────────────────────────────────────┘
```

The proof path the chain checks: `stat leaf → eventStatRoot → fixture sub-tree → main tree → 32-byte root stored on-chain for that UTC day`.

## Quickstart (SDK)

Requirements: Node 20, a TxLINE devnet API token, and a funded devnet keypair (fee payer for free read-only simulations — nothing is spent).

```bash
npm install
cp .env.example .env   # fill in TXLINE_API_TOKEN and DEV_WALLET_PATH
npm test               # unit + live devnet verification (SKIP_LIVE=1 to stay offline)
```

```ts
import { getSettlementProof, preVerify } from "@txsettle/sdk";

// Norway 1 - 2 England (finished devnet fixture). seq is auto-discovered
// from the fixture's game_finalised record; statKeys default to [1, 2]
// (full-match goals P1/P2).
const proof = await getSettlementProof({ fixtureId: 18213979 });

console.log(proof.statValues); // [1, 2]
console.log(proof.epochDay);   // derived from the proof's own timestamp
console.log(proof.rootsPda.toBase58());

// Dry-run the exact on-chain check as a read-only simulation.
const { verified, detail, explorerUrl } = await preVerify(proof);
console.log(verified, detail, explorerUrl);
```

`proof.payload` and `proof.strategy` are byte-for-byte the two arguments `validate_stat_v2` takes — the same pair the TxSettle market program's `resolve` consumes.

## Market program

`programs/txsettle_market` (Anchor) — parimutuel 1X2 markets with no authority anywhere in the flow:

- `create_market(fixture_id, close_ts)` — one market per fixture (PDA `["market", fixture_id]`), escrow vault owned by the market PDA itself.
- `place(outcome, amount)` — stake mock-USDC on P1Win/Draw/P2Win before `close_ts`; repeat stakes accumulate, switching sides is rejected.
- `resolve(payload, strategy)` — **permissionless**. In-program gates before the verifier is even consulted: the proof must be about this fixture; it must carry exactly the full-match goal stats (keys 1 & 2) from the analyst-verified `game_finalised` record (`period == 100` — mid-game proofs verify too, this is what makes "verified" mean "final"); the `daily_scores_roots` account is re-derived from the proof's own timestamp (a client-supplied account is never trusted); and the strategy must pin every proved value with exact-equality predicates. Then the program CPIs into txoracle's `validate_stat_v2` and reads the returned bool from CPI return data — a successful CPI alone is not verification. Outcome is derived from the proved goal counts only.
- `claim()` — winners split the whole pot pro-rata (`floor(stake × total / winning_pool)`); if nobody picked the winner, every position reclaims its stake.

```bash
npm run test:program   # localnet suite (13 tests) against the REAL txoracle program +
                       # daily roots cloned from devnet — needs TXLINE_API_TOKEN in .env
npm run e2e:devnet     # full live cycle on devnet, prints every tx + explorer link
```

## Web UI

`apps/web` — Next.js 15 app on Solana devnet: markets list (decoded straight off `getProgramAccounts`), wallet-adapter betting (Phantom/Solflare), a mock-USDC faucet, the permissionless **resolve** flow (proof fetched browser-side via `@txsettle/sdk`, pre-verified as a free simulation, then submitted), and the **"Verify this settlement"** panel that walks the Merkle chain of custody — stat leaves → eventStatRoot → fixture sub-tree → main tree → the on-chain `daily_scores_roots` account — with the real hashes and a live on-chain re-verification.

```bash
cp apps/web/.env.example apps/web/.env.local   # set NEXT_PUBLIC_TXLINE_API_TOKEN (+ DEV_WALLET_PATH for the faucet)
npm install && npm run build                    # builds the SDK, then the web app
npm run dev -w @txsettle/web                    # http://localhost:3000
```

## Repository layout

| Path | What |
|------|------|
| `packages/sdk` | `@txsettle/sdk` — TxLINE client, settlement-proof builder, on-chain pre-verification |
| `packages/sdk/idl/txoracle.json` | Public txoracle IDL (note: ships with the mainnet address; the SDK overrides it with the devnet program id) |
| `programs/txsettle_market` | Parimutuel 1X2 market program (Anchor), settles via `validate_stat_v2` CPI |
| `idls/txoracle.json` | txoracle IDL copy consumed by `declare_program!` (address patched to the devnet id) |
| `tests/` | Localnet integration suite (real txoracle + daily roots cloned from devnet) |
| `scripts/e2e-devnet.ts` | Live devnet run of the full market cycle on a real finished fixture |
| `apps/web` | Next.js market + verification UI: wallet-adapter betting, permissionless in-browser resolve, "Verify this settlement" proof explorer, mock-USDC faucet (`POST /api/faucet`) |

## Compliance notes

- Devnet only; escrow will use a mock-USDC devnet mint — never the TxL token (wagering with it is prohibited by track rules).
- No real-money wagering anywhere in this project.

## License

Apache-2.0 — see [LICENSE](LICENSE).
