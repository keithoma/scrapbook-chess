import type { Color } from 'chessops/types';
import type { ReplayGame } from '../game';
import type { Badge } from './catalog';
import type { Contribution } from './collection';

export function clockContributions(game: ReplayGame, color: Color, winner: Color | undefined, badges: Badge[]): Contribution[] {
  if (winner !== color || game.moves.some(move => move.clock === undefined || !Number.isFinite(move.clock) || move.clock < 0)) return [];
  const clocks: Partial<Record<Color, number>> = {};
  const samples: { white: number; black: number }[] = [];
  for (const move of game.moves) {
    clocks[move.color] = move.clock;
    if (clocks.white !== undefined && clocks.black !== undefined) samples.push({ white: clocks.white, black: clocks.black });
  }
  if (!samples.length) return [];
  const other = color === 'white' ? 'black' : 'white';
  return badges.filter(badge => badge.config.metric_key === 'is_time_advantage_win' && samples.every(sample => sample[color] > sample[other])
    || badge.config.metric_key === 'is_time_scramble_win' && samples.some(sample => sample.white <= (badge.config.max_seconds ?? 30) && sample.black <= (badge.config.max_seconds ?? 30)))
    .map(badge => ({ kind: 'badge', badgeId: badge.id, amount: 1, ply: game.moves.length }));
}
