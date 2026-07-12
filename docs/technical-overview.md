# TxSettle — Technical Overview

*Submission doc for the TxODDS × Solana World Cup Hackathon — Prediction Markets & Settlement track.*

## Core idea

Prediction markets die on one question: **who decides the result?** TxSettle's answer: nobody. Markets escrow funds in a program-owned vault, and the resolve instruction is *permissionless* — anyone can trigger it, but it only succeeds by presenting TxLINE's Merkle stat proof, which the program verifies **by CPI into TxODDS's own on-chain verifier (`validate_stat_v2`)**. No oracle multisig, no admin key, no dispute committee. If the proof doesn't verify against the `daily_scores_roots` account, the market cannot settle. Period.

## What's deployed

| Piece | Where |
|---|---|
| Market program (Anchor) | devnet [`45MwWqTXE9nWN2kyVERpZqRXwr6vDDaMyk9sYudG14qx`](https://explorer.solana.com/address/45MwWqTXE9nWN2kyVERpZqRXwr6vDDaMyk9sYudG14qx?cluster=devnet) |
| Settlement SDK | `packages/sdk` (`@txsettle/sdk`) — proof fetch, seq discovery, off-chain pre-verify |
| Web app | https://txsettle.vercel.app — markets, betting, one-click resolve, proof visualizer |
| Settled real matches | Norway 1–2 England ([resolve tx](https://explorer.solana.com/tx/58P2pfMHKHHZRATCB831RxBLCU5xNytSxrNm4uABjwtF3bskcLBU2PPPj9kTHcvbRZcCPFVhF3aT52SKVEwwD1Se?cluster=devnet)) and Spain 2–1 Belgium — created, bet, resolved, claimed on devnet |

## Settlement security model (the "custom verification gate")

The resolve instruction enforces, in-program:
1. `payload.fixture_summary.fixture_id == market.fixture_id` — no cross-fixture proofs
2. Stat leaves are exactly total-goals keys {1,2} with **`period == 100`** (match finalised) — mid-game proofs are equally *provable*, so finality must be an explicit gate
3. The `daily_scores_roots` PDA is **re-derived in-program** from the proof's own `minTimestamp` — a client cannot substitute a friendly account
4. CPI `validate_stat_v2` and **require the returned bool** — CPI success alone is not proof validity
5. The equality strategy is validated against the payload's stats — a loose strategy cannot sneak unproven values through
6. Outcome (1X2) is derived from the *verified* stat values; parimutuel payout math in u128 checked arithmetic; empty-winning-pool → full refund mode

Tamper test on devnet: a forged 2–1 payload for the Norway–England match was rejected by the verifier ([tx](https://explorer.solana.com/tx/58P2pfMHKHHZRATCB831RxBLCU5xNytSxrNm4uABjwtF3bskcLBU2PPPj9kTHcvbRZcCPFVhF3aT52SKVEwwD1Se?cluster=devnet) context in repo tests); the genuine 1–2 proof resolved it.

## Test surface

13 program tests run against **the real txoracle verifier and real roots accounts cloned from devnet into localnet**, with live proofs fetched from TxLINE — including tamper rejection, wrong-epoch-roots rejection, wrong-fixture rejection, pro-rata payout exactness, double-claim rejection, and refund mode (verified with a second real fixture). SDK: 9 tests including a live end-to-end verification.

Compliance: escrow is a mock-USDC devnet mint — the TxL token is never wagered; devnet-only demo, no real-money gambling.

## TxLINE API feedback (settlement-builder's perspective)

**Liked:** the stat-validation design is genuinely well-suited to on-chain settlement — proofs are compact (571 bytes for a 2-stat final-score proof, 212K CU to verify), `validate_stat_v2` takes no signers so CPI gating is trivial, and publishing roots every 5 minutes makes mid-game products possible. `llms.txt` on the docs site and the runnable devnet examples materially accelerated us.

**Friction:** (1) tampered proofs abort with `InvalidStatProof` instead of the documented `Ok(false)` — harmless for us (we gate both paths) but worth documenting; (2) the `daily_scores_roots` account layout isn't in the IDL, forcing PDA-existence checks rather than typed reads; (3) the published IDL hardcodes the mainnet program address — devnet integrators must override it or CPI/codegen targets the wrong program; (4) `BorshInstructionCoder` can't encode `validate_stat_v2` standalone (indeterminate-span enum) — only the `program.methods` path works; (5) an explicit doc note that `period == 100` marks finalised stats would save every settlement builder a live-data discovery.
