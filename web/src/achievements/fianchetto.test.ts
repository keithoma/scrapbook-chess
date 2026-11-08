import { expect, it } from 'vitest';
import { parseGame } from '../game';
import { contributions, prepareGrant } from './collection';

const extract = (pgn: string, color: 'white' | 'black') => contributions(parseGame(pgn), color).filter(event => event.kind === 'badge' && event.badgeId === 'badge_fianchetto_total');
it('credits the original bishops first developing behind advanced flank pawns for either color', () => {
  const pgn = '1. g3 g6 2. Bg2 Bg7 3. b3 b6 4. Bb2 Bb7 1/2-1/2';
  expect(extract(pgn, 'white')).toEqual([{ kind: 'badge', badgeId: 'badge_fianchetto_total', amount: 1, ply: 3 }, { kind: 'badge', badgeId: 'badge_fianchetto_total', amount: 1, ply: 7 }]);
  expect(extract(pgn, 'black').map(event => event.ply)).toEqual([4, 8]);
});
it('does not farm repeated bishop shuffles or redevelopments from a different first move', () => {
  const shuffle = '1. g3 g6 2. Bg2 Bg7 3. Bf1 Bf8 4. Bg2 Bg7 1-0';
  expect(extract(shuffle, 'white')).toHaveLength(1); expect(extract(shuffle, 'black')).toHaveLength(1);
  expect(extract('1. e4 e5 2. Be2 Nf6 3. Bf1 Nc6 4. g3 d6 5. Bg2 1-0', 'white')).toEqual([]);
});
it('requires a flank pawn and an original home bishop, not just arrival on g2', () => {
  expect(extract('[SetUp "1"]\n[FEN "7k/8/8/8/8/8/8/K4B2 w - - 0 1"]\n\n1. Bg2 1/2-1/2', 'white')).toEqual([]);
  expect(extract('[SetUp "1"]\n[FEN "1k6/8/8/8/8/6P1/8/K6B w - - 0 1"]\n\n1. Bg2 1-0', 'white')).toEqual([]);
});
it('recollects fianchetto progress once and excludes non-player moves', () => {
  const game = parseGame('1. g3 e5 2. Bg2 1-0'); const saved = prepareGrant([], game, 'white');
  expect(prepareGrant([saved], game, 'white').events).toEqual(saved.events);
  expect(prepareGrant([saved], game, 'black').events.some(event => event.kind === 'badge' && event.badgeId === 'badge_fianchetto_total')).toBe(false);
});
