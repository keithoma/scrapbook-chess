import { Chess, normalizeMove } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';
import type { ReplayGame } from '../game';
import type { MoveResult } from '../storage';
import { openingBook } from '../openings/book';
import { bookMove, type BookMoveAnnotation } from './book-move';
import { moveQuality, type MoveQuality } from './quality';
import { bestMove, onlyMove, BEST_MOVE_RULE, ONLY_MOVE_RULE } from './move-rules';

export interface MoveAnnotations {
  quality: MoveQuality; book: BookMoveAnnotation;
  best: boolean; only: boolean; bestRuleVersion: string; onlyRuleVersion: string;
}

// Replay both players, including saved plies on resume, to preserve Polyglot's
// pseudo-capturable en passant square and normalize standard UCI castling.
export function createMoveAnnotator(game: ReplayGame): (result: MoveResult) => MoveResult {
  const pos = Chess.fromSetup(parseFen(game.frames[0].fen).unwrap()).unwrap();
  let i = 0;
  return result => {
    if (result.ply !== i + 1) throw new Error('Move annotations require consecutive analyzed plies.');
    const move = normalizeMove(pos, parseUci(game.moves[i].uci)!);
    const quality = moveQuality(game, result);
    const book = bookMove(openingBook.lookup(pos, move), quality);
    const played = game.moves[i];
    const best = bestMove(played.uci, result);
    const only = onlyMove(played.uci, played.color, result);
    pos.play(move);
    i++;
    return { ...result, annotations: {
      quality, book, best, only,
      bestRuleVersion: BEST_MOVE_RULE.version, onlyRuleVersion: ONLY_MOVE_RULE.version,
    } };
  };
}

export function annotateMoves(game: ReplayGame, results: MoveResult[]): MoveResult[] {
  return results.map(createMoveAnnotator(game));
}
