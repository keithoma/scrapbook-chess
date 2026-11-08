import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseVariation, StockfishClient } from './stockfish';

class FakeWorker {
  static last: FakeWorker;
  onmessage?: (event: { data: string }) => void;
  onerror?: (event: { message: string }) => void;
  postMessage = vi.fn();
  terminate = vi.fn();
  constructor() { FakeWorker.last = this; }
  emit(...lines: string[]) { this.onmessage?.({ data: lines.join('\n') }); }
}
beforeEach(() => vi.stubGlobal('Worker', FakeWorker));
afterEach(() => vi.unstubAllGlobals());
const fen = makeFen(Chess.default().toSetup());

it('parses ranked scores and rejects bound-only, score-only and invalid PV output', () => {
  expect(parseVariation('info depth 6 multipv 2 score cp 15 pv e7e5 g1f3', 'black')).toEqual({ rank: 2, depth: 6, uci: 'e7e5', score: { type: 'cp', value: -15 } });
  expect(parseVariation('info depth 6 score mate 1 pv d8h4', 'black')?.score).toEqual({ type: 'mate', value: -1 });
  for (const line of ['info depth 6 score cp 10 lowerbound pv e2e4', 'info depth 6 score cp 10', 'info depth 6 multipv 0 score cp 10 pv e2e4'])
    expect(parseVariation(line, 'white')).toBeUndefined();
});

it('keeps the first pick evaluation separate from later ranks and resets MultiPV for forced searches', async () => {
  const client = new StockfishClient();
  const worker = FakeWorker.last;
  const searched = client.search(fen, 6, 'white', undefined, 3);
  worker.emit(
    'info depth 5 multipv 2 score cp 900 pv b1c3',
    'info depth 6 multipv 1 score cp 40 pv e2e4',
    'info depth 6 multipv 2 score cp 30 pv d2d4',
    'info depth 6 multipv 3 score cp 20 pv g1f3',
    'bestmove e2e4 ponder e7e5',
  );
  expect(await searched).toMatchObject({ bestMove: 'e2e4', score: { value: 40 }, topMoves: [
    { uci: 'e2e4', score: { value: 40 }, depth: 6 },
    { uci: 'd2d4', score: { value: 30 }, depth: 6 },
    { uci: 'g1f3', score: { value: 20 }, depth: 6 },
  ] });
  expect(worker.postMessage).toHaveBeenCalledWith('setoption name MultiPV value 3');
  const forced = client.search(fen, 6, 'white', 'a2a3');
  worker.emit('info depth 6 score cp -50 pv a2a3', 'bestmove a2a3');
  expect((await forced).score.value).toBe(-50);
  expect(worker.postMessage).toHaveBeenLastCalledWith('go depth 6 searchmoves a2a3');
  expect(worker.postMessage).toHaveBeenCalledWith('setoption name MultiPV value 1');
  client.terminate();
});

it('rejects incomplete, duplicated, mismatched, or mixed-depth choices', async () => {
  for (const lines of [
    ['info depth 6 multipv 1 score cp 40 pv e2e4', 'info depth 5 multipv 2 score cp 20 pv d2d4', 'info depth 6 multipv 3 score cp 10 pv g1f3'],
    ['info depth 6 multipv 1 score cp 40 pv e2e4', 'info depth 6 multipv 2 score cp 20 pv e2e4', 'info depth 6 multipv 3 score cp 10 pv g1f3'],
    ['info depth 6 multipv 1 score cp 40 pv d2d4', 'info depth 6 multipv 2 score cp 20 pv e2e4', 'info depth 6 multipv 3 score cp 10 pv g1f3'],
  ]) {
    const client = new StockfishClient();
    const searched = client.search(fen, 6, 'white', undefined, 3);
    const rejected = expect(searched).rejects.toThrow('complete evaluated choices');
    FakeWorker.last.emit(...lines, 'bestmove e2e4');
    await rejected;
    client.terminate();
  }
});

it('returns fewer than three choices when only one legal move exists', async () => {
  const client = new StockfishClient();
  const searched = client.search('k7/8/2K5/8/8/8/8/R7 b - - 0 1', 6, 'black', undefined, 3);
  FakeWorker.last.emit('info depth 6 multipv 1 score mate -1 pv a8b8', 'bestmove a8b8');
  expect((await searched).topMoves).toHaveLength(1);
  client.terminate();
});
