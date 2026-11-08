import { expect, it } from 'vitest';
import { parseGame } from '../game';
import { isPawnVsPawn, pawnVsPawnStart } from './endgames';

it('requires pawns on both sides and allows only kings and pawns', () => {
  for (const [fen, expected] of [
    ['7k/6p1/8/8/8/8/1P6/K7 w - - 0 1', true],
    ['7k/8/8/8/8/8/1P6/K7 w - - 0 1', false],
    ['7k/6p1/8/8/8/8/8/K7 w - - 0 1', false],
    ['7k/8/8/8/8/8/8/K7 w - - 0 1', false],
    ...['n', 'b', 'r', 'q'].map(piece => [`7k/6p1/8/4${piece}3/8/8/1P6/K7 w - - 0 1`, false]),
  ] as [string, boolean][]) {
    const game = parseGame(`[SetUp "1"]\n[FEN "${fen}"]\n\n1. Kb1 *`);
    expect(isPawnVsPawn(game.frames[0]), fen).toBe(expected);
    expect(pawnVsPawnStart(game)).toBe(expected ? 0 : undefined);
  }
});

it('starts after the final non-pawn is captured, independently of turn color', () => {
  const game = parseGame('[SetUp "1"]\n[FEN "8/7p/8/4k3/3B4/8/P7/K7 b - - 0 1"]\n\n1... Kxd4 2. Kb1 Ke5 3. Kc2 Kf4 1-0');
  expect(isPawnVsPawn(game.frames[0])).toBe(false);
  expect(pawnVsPawnStart(game)).toBe(1);
  expect(game.moves[0].color).toBe('black');
});

it('uses the first entry when promotions and captures return the board to pawns only', () => {
  const game = parseGame('[SetUp "1"]\n[FEN "8/Pk6/8/8/8/8/1P5p/K7 w - - 0 1"]\n\n1. a8=N Kxa8 2. Kb1 h1=Q 3. Kc2 1-0');
  expect(pawnVsPawnStart(game)).toBe(0);
  expect(isPawnVsPawn(game.frames[1])).toBe(false);
  expect(isPawnVsPawn(game.frames[2])).toBe(true);
  expect(isPawnVsPawn(game.frames[4])).toBe(false);
});
