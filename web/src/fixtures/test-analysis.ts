import type { ReplayGame } from '../game';
import { ANALYSIS_VERSION, type Checkpoint } from '../storage';
export function analyzed(game: ReplayGame, value = 0): Checkpoint {
  return {
    key: 'fixture',
    version: ANALYSIS_VERSION,
    pgn: game.pgn,
    results: game.moves.map((move) => ({
      ply: move.ply,
      bestMove: move.uci,
      ms: 1,
      best: { type: 'cp', value },
      played: { type: 'cp', value },
    })),
    virtual: [],
    virtualStatus: 'pending',
    updatedAt: '',
  };
}
