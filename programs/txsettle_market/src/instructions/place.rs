use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::errors::MarketError;
use crate::state::{Market, MarketState, Outcome, Position};

#[derive(Accounts)]
pub struct Place<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,

    #[account(
        mut,
        seeds = [Market::SEED, &market.fixture_id.to_le_bytes()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,

    #[account(
        init_if_needed,
        payer = owner,
        space = 8 + Position::INIT_SPACE,
        seeds = [Position::SEED, market.key().as_ref(), owner.key().as_ref()],
        bump
    )]
    pub position: Account<'info, Position>,

    #[account(address = market.mint)]
    pub mint: Account<'info, Mint>,

    #[account(
        mut,
        token::mint = market.mint,
        token::authority = owner
    )]
    pub user_token: Account<'info, TokenAccount>,

    #[account(mut, address = market.vault)]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

pub fn handle_place(ctx: Context<Place>, outcome: u8, amount: u64) -> Result<()> {
    require!((outcome as usize) < Outcome::COUNT, MarketError::InvalidOutcome);
    require!(amount > 0, MarketError::ZeroAmount);

    let market_key = ctx.accounts.market.key();
    let market = &mut ctx.accounts.market;
    require!(market.state == MarketState::Open, MarketError::MarketNotOpen);
    require!(Clock::get()?.unix_timestamp < market.close_ts, MarketError::BettingClosed);

    let position = &mut ctx.accounts.position;
    if position.market == Pubkey::default() {
        // Freshly initialised by init_if_needed.
        position.market = market_key;
        position.owner = ctx.accounts.owner.key();
        position.outcome = outcome;
        position.amount = 0;
        position.claimed = false;
        position.bump = ctx.bumps.position;
    } else {
        // Accumulate only — a position never switches sides.
        require!(position.outcome == outcome, MarketError::OutcomeSwitch);
    }

    token::transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.user_token.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.owner.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.mint.decimals,
    )?;

    position.amount = position.amount.checked_add(amount).ok_or(MarketError::Overflow)?;
    let pool = &mut market.pools[outcome as usize];
    *pool = pool.checked_add(amount).ok_or(MarketError::Overflow)?;
    Ok(())
}
