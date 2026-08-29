export interface RatingChangeInput {
  readonly kFactor?: number;
  readonly loserRating: number;
  readonly winnerRating: number;
}

export interface RatingChangeResult {
  readonly loserDelta: number;
  readonly loserRating: number;
  readonly winnerDelta: number;
  readonly winnerRating: number;
}

export interface RatingEngine {
  calculateBattleWin(input: RatingChangeInput): RatingChangeResult;
}

export class EloRatingEngine implements RatingEngine {
  calculateBattleWin(input: RatingChangeInput): RatingChangeResult {
    const kFactor = input.kFactor ?? 32;
    const winnerExpected = expectedScore(input.winnerRating, input.loserRating);
    const loserExpected = expectedScore(input.loserRating, input.winnerRating);
    const winnerDelta = Math.round(kFactor * (1 - winnerExpected));
    const loserDelta = Math.round(kFactor * (0 - loserExpected));

    return {
      loserDelta,
      loserRating: input.loserRating + loserDelta,
      winnerDelta,
      winnerRating: input.winnerRating + winnerDelta
    };
  }
}

function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

