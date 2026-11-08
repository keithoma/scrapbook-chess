import { knightAttacks } from 'chessops/attacks';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { opposite, parseUci } from 'chessops/util';
import type { Color, Role, Square } from 'chessops/types';
import type { ReplayGame } from '../game';

export interface ForkTarget {
  square: Square;
  role: Role;
}
export interface KnightForkCandidate {
  ply: number;
  san: string;
  color: Color;
  square: Square;
  targets: ForkTarget[];
  beforeFen: string;
  pinned: boolean;
  capturable: boolean;
}

// Deliberately broad inspection candidates, not achievement qualification rules.
// Include low-value targets and pinned knights so false positives can be reviewed.
export function knightForkCandidates(game: ReplayGame): KnightForkCandidate[] {
  return game.moves.flatMap(move => {
    const uci = parseUci(move.uci);
    if (!uci || !('from' in uci)) return [];
    const pos = Chess.fromSetup(parseFen(game.frames[move.ply].fen).unwrap()).unwrap();
    const knight = pos.board.get(uci.to);
    if (knight?.role !== 'knight' || knight.color !== move.color) return [];
    const targets = [...knightAttacks(uci.to).intersect(pos.board[opposite(move.color)])]
      .map(square => ({ square, role: pos.board.getRole(square)! }));
    if (targets.length < 2) return [];

    // Inspect absolute pins from the knight's side without playing a null move
    // or altering the actual position. Opponent captures use the real turn.
    const ownView = pos.clone();
    ownView.turn = move.color;
    const pinned = ownView.ctx().blockers.has(uci.to);
    const capturable = [...pos.board[pos.turn]].some(square => pos.dests(square).has(uci.to));
    return [{ ply: move.ply, san: move.san, color: move.color, square: uci.to, targets,
      beforeFen: game.frames[move.ply - 1].fen, pinned, capturable }];
  });
}

export { tacticEngineEvidence as forkEngineEvidence } from './engine-evidence';
