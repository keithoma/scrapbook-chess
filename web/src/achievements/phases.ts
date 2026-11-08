import type { Frame, ReplayGame } from '../game';

// TypeScript port of lichess-org/scalachess Divider.scala, MIT license.
// Copyright (c) 2012-2014 Thibault Duplessis.
// https://github.com/lichess-org/scalachess/blob/736daea6b3fc3dddebbc69f3bd8463dc13cc198a/core/src/main/scala/Divider.scala
// Full permission notice: /licenses/scalachess-MIT.txt.
export interface Division { middle?: number; end?: number; plies: number }
export type Phase = 'opening' | 'middlegame' | 'endgame';
const cached = new WeakMap<Frame[], Division>();
export function mixednessScore(y: number, white: number, black: number): number {
  switch (white) {
    case 0:
      switch (black) {
        case 1: return 1 + y;
        case 2: return y < 6 ? 2 + (6 - y) : 0;
        case 3: case 4: return y < 7 ? 3 + (7 - y) : 0;
        default: return 0;
      }
    case 1:
      switch (black) {
        case 0: return 1 + (8 - y);
        case 1: return 5 + Math.abs(4 - y);
        case 2: return 4 + (7 - y);
        case 3: return 5 + (7 - y);
        default: return 0;
      }
    case 2:
      switch (black) {
        case 0: return y > 2 ? 2 + (y - 2) : 0;
        case 1: return 4 + (y - 1);
        case 2: return 7;
        default: return 0;
      }
    case 3:
      if (black === 0) return y > 1 ? 3 + (y - 1) : 0;
      return black === 1 ? 5 + (y - 1) : 0;
    case 4: return black === 0 && y > 1 ? 3 + (y - 1) : 0;
    default: return 0;
  }
}
export function mixedness(frame: Frame): number {
  let sum = 0;
  for (let y = 0; y <= 6; y++) for (let x = 0; x <= 6; x++) {
    let white = 0; let black = 0;
    for (const piece of frame.pieces) {
      const file = piece.square % 8; const rank = piece.square >> 3;
      if (file >= x && file <= x + 1 && rank >= y && rank <= y + 1) {
        if (piece.color === 'white') white++; else black++;
      }
    }
    sum += mixednessScore(y + 1, white, black);
  }
  return sum;
}
export function divideGame(game: ReplayGame): Division {
  const saved = cached.get(game.frames); if (saved) return saved;
  // Upstream Divider tests pass each played move's BEFORE board, including
  // the initial board and excluding the terminal after-board.
  const boards = game.frames.slice(0, -1);
  const material = (frame: Frame) => frame.pieces.filter(piece => piece.role !== 'king' && piece.role !== 'pawn').length;
  const sparse = (frame: Frame) => frame.pieces.filter(piece => piece.color === 'white' && piece.square < 8).length < 4
    || frame.pieces.filter(piece => piece.color === 'black' && piece.square >= 56).length < 4;
  const mid = boards.findIndex(frame => material(frame) <= 10 || sparse(frame) || mixedness(frame) > 150);
  const end = mid >= 0 ? boards.findIndex(frame => material(frame) <= 6) : -1;
  const value = { middle: mid >= 0 && (end < 0 || mid < end) ? mid : undefined, end: end >= 0 ? end : undefined, plies: boards.length };
  cached.set(game.frames, value); return value;
}
export function phaseAt(game: ReplayGame, boardIndex = game.moves.length - 1): Phase {
  const division = divideGame(game);
  if (division.end !== undefined && boardIndex >= division.end) return 'endgame';
  if (division.middle !== undefined && boardIndex >= division.middle) return 'middlegame';
  return 'opening';
}
