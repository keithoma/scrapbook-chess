import type { MoveQuality } from './quality';
import { BOOK_VERSION, type BookMoveEvidence } from '../openings/book';

import { BOOK_MOVE_RULE, bookStatistics } from './book-policy';
export { BOOK_MOVE_RULE } from './book-policy';

export interface BookMoveAnnotation {
  status: 'book' | 'candidate' | 'outside';
  reason: 'qualified' | 'absent' | 'rare' | 'high-loss-rate' | 'quality' | 'missing-statistics';
  ruleVersion: string;
  bookVersion: string;
  games?: number;
  lossRate?: number;
}

// Losses are counted for the mover; draws stay in the denominator. Missing
// statistics never prove qualification. Inaccuracies pass the shared gate.
export function bookMove(evidence: BookMoveEvidence | undefined, quality: MoveQuality): BookMoveAnnotation {
  const { games, lossRate } = bookStatistics(evidence);
  const validGames = games !== undefined;
  const base = {
    ruleVersion: BOOK_MOVE_RULE.version, bookVersion: BOOK_VERSION,
    games, lossRate,
  };
  if (!evidence || evidence.weight <= 0) return { ...base, status: 'outside', reason: 'absent' };
  if (quality !== 'clean') return { ...base, status: 'outside', reason: 'quality' };
  if (validGames && games! < BOOK_MOVE_RULE.minimumGames)
    return { ...base, status: 'outside', reason: 'rare' };
  if (lossRate !== undefined && lossRate >= BOOK_MOVE_RULE.maximumLossRate)
    return { ...base, status: 'outside', reason: 'high-loss-rate' };
  if (!validGames || lossRate === undefined) return { ...base, status: 'candidate', reason: 'missing-statistics' };
  return { ...base, status: 'book', reason: 'qualified' };
}
