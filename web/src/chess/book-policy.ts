import type { BookMoveEvidence } from '../openings/book';

export const BOOK_MOVE_RULE = {
  version: 'book-move-v1', minimumGames: 25, maximumLossRate: 0.7,
} as const;

export function bookStatistics(evidence?: BookMoveEvidence) {
  const games = evidence?.games;
  const validGames = Number.isSafeInteger(games) && games! > 0;
  const validCount = (count: number | undefined) => validGames && Number.isSafeInteger(count) && count! >= 0 && count! <= games!;
  const consistent = evidence?.wins === undefined || evidence.losses === undefined ||
    (validCount(evidence.wins) && validCount(evidence.losses) && evidence.wins + evidence.losses <= games!);
  return {
    games: validGames ? games : undefined,
    lossRate: consistent && validCount(evidence?.losses) ? evidence!.losses! / games! : undefined,
    winRate: consistent && validCount(evidence?.wins) ? evidence!.wins! / games! : undefined,
  };
}
