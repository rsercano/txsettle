//! # txsettle_market
//!
//! Parimutuel 1X2 prediction market that settles **trustlessly** against
//! TxODDS' on-chain Merkle roots (txoracle `daily_scores_roots`).
//!
//! There is no admin key and no trusted oracle in the settlement path:
//! `resolve` is permissionless — anyone can submit the TxLINE Merkle stat
//! proof for the market's fixture, the program CPIs into txoracle's
//! `validate_stat_v2` to check the proof against the published daily root,
//! and derives the outcome from the *proved* final goal counts. If the proof
//! does not verify, the market cannot resolve.

pub mod errors;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use instructions::*;

declare_id!("45MwWqTXE9nWN2kyVERpZqRXwr6vDDaMyk9sYudG14qx");

// Full txoracle client (types + CPI) generated from `idls/txoracle.json`.
// That IDL copy carries the DEVNET program id
// (6pW64gN1s2uqjHkn1unFeEjAwJkPGHoppGvS715wyP2J) — the IDL TxODDS ships
// embeds the MAINNET address, which would make Anchor reject the devnet
// deployment in the CPI program check.
declare_program!(txoracle);

#[program]
pub mod txsettle_market {
    use super::*;

    /// Open a 1X2 market on a TxLINE fixture. Anyone can create a market;
    /// the creator holds no special rights afterwards.
    pub fn create_market(ctx: Context<CreateMarket>, fixture_id: i64, close_ts: i64) -> Result<()> {
        instructions::create_market::handle_create_market(ctx, fixture_id, close_ts)
    }

    /// Stake `amount` of the market's mint on `outcome` (0 = P1Win, 1 = Draw, 2 = P2Win).
    /// Repeat placements accumulate; switching outcome is rejected.
    pub fn place(ctx: Context<Place>, outcome: u8, amount: u64) -> Result<()> {
        instructions::place::handle_place(ctx, outcome, amount)
    }

    /// Permissionless settlement: verify a TxLINE Merkle stat proof against the
    /// on-chain daily root via txoracle `validate_stat_v2` and derive the outcome
    /// from the proved full-match goal counts.
    pub fn resolve(ctx: Context<Resolve>, payload: txoracle::types::StatValidationInput, strategy: txoracle::types::NDimensionalStrategy) -> Result<()> {
        instructions::resolve::handle_resolve(ctx, payload, strategy)
    }

    /// Pay out a winning position pro-rata from the vault
    /// (or refund the original stake when nobody picked the winning outcome).
    pub fn claim(ctx: Context<Claim>) -> Result<()> {
        instructions::claim::handle_claim(ctx)
    }
}
