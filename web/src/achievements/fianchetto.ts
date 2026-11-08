import { parseUci } from 'chessops/util';
import type { Color } from 'chessops/types';
import type { ReplayGame } from '../game';
import type { Badge } from './catalog';
import type { Contribution } from './collection';

export function fianchettoContributions(game: ReplayGame, color: Color, badge?: Badge): Contribution[] {
  if (!badge) return [];
  const homes: [number, number][] = color === 'white' ? [[2, 9], [5, 14]] : [[58, 49], [61, 54]];
  const original = new Map(homes.filter(([home]) => game.frames[0].pieces.some(piece => piece.square === home && piece.role === 'bishop' && piece.color === color)));
  const events: Contribution[] = [];
  for (const played of game.moves) {
    const move = parseUci(played.uci); if (!move || !('from' in move)) continue;
    if (played.color !== color) { original.delete(move.to); continue; }
    const target = original.get(move.from);
    if (target === undefined) continue;
    original.delete(move.from); // Only the original bishop's first development.
    const pawn = game.frames[played.ply - 1].pieces.some(piece => piece.color === color && piece.role === 'pawn'
      && piece.square % 8 === target % 8 && (color === 'white' ? piece.square >> 3 >= 2 : piece.square >> 3 <= 5));
    if (move.to === target && pawn) events.push({ kind: 'badge', badgeId: badge.id, amount: 1, ply: played.ply });
  }
  return events;
}
