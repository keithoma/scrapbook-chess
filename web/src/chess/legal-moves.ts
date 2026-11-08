import type { Chess } from 'chessops/chess';

export function legalMoveCount(position: Chess): number {
  let count = 0;
  for (const [from, destinations] of position.allDests()) for (const to of destinations)
    count += position.board.getRole(from) === 'pawn' && (to < 8 || to >= 56) ? 4 : 1;
  return count;
}
