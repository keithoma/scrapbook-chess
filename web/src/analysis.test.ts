import { beforeEach, expect, it, vi } from 'vitest';
import { analyzeGame } from './analysis';
import { parseGame } from './game';
import { analyzed } from './fixtures/test-analysis';
import { saveCheckpoint, type Checkpoint } from './storage';
import type { StockfishClient } from './stockfish';

vi.mock('./storage', async original => ({
  ...await original<typeof import('./storage')>(), saveCheckpoint: vi.fn(),
}));
beforeEach(() => vi.clearAllMocks());

it('saves annotations for both players alongside every processed move and on resume', async () => {
  const game = parseGame('1. f3 e5 2. g4 Qh4# 0-1');
  const checkpoint = { ...analyzed(game), results: [] };
  let ply = 0;
  const choices = [['f2f3', 'e2e4', 'd2d4'], ['e7e5', 'c7c5', 'd7d5'], ['g2g4', 'e2e4', 'd2d4'], ['d8h4', 'g8f6', 'b8c6']];
  const search = vi.fn(async () => {
    const topMoves = choices[ply].map(uci => ({ uci, score: { type: 'cp' as const, value: 0 }, depth: 6 }));
    return { score: topMoves[0].score, bestMove: game.moves[ply++].uci, depth: 6, topMoves };
  });
  const engine = { search } as unknown as StockfishClient;
  const onSave = vi.fn();
  await analyzeGame(game, checkpoint, engine, new AbortController().signal, onSave);
  expect(search).toHaveBeenCalledTimes(4);
  expect(checkpoint.results).toHaveLength(0);
  for (const [i, [saved, stage]] of onSave.mock.calls.slice(0, 4).entries()) {
    expect(stage).toBe('moves');
    expect(saved.results).toHaveLength(i + 1);
    expect(saved.results.every((result: { annotations?: unknown }) => result.annotations)).toBe(true);
    expect(saved.results.at(-1).topMoves).toHaveLength(3);
  }
  const complete = onSave.mock.lastCall![0];
  expect(complete.virtualStatus).toBe('terminal');
  expect(complete.results.at(-1).annotations.quality).toBe('clean');
  expect(vi.mocked(saveCheckpoint).mock.lastCall![0].results).toEqual(complete.results);

  // A completed older checkpoint can be enriched without another engine search.
  complete.results.forEach((result: { annotations?: unknown }) => { delete result.annotations; });
  search.mockClear(); onSave.mockClear();
  await analyzeGame(game, complete, engine, new AbortController().signal, onSave);
  expect(search).not.toHaveBeenCalled();
  expect(onSave.mock.lastCall![0].results.every((result: { annotations?: unknown }) => result.annotations)).toBe(true);
});

it('enriches legacy results while preserving completed choices and can resume an interrupted upgrade', async () => {
  const game = parseGame('1. f3 e5 2. g4 Qh4# 0-1');
  const checkpoint = { ...analyzed(game), virtualStatus: 'terminal' as const };
  checkpoint.results[0].topMoves = [{ uci: 'f2f3', score: { type: 'cp', value: 0 }, depth: 6 }];
  const search = vi.fn(async (fen: string) => {
    const i = game.frames.findIndex(frame => frame.fen === fen);
    const result = checkpoint.results[i];
    return { bestMove: result.bestMove, score: result.best, depth: 6,
      topMoves: [{ uci: result.bestMove, score: result.best, depth: 6 }] };
  });
  const engine = { search } as unknown as StockfishClient;
  const controller = new AbortController();
  let latest: Checkpoint = checkpoint;
  await expect(analyzeGame(game, checkpoint, engine, controller.signal, saved => {
    latest = saved;
    if (saved.results[1].topMoves?.length) controller.abort();
  })).rejects.toThrow();
  expect(search).toHaveBeenCalledTimes(1);
  expect(latest.results).toHaveLength(4);
  expect(latest.results[0].topMoves).toEqual(checkpoint.results[0].topMoves);
  expect(latest.results[1].topMoves).toHaveLength(1);
  expect(latest.results[2].topMoves).toBeUndefined();
  search.mockClear();
  await analyzeGame(game, latest, engine, new AbortController().signal, saved => { latest = saved; });
  expect(search).toHaveBeenCalledTimes(2);
  expect(latest.results.every(result => result.topMoves?.length)).toBe(true);
});

it('reuses the played choice evaluation when ranked and searches separately when outside the top three', async () => {
  const game = parseGame('1. f3 e5 2. g4 Qh4# 0-1');
  const checkpoint: Checkpoint = { ...analyzed(game), results: [], virtualStatus: 'terminal' };
  const lines = [
    ['e2e4', 'd2d4', 'g1f3'], ['c7c5', 'e7e5', 'e7e6'],
    ['g2g4', 'e2e4', 'd2d4'], ['d8h4', 'g8f6', 'b8c6'],
  ];
  const search = vi.fn(async (fen: string, _depth: number, _turn: string, root?: string) => {
    const i = game.frames.findIndex(frame => frame.fen === fen);
    const topMoves = (root ? [root] : lines[i]).map((uci, rank) => ({ uci, depth: 6,
      score: { type: 'cp' as const, value: root ? -100 : rank * 10 } }));
    return { bestMove: topMoves[0].uci, score: topMoves[0].score, depth: 6, topMoves };
  });
  let latest = checkpoint;
  await analyzeGame(game, checkpoint, { search } as unknown as StockfishClient, new AbortController().signal, saved => { latest = saved; });
  expect(search).toHaveBeenCalledTimes(5);
  expect(search.mock.calls.filter(call => call[3])).toHaveLength(1);
  expect(latest.results[0].played.value).toBe(-100);
  expect(latest.results[1].played.value).toBe(10);
  expect(latest.results[1].annotations?.best).toBe(true);
});
