import { expect, it } from 'vitest';
import { parseGame } from '../game';
import { analyzed } from '../fixtures/test-analysis';
import { bestMove, onlyMove } from './move-rules';
import { judgment, quality } from './quality';
import { annotateMoves } from './annotations';
import type { Score } from '../stockfish';

const cp = (value: number): Score => ({ type: 'cp', value });
const mate = (value: number): Score => ({ type: 'mate', value });

it('marks the first pick or a move within an inclusive 10 CP difference as best for either color', () => {
  const game = parseGame('1. e4 e5 *');
  for (const sign of [1, -1]) {
    const result = { ...analyzed(game).results[0], bestMove: 'd2d4', best: cp(100 * sign), played: cp(90 * sign) };
    expect(bestMove('e2e4', result)).toBe(true);
    expect(bestMove('e2e4', { ...result, played: cp(89 * sign) })).toBe(false);
    expect(bestMove('d2d4', { ...result, best: mate(sign), played: cp(0) })).toBe(true);
    expect(bestMove('e2e4', { ...result, best: mate(sign), played: mate(sign) })).toBe(false);
  }
});

it('distinguishes inaccuracies while keeping existing book and achievement gates unchanged', () => {
  expect(judgment(cp(0), cp(-54))).toBe('clean');
  expect(judgment(cp(0), cp(-55))).toBe('inaccuracy');
  expect(judgment(cp(0), cp(-110))).toBe('inaccuracy');
  expect(judgment(cp(0), cp(-111))).toBe('mistake');
  expect(judgment(cp(0), cp(-169))).toBe('blunder');
  expect(quality(cp(0), cp(-55))).toBe('clean');
  expect(judgment(cp(-1000), mate(-1))).toBe('inaccuracy');
  expect(judgment(mate(2), cp(1000))).toBe('inaccuracy');
});

it('requires a played best move and an inaccurate or worse second pick, for White and Black', () => {
  const game = parseGame('1. e4 e5 *');
  const results = analyzed(game).results;
  for (const [i, result] of results.entries()) {
    const sign = i ? -1 : 1;
    result.topMoves = [
      { uci: result.bestMove, score: cp(0), depth: 6 },
      { uci: i ? 'c7c5' : 'd2d4', score: cp(-55 * sign), depth: 6 },
      { uci: i ? 'e7e6' : 'c2c4', score: cp(-169 * sign), depth: 6 },
    ];
  }
  expect(annotateMoves(game, results).map(result => result.annotations)).toMatchObject([
    { best: true, only: true }, { best: true, only: true },
  ]);
  const result = results[0];
  expect(onlyMove('e2e4', 'white', { ...result, topMoves: undefined })).toBe(false);
  expect(onlyMove('e2e4', 'white', { ...result, topMoves: result.topMoves!.slice(0, 1) })).toBe(false);
  result.topMoves![1].score = cp(-54);
  expect(onlyMove('e2e4', 'white', result)).toBe(false); // A bad third choice is insufficient.
  result.topMoves![1].score = cp(-111);
  expect(onlyMove('e2e4', 'white', result)).toBe(true);
  expect(onlyMove('d2d4', 'white', { ...result, played: cp(-111) })).toBe(false);
});

it('compares mates categorically and does not call two winning mating choices an only move', () => {
  const game = parseGame('1. e4 *');
  const result = { ...analyzed(game).results[0], best: mate(2), played: mate(2), topMoves: [
    { uci: 'e2e4', score: mate(2), depth: 6 }, { uci: 'd2d4', score: mate(4), depth: 6 },
  ] };
  expect(onlyMove('e2e4', 'white', result)).toBe(false);
  result.topMoves[1].score = cp(1000);
  expect(onlyMove('e2e4', 'white', result)).toBe(true);
});
