# TxSettle

**Trustless settlement infrastructure for TxLINE prediction markets on Solana.**

TxODDS publishes Merkle roots of every 5-minute batch of World Cup match data on-chain (the txoracle program's `daily_scores_roots` accounts). TxSettle turns that into a settlement primitive: it fetches the Merkle proof for a finished fixture's analyst-verified final stats from TxLINE, shapes it into the exact argument pair of the on-chain `validate_stat_v2` instruction, and verifies it against the published root — so a prediction market can resolve on data that is *provably* what TxODDS published, with no admin key and no trusted oracle deciding winners. If the proof doesn't verify, the market cannot resolve. That's the whole point.

Built for the **TxODDS x Solana World Cup Hackathon 2026 — Prediction Markets & Settlement track**, by the same author as the Consumer-track entry [MatchDay](https://github.com/rsercano/matchday) (a Telegram watch-party bot; distinct project, shared feed knowledge only).

> **Status: early stage.** The SDK (proof fetch + on-chain pre-verification) is working end-to-end against devnet. The parimutuel market program and web UI are in progress.

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
   │ programs/txsettle (WIP)                     │   parimutuel markets:
   │  create_market · place · resolve · claim    │   resolve() is permissionless —
   └──────────────────┬──────────────────────────┘   anyone with the proof settles
                      ▼
   ┌─────────────────────────────────────────────┐
   │ apps/web (WIP)                              │   market UI + "verify this
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

`proof.payload` and `proof.strategy` are byte-for-byte the two arguments `validate_stat_v2` takes — the same pair the TxSettle market program's `resolve` will consume.

## Repository layout

| Path | What |
|------|------|
| `packages/sdk` | `@txsettle/sdk` — TxLINE client, settlement-proof builder, on-chain pre-verification |
| `packages/sdk/idl/txoracle.json` | Public txoracle IDL (note: ships with the mainnet address; the SDK overrides it with the devnet program id) |
| `programs/txsettle` | Parimutuel market program (WIP, day 2) |
| `apps/web` | Verification / market UI (WIP) |

## Compliance notes

- Devnet only; escrow will use a mock-USDC devnet mint — never the TxL token (wagering with it is prohibited by track rules).
- No real-money wagering anywhere in this project.

## License

Apache-2.0 — see [LICENSE](LICENSE).
