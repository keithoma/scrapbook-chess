import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import type { ReplayGame } from '../game';
import jobava from '../../../data/openings/jobava.json';
import queensPawn from '../../../data/openings/queens-pawn-game.json';

export const OPENINGS = [jobava, queensPawn];
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

export function recognizeOpenings(game: ReplayGame) {
  if (game.frames[0].fen !== makeFen(Chess.default().toSetup())) return [];
  return entries.flatMap(({ definition, positions }) => {
    const ply = game.frames.findIndex(frame => positions.has(key(frame.fen)));
    return ply >= 0 ? [{ ...definition, ply }] : [];
  });
}

export type RecognizedOpening = ReturnType<typeof recognizeOpenings>[number];
