import { expect, it, vi } from 'vitest';
import { parseGame } from './game';
import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { makeSanAndPlay } from 'chessops/san';
import { parseUci } from 'chessops/util';
import { findNovelFinish } from './virtual-finish';

const game = parseGame('[SetUp "1"]\n[FEN "8/8/8/8/8/1NK5/R6R/2k5 b - - 0 1"]\n\n1... Kb1 1-0');
const position = Chess.fromSetup(parseFen(game.frames.at(-1)!.fen).unwrap()).unwrap();
const san = makeSanAndPlay(position, parseUci('a2b2')!);
const baseline = [{ san, uci: 'a2b2', fen: makeFen(position.toSetup()) }];

it('finds a legal uncollected mating notation without changing the baseline', async () => {
  const search = vi.fn(async (_fen, _depth, _color, roots?: string) => ({ score: { type: 'mate' as const, value: 1 }, bestMove: roots ? 'h2b2' : 'a2b2', depth: 6, topMoves: [] }));
  const result = await findNovelFinish(game, baseline, { color: 'white', owned: new Set(['Rab2#']) }, { search }, new AbortController().signal);
  expect(result?.at(-1)?.san).toBe('Rhb2#');
  expect(baseline[0].san).toBe('Rab2#');
  expect(search.mock.calls[1][3]?.split(' ')).not.toContain('a2b2');
  expect(search).toHaveBeenCalledTimes(2);
});

it('rejects a weaker alternative instead of manufacturing an uncollected mate', async () => {
  const search = vi.fn(async (_fen, _depth, _color, roots?: string) => ({ score: { type: 'cp' as const, value: roots ? -500 : 500 }, bestMove: roots ? 'h2b2' : 'a2b2', depth: 6, topMoves: [] }));
  expect(await findNovelFinish(game, baseline, { color: 'white', owned: new Set(['Rab2#']) }, { search }, new AbortController().signal)).toBeUndefined();
});

it('skips extra work when the finish is new or belongs to the other side', async () => {
  const search = vi.fn();
  expect(await findNovelFinish(game, baseline, { color: 'white', owned: new Set() }, { search }, new AbortController().signal)).toBeUndefined();
  expect(await findNovelFinish(game, baseline, { color: 'black', owned: new Set(['Rab2#']) }, { search }, new AbortController().signal)).toBeUndefined();
  expect(search).not.toHaveBeenCalled();
});
