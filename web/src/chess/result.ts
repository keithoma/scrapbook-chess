import type { Color } from 'chessops/types';
import type { ReplayGame } from '../game';

export function isCompletedGame(game: ReplayGame): boolean {
  return ['1-0', '0-1', '1/2-1/2'].includes(game.result) || game.frames.at(-1)!.checkmate;
}

export function gameWinner(game: ReplayGame): Color | undefined {
  return game.frames.at(-1)!.checkmate ? game.moves.at(-1)!.color
    : game.result === '1-0' ? 'white' : game.result === '0-1' ? 'black' : undefined;
}
