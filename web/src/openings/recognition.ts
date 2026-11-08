import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import type { ReplayGame } from '../game';
import jobava from '../../../data/openings/jobava.json';

export const OPENINGS = [jobava];
const key = (fen: string) => fen.split(' ').slice(0, 4).join(' ');
const entries = OPENINGS.map(definition => ({
  definition,
  positions: new Set(definition.entryLines.map(line => {
    const pos = Chess.default();
    for (const san of line.split(' ')) {
      const move = parseSan(pos, san);
      if (!move) throw new Error(`Illegal opening entry: ${line}`);
      pos.play(move);
    }
    return key(makeFen(pos.toSetup()));
  })),
}));

export function recognizeOpening(game: ReplayGame) {
  if (game.frames[0].fen !== makeFen(Chess.default().toSetup())) return;
  for (const { definition, positions } of entries) {
    const ply = game.frames.findIndex(frame => positions.has(key(frame.fen)));
    if (ply >= 0) return { ...definition, ply };
  }
}
