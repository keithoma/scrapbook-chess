import type { Frame, ReplayGame } from '../game';

export function isPawnVsPawn(frame: Frame): boolean {
  return frame.pieces.every(piece => piece.role === 'king' || piece.role === 'pawn') &&
    frame.pieces.some(piece => piece.role === 'pawn' && piece.color === 'white') &&
    frame.pieces.some(piece => piece.role === 'pawn' && piece.color === 'black');
}

// Board index, before the first move being assessed. An initial FEN can qualify.
// Later promotions or a temporary return to pawn-only material never restart it.
export function pawnVsPawnStart(game: ReplayGame): number | undefined {
  const index = game.frames.findIndex(isPawnVsPawn);
  return index < 0 ? undefined : index;
}
