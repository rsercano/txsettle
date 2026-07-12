use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, TransferChecked};

use crate::errors::MarketError;
use crate::state::{Market, MarketState, Position};

#[derive(Accounts)]
pub struct Claim<'info> {
    pub owner: Signer<'info>,

    #[account(
        seeds = [Market::SEED, &market.fixture_id.to_le_bytes()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,

    #[account(
        mut,
        seeds = [Position::SEED, market.key().as_ref(), owner.key().as_ref()],
        bump = position.bump
    )]
    pub position: Account<'info, Position>,

    #[account(address = market.mint)]
    pub mint: Account<'info, Mint>,

    #[account(mut, address = market.vault)]
    pub vault: Account<'info, TokenAccount>,

    #[account(
        mut,
        token::mint = market.mint,
        token::authority = owner
    )]
    pub user_token: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

pub fn handle_claim(ctx: Context<Claim>) -> Result<()> {
    let market = &ctx.accounts.market;
    let position = &mut ctx.accounts.position;

    require!(market.state == MarketState::Resolved, MarketError::MarketNotResolved);
    require!(!position.claimed, MarketError::AlreadyClaimed);
    let outcome = market.outcome.ok_or(MarketError::MarketNotResolved)?;

    let winning_pool = market.pools[outcome.index()];
    let payout = if winning_pool == 0 {
        // Nobody staked the winning outcome: every position gets its stake back.
        position.amount
    } else {
        require!(position.outcome as usize == outcome.index(), MarketError::NotAWinner);
        // Winners split the whole pot pro-rata: floor(stake * total / winning_pool).
        let total = market.total_pool()? as u128;
        let gross = (position.amount as u128).checked_mul(total).ok_or(MarketError::Overflow)? / winning_pool as u128;
        u64::try_from(gross).map_err(|_| error!(MarketError::Overflow))?
    };

    position.claimed = true;

    let fixture_id_le = market.fixture_id.to_le_bytes();
    let market_seeds: &[&[u8]] = &[Market::SEED, &fixture_id_le, &[market.bump]];
    token::transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.key(),
            TransferChecked {
                from: ctx.accounts.vault.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
                to: ctx.accounts.user_token.to_account_info(),
                authority: market.to_account_info(),
            },
            &[market_seeds],
        ),
        payout,
        ctx.accounts.mint.decimals,
    )?;

    msg!("claim: position {} paid {}", position.key(), payout);
    Ok(())
}
