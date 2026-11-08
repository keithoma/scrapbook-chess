import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import type { ReplayGame } from '../game';
import jobava from '../../../data/openings/jobava.json';
import queensPawn from '../../../data/openings/queens-pawn-game.json';
import caroKann from '../../../data/openings/caro-kann.json';

interface OpeningDefinition {
  id: string;
  name: string;
  aliases: string[];
  entryLines: string[];
  source: string;
  sourceVersion: string;
  playedBy: 'white' | 'black';
}
export const CARO_KANN_OPENINGS = caroKann.entries;
export const OPENINGS: OpeningDefinition[] = [
  { ...jobava, playedBy: 'white' },
  { ...queensPawn, playedBy: 'white' },
  ...CARO_KANN_OPENINGS.map(entry => ({
    ...entry, source: caroKann.source, sourceVersion: caroKann.sourceVersion, playedBy: 'black' as const,
  })),
];
const key = (fen: string) => fen.split(' ').slice(0, 4).join(' ');
const positions = new Map<string, Set<number>>();
if (new Set(OPENINGS.map(opening => opening.id)).size !== OPENINGS.length)
  throw new Error('Duplicate opening identity.');
for (const [index, definition] of OPENINGS.entries()) {
  for (const line of definition.entryLines) {
    const pos = Chess.default();
    for (const san of line.split(' ')) {
      const move = parseSan(pos, san);
      if (!move) throw new Error(`Illegal opening entry: ${line}`);
      pos.play(move);
    }
    const position = key(makeFen(pos.toSetup()));
    const matches = positions.get(position) ?? new Set<number>();
    matches.add(index);
    positions.set(position, matches);
  }
}

export function recognizeOpenings(game: ReplayGame) {
  if (game.frames[0].fen !== makeFen(Chess.default().toSetup())) return [];
  const matches = new Map<number, number>();
  for (const [ply, frame] of game.frames.entries()) {
    for (const index of positions.get(key(frame.fen)) ?? []) {
      if (!matches.has(index)) matches.set(index, ply);
    }
  }
  return OPENINGS.flatMap((definition, index) => {
    const ply = matches.get(index);
    return ply !== undefined ? [{ ...definition, ply }] : [];
  });
}

export type RecognizedOpening = ReturnType<typeof recognizeOpenings>[number];
