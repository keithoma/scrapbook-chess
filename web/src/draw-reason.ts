import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import type { ReplayGame } from './game';
import type { DrawReason } from '../../shared/draw';

export function pgnDrawReason(text: string): DrawReason | undefined {
  if (/stalemate/i.test(text)) return 'stalemate';
  if (/insufficient material|insufficient mating material|dead position/i.test(text))
    return 'insufficient';
  if (/three[ -]?fold|five[ -]?fold|repetition/i.test(text)) return 'repetition';
  if (/50[ -]?move|fifty[ -]?move|75[ -]?move|seventy[ -]?five[ -]?move/i.test(text))
    return 'fifty-move';
  if (/draw(?:n)? by (?:mutual )?agreement|draw agreed|agreed (?:to a )?draw/i.test(text))
    return 'agreement';
}
// Only infer from the terminal board of an ACTUAL draw. Claimable rights in
// an unfinished game never establish a completed result or an agreement.
export function boardDrawReason(game: ReplayGame): DrawReason | undefined {
  if (game.result !== '1/2-1/2' || game.frames.at(-1)!.checkmate) return;
  const final = game.frames.at(-1)!;
  const pos = Chess.fromSetup(parseFen(final.fen).unwrap()).unwrap();
  if (pos.isStalemate()) return 'stalemate';
  if (pos.isInsufficientMaterial()) return 'insufficient';
  if (pos.halfmoves >= 100) return 'fifty-move';
  // Frame FENs come from chessops.toSetup(), which normalizes en-passant to
  // legal captures. Piece placement, turn, castling and legal EP define a key.
  const key = (fen: string) => fen.split(' ').slice(0, 4).join(' ');
  if (game.frames.filter((frame) => key(frame.fen) === key(final.fen)).length >= 3)
    return 'repetition';
}
export function drawReason(game: ReplayGame): DrawReason | undefined {
  if (game.result !== '1/2-1/2' || game.frames.at(-1)!.checkmate) return;
  return game.drawReason ?? boardDrawReason(game);
}
