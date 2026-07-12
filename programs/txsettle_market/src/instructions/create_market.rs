use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::errors::MarketError;
use crate::state::{Market, MarketState, Outcome};

#[derive(Accounts)]
#[instruction(fixture_id: i64)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init,
        payer = payer,
        space = 8 + Market::INIT_SPACE,
        seeds = [Market::SEED, &fixture_id.to_le_bytes()],
        bump
    )]
    pub market: Account<'info, Market>,

    /// Stake denomination (devnet mock-USDC).
    pub mint: Account<'info, Mint>,

    /// Escrow for all stakes. Authority is the market PDA — only `claim` can move funds out.
    #[account(
        init,
        payer = payer,
        seeds = [Market::VAULT_SEED, market.key().as_ref()],
        bump,
        token::mint = mint,
        token::authority = market
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_create_market(ctx: Context<CreateMarket>, fixture_id: i64, close_ts: i64) -> Result<()> {
    require!(close_ts > Clock::get()?.unix_timestamp, MarketError::CloseTsInPast);

    let market = &mut ctx.accounts.market;
    market.fixture_id = fixture_id;
    market.mint = ctx.accounts.mint.key();
    market.vault = ctx.accounts.vault.key();
    market.close_ts = close_ts;
    market.state = MarketState::Open;
    market.outcome = None;
    market.pools = [0; Outcome::COUNT];
    market.bump = ctx.bumps.market;
    Ok(())
}
