import type { Position } from 'chessops/chess';
import type { Color, Move, Role, Square } from 'chessops/types';
import { MATERIAL_VALUES } from '../chess/material-values';
export function* legalMoves(pos: Position): Generator<Move> {
  for (const [from, destinations] of pos.allDests())
    for (const to of destinations) {
      if (pos.board.getRole(from) === 'pawn' && (to < 8 || to >= 56)) {
        for (const promotion of ['queen', 'rook', 'bishop', 'knight'] as const)
          yield { from, to, promotion };
      } else yield { from, to };
    }
}
export function balance(pos: Position, color: Color) {
  let value = 0;
  for (const [, piece] of pos.board) value += MATERIAL_VALUES[piece.role] * (piece.color === color ? 1 : -1);
  return value;
}
// Legal static exchanges on one square. Either player may decline the next
// exchange. This is bounded material evidence, not a full tactical search.
function exchange(pos: Position, square: Square, budget: { nodes: number }, depth = 0): number {
  if (--budget.nodes < 0 || depth > 12) throw new RangeError('Material search budget');
  let best = 0;
  for (const move of legalMoves(pos)) {
    if (move.to !== square || !pos.board.has(square)) continue;
    const next = pos.clone();
    const before = balance(pos, pos.turn);
    next.play(move);
    best = Math.max(
      best,
      balance(next, pos.turn) - before - exchange(next, square, budget, depth + 1),
    );
  }
  return best;
}
export function captureGain(
  pos: Position,
  from: Square,
  to: Square,
  budget: { nodes: number },
  promotion?: Role,
): number {
  const move = { from, to, promotion };
  if (!pos.isLegal(move)) return 0;
  const next = pos.clone();
  next.play(move);
  return balance(next, pos.turn) - balance(pos, pos.turn) - exchange(next, to, budget);
}
