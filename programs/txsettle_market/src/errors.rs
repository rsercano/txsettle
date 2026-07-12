use anchor_lang::prelude::*;

#[error_code]
pub enum MarketError {
    #[msg("close_ts must be in the future")]
    CloseTsInPast,
    #[msg("outcome index must be 0 (P1Win), 1 (Draw) or 2 (P2Win)")]
    InvalidOutcome,
    #[msg("amount must be greater than zero")]
    ZeroAmount,
    #[msg("market is not open")]
    MarketNotOpen,
    #[msg("betting is closed for this market")]
    BettingClosed,
    #[msg("position already staked on a different outcome")]
    OutcomeSwitch,
    #[msg("market is not resolved yet")]
    MarketNotResolved,
    #[msg("position already claimed")]
    AlreadyClaimed,
    #[msg("position did not win this market")]
    NotAWinner,
    #[msg("proof fixture id does not match this market")]
    FixtureMismatch,
    #[msg("proof must carry exactly the full-match goal stats (keys 1 and 2, once each)")]
    WrongStatKeys,
    #[msg("stat leaf is not from a finalised record (period must be 100)")]
    StatNotFinal,
    #[msg("strategy must assert exact equality of every proved stat value")]
    StrategyNotExactEquality,
    #[msg("proof timestamp does not map to a valid epoch day")]
    BadProofTimestamp,
    #[msg("daily_scores_roots account does not match the PDA for the proof's epoch day")]
    WrongRootsAccount,
    #[msg("txoracle rejected the settlement proof")]
    ProofRejected,
    #[msg("arithmetic overflow")]
    Overflow,
}
