use anchor_lang::prelude::*;

use crate::errors::MarketError;

/// Lifecycle of a market. Funds can only enter while `Open` and only leave via
/// `claim` once `Resolved` — there is no authority that can move them otherwise.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum MarketState {
    Open,
    Resolved,
}

/// 1X2 outcome, index-aligned with `Market::pools`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum Outcome {
    P1Win,
    Draw,
    P2Win,
}

impl Outcome {
    pub const COUNT: usize = 3;

    pub fn index(self) -> usize {
        self as usize
    }
}

/// One parimutuel 1X2 market per TxLINE fixture.
/// PDA: `["market", fixture_id (i64 LE)]`.
#[account]
#[derive(InitSpace)]
pub struct Market {
    /// TxLINE fixture id this market settles on (matches the proof's `fixture_summary.fixture_id`).
    pub fixture_id: i64,
    /// SPL mint stakes are denominated in (devnet mock-USDC — never the TxL token).
    pub mint: Pubkey,
    /// Escrow token account; authority is this market PDA itself.
    pub vault: Pubkey,
    /// Unix seconds; `place` is rejected from this moment on.
    pub close_ts: i64,
    pub state: MarketState,
    /// Set exactly once by a successful `resolve`.
    pub outcome: Option<Outcome>,
    /// Total staked per outcome, index-aligned with `Outcome`.
    pub pools: [u64; Outcome::COUNT],
    pub bump: u8,
}

impl Market {
    pub const SEED: &'static [u8] = b"market";
    pub const VAULT_SEED: &'static [u8] = b"vault";

    pub fn total_pool(&self) -> Result<u64> {
        self.pools
            .iter()
            .try_fold(0u64, |acc, pool| acc.checked_add(*pool))
            .ok_or_else(|| error!(MarketError::Overflow))
    }
}

/// One bettor's stake in one market (a bettor keeps a single outcome per market).
/// PDA: `["pos", market, owner]`.
#[account]
#[derive(InitSpace)]
pub struct Position {
    /// Market this position belongs to (redundant with the PDA seeds; kept for off-chain indexing).
    pub market: Pubkey,
    /// Bettor (redundant with the PDA seeds; kept for off-chain indexing).
    pub owner: Pubkey,
    /// `Outcome` index staked on.
    pub outcome: u8,
    /// Cumulative stake.
    pub amount: u64,
    pub claimed: bool,
    pub bump: u8,
}

impl Position {
    pub const SEED: &'static [u8] = b"pos";
}
