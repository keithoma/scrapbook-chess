import type { ReplayGame } from '../game';
import { parseGame } from '../game';
import { Chess, normalizeMove } from 'chessops/chess';
import { parseFen, makeFen } from 'chessops/fen';
import { parseUci, makeUci } from 'chessops/util';
import type { BookMoveEvidence } from '../openings/book';
import { cleanGainCandidates, validCleanGainEvidence, type BookLookup, type CleanGainEvidence } from './clean-gain';

export const CLEAN_REVIEW_URL = '/__dev/clean-gain-reviews';
export interface CleanGainReview {
  schemaVersion: 1;
  pgn: string;
  capturePly: number;
  expected: 'clean' | 'not-clean';
  note: string;
  analysisVersion: string;
  evidence: CleanGainEvidence;
  book: { fen: string; uci: string; evidence: BookMoveEvidence }[];
}
export async function cleanReviewFilename(review: Pick<CleanGainReview, 'pgn' | 'capturePly'>) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([review.pgn.trim(), review.capturePly])));
  return `${review.capturePly}-${[...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')}.json`;
}
export function snapshotCleanBook(game: ReplayGame, capturePly: number, lookup: BookLookup): CleanGainReview['book'] {
  const snapshots = new Map<string, CleanGainReview['book'][number]>();
  for (const candidate of cleanGainCandidates(game, capturePly)) {
    for (const ply of [candidate.concessionPly, capturePly]) {
      const fen = game.frames[ply - 1].fen;
      const position = Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
      const move = normalizeMove(position, parseUci(game.moves[ply - 1].uci)!);
      const evidence = lookup(position, move);
      if (evidence) snapshots.set(`${fen}:${makeUci(move)}`, { fen, uci: makeUci(move), evidence });
    }
  }
  return [...snapshots.values()];
}
export function reviewedBook(review: Pick<CleanGainReview, 'book'>): BookLookup {
  return (position, move) => review.book.find(entry => entry.fen === makeFen(position.toSetup()) &&
    entry.uci === makeUci(normalizeMove(position, move)))?.evidence;
}

export function parseCleanGainReview(value: unknown): CleanGainReview {
  const review = value as CleanGainReview;
  if (!review || review.schemaVersion !== 1 || typeof review.pgn !== 'string' ||
      !['clean', 'not-clean'].includes(review.expected) || typeof review.note !== 'string' || review.note.length > 2000 ||
      typeof review.analysisVersion !== 'string' || review.analysisVersion.length > 200 ||
      !Array.isArray(review.book) || review.book.length > 25) throw new Error('Invalid clean-material review.');
  const game = parseGame(review.pgn);
  if (!validCleanGainEvidence(game, review.evidence) || review.capturePly !== review.evidence.capturePly)
    throw new Error('Invalid clean-material evidence.');
  for (const entry of review.book) {
    const evidence = entry?.evidence;
    if (!entry || typeof entry.fen !== 'string' || typeof entry.uci !== 'string' || !evidence ||
        !Number.isSafeInteger(evidence.weight) || evidence.weight <= 0 || evidence.weight > 65535)
      throw new Error('Invalid book evidence.');
    const position = Chess.fromSetup(parseFen(entry.fen).unwrap()).unwrap();
    const move = parseUci(entry.uci);
    if (!move || !position.isLegal(move)) throw new Error('Invalid book move.');
    for (const count of [evidence.games, evidence.wins, evidence.losses])
      if (count !== undefined && (!Number.isSafeInteger(count) || count < 0)) throw new Error('Invalid book outcomes.');
    if ((evidence.wins !== undefined || evidence.losses !== undefined) && (!evidence.games ||
        (evidence.wins ?? 0) + (evidence.losses ?? 0) > evidence.games)) throw new Error('Invalid book outcomes.');
  }
  return { schemaVersion: 1, pgn: game.pgn, capturePly: review.capturePly, expected: review.expected,
    note: review.note, analysisVersion: review.analysisVersion, evidence: review.evidence, book: review.book };
}
