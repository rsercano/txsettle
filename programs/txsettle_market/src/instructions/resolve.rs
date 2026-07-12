use anchor_lang::prelude::*;

use crate::errors::MarketError;
use crate::state::{Market, MarketState, Outcome};
use crate::txoracle;
use crate::txoracle::types::{Comparison, NDimensionalStrategy, StatPredicate, StatValidationInput};

/// TxLINE on-chain stat key: full-match goals, participant 1.
pub const STAT_KEY_P1_GOALS: u32 = 1;
/// TxLINE on-chain stat key: full-match goals, participant 2.
pub const STAT_KEY_P2_GOALS: u32 = 2;
/// Stat leaves from the analyst-verified `game_finalised` record carry period 100.
/// Mid-game proofs verify against the daily roots too (they publish every 5 minutes),
/// so this gate is what makes "verified" mean "final".
pub const FINALISED_PERIOD: i32 = 100;
const MILLIS_PER_DAY: i64 = 86_400_000;

#[derive(Accounts)]
pub struct Resolve<'info> {
    #[account(
        mut,
        seeds = [Market::SEED, &market.fixture_id.to_le_bytes()],
        bump = market.bump
    )]
    pub market: Account<'info, Market>,

    /// CHECK: never trusted as passed — the handler re-derives the canonical
    /// `daily_scores_roots` PDA from the proof's own `min_timestamp` under the
    /// txoracle program id and requires this account to match it.
    pub daily_scores_roots: UncheckedAccount<'info>,

    pub txoracle_program: Program<'info, txoracle::program::Txoracle>,
}

pub fn handle_resolve(ctx: Context<Resolve>, payload: StatValidationInput, strategy: NDimensionalStrategy) -> Result<()> {
    let market = &mut ctx.accounts.market;
    require!(market.state == MarketState::Open, MarketError::MarketNotOpen);

    // (a) The proof must be about this market's fixture.
    require!(payload.fixture_summary.fixture_id == market.fixture_id, MarketError::FixtureMismatch);

    // (b) Exactly the two full-match goal stats, each from a finalised record.
    // Without the period gate a mid-game proof (published every 5 minutes
    // in-play) would settle the market on a partial score.
    require!(payload.stats.len() == 2, MarketError::WrongStatKeys);
    let mut p1_goals: Option<i32> = None;
    let mut p2_goals: Option<i32> = None;
    for leaf in &payload.stats {
        require!(leaf.stat.period == FINALISED_PERIOD, MarketError::StatNotFinal);
        match leaf.stat.key {
            STAT_KEY_P1_GOALS => {
                require!(p1_goals.is_none(), MarketError::WrongStatKeys);
                p1_goals = Some(leaf.stat.value);
            }
            STAT_KEY_P2_GOALS => {
                require!(p2_goals.is_none(), MarketError::WrongStatKeys);
                p2_goals = Some(leaf.stat.value);
            }
            _ => return err!(MarketError::WrongStatKeys),
        }
    }
    let p1_goals = p1_goals.ok_or(MarketError::WrongStatKeys)?;
    let p2_goals = p2_goals.ok_or(MarketError::WrongStatKeys)?;

    // The strategy must pin every proved stat to exact equality with the value
    // the payload claims. Otherwise a resolver could pass an empty/looser
    // strategy and validate_stat_v2 might accept a payload whose stat values
    // were never actually checked against the Merkle leaves.
    require!(
        strategy.geometric_targets.is_empty() && strategy.distance_predicate.is_none(),
        MarketError::StrategyNotExactEquality
    );
    require!(strategy.discrete_predicates.len() == payload.stats.len(), MarketError::StrategyNotExactEquality);
    for (index, predicate) in strategy.discrete_predicates.iter().enumerate() {
        match predicate {
            StatPredicate::Single { index: stat_index, predicate } => {
                require!(*stat_index as usize == index, MarketError::StrategyNotExactEquality);
                require!(predicate.threshold == payload.stats[index].stat.value, MarketError::StrategyNotExactEquality);
                require!(matches!(predicate.comparison, Comparison::EqualTo), MarketError::StrategyNotExactEquality);
            }
            StatPredicate::Binary { .. } => return err!(MarketError::StrategyNotExactEquality),
        }
    }

    // (c) Re-derive the daily_scores_roots PDA from the proof's own timestamp —
    // a client-supplied roots account is never trusted.
    let min_timestamp = payload.fixture_summary.update_stats.min_timestamp;
    require!(min_timestamp > 0, MarketError::BadProofTimestamp);
    let epoch_day = min_timestamp / MILLIS_PER_DAY;
    require!(epoch_day <= u16::MAX as i64, MarketError::BadProofTimestamp);
    let day_seed = (epoch_day as u16).to_le_bytes();
    let (expected_roots, _) = Pubkey::find_program_address(&[b"daily_scores_roots", &day_seed], &txoracle::ID);
    require_keys_eq!(ctx.accounts.daily_scores_roots.key(), expected_roots, MarketError::WrongRootsAccount);

    // (d) CPI into txoracle. validate_stat_v2 returns Ok(false) on a bad proof —
    // it does NOT error — so the returned bool must be read from CPI return
    // data. A successful CPI alone proves nothing.
    let verified = txoracle::cpi::validate_stat_v2(
        CpiContext::new(
            ctx.accounts.txoracle_program.key(),
            txoracle::cpi::accounts::ValidateStatV2 {
                daily_scores_merkle_roots: ctx.accounts.daily_scores_roots.to_account_info(),
            },
        ),
        payload,
        strategy,
    )?
    .get();
    require!(verified, MarketError::ProofRejected);

    // (e) Outcome comes from the *proved* stat values only.
    let outcome = if p1_goals > p2_goals {
        Outcome::P1Win
    } else if p2_goals > p1_goals {
        Outcome::P2Win
    } else {
        Outcome::Draw
    };
    market.outcome = Some(outcome);
    market.state = MarketState::Resolved;

    msg!("market {} resolved: P1 {} - {} P2 -> {:?}", market.fixture_id, p1_goals, p2_goals, outcome);
    Ok(())
}
