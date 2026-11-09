import { expect, it, vi } from 'vitest';
import { analyzeCleanGain } from './clean-gain-analysis';
import { cleanGainFixture } from './fixtures/clean-gain-evidence';
import type { EnginePick, StockfishClient } from './stockfish';
import { assessCleanGain } from './chess/clean-gain';

function fixtureEngine() {
  const { game, evidence } = cleanGainFixture();
  const search = vi.fn(async (fen: string, depth: number) => {
    const sample = evidence.attempts[0].samples.find(sample => sample.depth === depth)!;
    const board = game.frames.findIndex(frame => frame.fen === fen);
    const pick = board === 0 ? sample.before : board === 1 ? sample.conceded : sample.after;
    return { bestMove: pick.uci, score: pick.score, depth, topMoves: [pick] };
  });
  return { game, search, engine: { search } as unknown as StockfishClient };
}
it('uses real continuation evidence from three positions at successive depths and shares repeated searches', async () => {
  const { game, search, engine } = fixtureEngine();
  const cache = new Map<string, EnginePick>();
  const options = { lookup: () => undefined, cache, onProgress: vi.fn() };
  const evidence = await analyzeCleanGain(game, 2, engine, new AbortController().signal, options);
  expect(search).toHaveBeenCalledTimes(6); // Before capture equals after the concession.
  expect(options.onProgress).toHaveBeenCalledTimes(2);
  expect(assessCleanGain(game, evidence, options.lookup).status).toBe('qualified');
  await analyzeCleanGain(game, 2, engine, new AbortController().signal, options);
  expect(search).toHaveBeenCalledTimes(6);
});
it('gates book moves before engine work and accepts the verified trap exception', async () => {
  const { game, search, engine } = fixtureEngine();
  const excluded = await analyzeCleanGain(game, 2, engine, new AbortController().signal, { lookup: () => ({ weight: 1 }) });
  expect(search).not.toHaveBeenCalled();
  expect(assessCleanGain(game, excluded, () => ({ weight: 1 })).reason).toBe('book');
  const lookup = () => ({ weight: 1, games: 100, wins: 29, losses: 60 });
  const trap = await analyzeCleanGain(game, 2, engine, new AbortController().signal, { lookup });
  expect(assessCleanGain(game, trap, lookup).status).toBe('qualified');
});
it('honors cancellation between depths without publishing a qualification from partial work', async () => {
  const { game, engine } = fixtureEngine();
  const controller = new AbortController();
  await expect(analyzeCleanGain(game, 2, engine, controller.signal, {
    lookup: () => undefined, onProgress: evidence => {
      expect(assessCleanGain(game, evidence, () => undefined).status).toBe('pending');
      controller.abort();
    },
  })).rejects.toThrow();
});

it('leaves a bounded search unconfirmed and resumes from completed depth samples', async () => {
  const { game, search, engine } = fixtureEngine();
  const budget = { remainingNodes: 3 };
  search.mockImplementation(async (fen: string, depth: number) => {
    const { evidence } = cleanGainFixture();
    const sample = evidence.attempts[0].samples.find(sample => sample.depth === depth)!;
    const index = game.frames.findIndex(frame => frame.fen === fen);
    const pick = index === 0 ? sample.before : index === 1 ? sample.conceded : sample.after;
    return { bestMove: pick.uci, score: pick.score, depth, topMoves: [pick], nodes: 1 };
  });
  const first = await analyzeCleanGain(game, 2, engine, new AbortController().signal, { budget, lookup: () => undefined });
  expect(first.budgetExhausted).toBe(true);
  expect(first.attempts[0].samples).toHaveLength(1);
  expect(assessCleanGain(game, first, () => undefined).status).toBe('pending');
  search.mockClear();
  const resumed = await analyzeCleanGain(game, 2, engine, new AbortController().signal, { previous: first, lookup: () => undefined });
  expect(resumed.budgetExhausted).toBeUndefined();
  expect(search).toHaveBeenCalledTimes(3);
  expect(assessCleanGain(game, resumed, () => undefined).status).toBe('qualified');
});
