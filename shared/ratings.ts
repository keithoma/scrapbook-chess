export interface GameRating { value: number; provisional: boolean }
export interface GameRatings { white?: GameRating; black?: GameRating }

// A missing rating is unknown, never a zero-rated opponent. These are the
// ratings recorded with the game, not a later lookup of either player's profile.
export function gameRating(value: unknown, provisional: unknown = false): GameRating | undefined {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0
      || typeof provisional !== 'boolean') return;
  return { value, provisional };
}

export function pgnRating(value?: string): GameRating | undefined {
  const match = /^(\d+)(\?)?$/.exec(value ?? '');
  return match ? gameRating(Number(match[1]), !!match[2]) : undefined;
}
