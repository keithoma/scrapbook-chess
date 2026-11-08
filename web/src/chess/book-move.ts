import type { MoveQuality } from './quality';
import { BOOK_VERSION, type BookMoveEvidence } from '../openings/book';

export const BOOK_MOVE_RULE = {
  version: 'book-move-v1',
  // Provisional tuning: observations of this move, not visits to its position.
  minimumGames: 25,
  maximumLossRate: 0.7,
} as const;

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
  const games = evidence?.games;
  const losses = evidence?.losses;
  const validGames = Number.isSafeInteger(games) && games! > 0;
  const validLosses = validGames && Number.isSafeInteger(losses) && losses! >= 0 && losses! <= games!;
  const lossRate = validLosses ? losses! / games! : undefined;
  const base = {
    ruleVersion: BOOK_MOVE_RULE.version, bookVersion: BOOK_VERSION,
    games: validGames ? games : undefined, lossRate,
  };
  if (!evidence || evidence.weight <= 0) return { ...base, status: 'outside', reason: 'absent' };
  if (quality !== 'clean') return { ...base, status: 'outside', reason: 'quality' };
  if (validGames && games! < BOOK_MOVE_RULE.minimumGames)
    return { ...base, status: 'outside', reason: 'rare' };
  if (lossRate !== undefined && lossRate >= BOOK_MOVE_RULE.maximumLossRate)
    return { ...base, status: 'outside', reason: 'high-loss-rate' };
  if (!validGames || !validLosses) return { ...base, status: 'candidate', reason: 'missing-statistics' };
  return { ...base, status: 'book', reason: 'qualified' };
}
