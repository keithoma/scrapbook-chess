import { Chess } from 'chessops/chess';
import { parseFen, makeFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';
import { makeSanAndPlay } from 'chessops/san';
import type { ReplayGame } from './game';
import { DEPTH, saveCheckpoint, type Checkpoint } from './storage';
import { StockfishClient, TOP_MOVE_COUNT } from './stockfish';
import { findNovelFinish, type FinishOptions } from './virtual-finish';
import { annotateMoves, createMoveAnnotator } from './chess/annotations';

export async function analyzeGame(
  game: ReplayGame,
  checkpoint: Checkpoint,
  engine: StockfishClient,
  signal: AbortSignal,
  onSave: (checkpoint: Checkpoint, stage: 'moves' | 'virtual') => void,
  finishOptions?: FinishOptions,
): Promise<void> {
  let current = structuredClone(checkpoint);
  const annotate = createMoveAnnotator(game);
  current.results = annotateMoves(game, current.results);
  const persist = async (stage: 'moves' | 'virtual') => {
    signal.throwIfAborted();
    current.updatedAt = new Date().toISOString();
    await saveCheckpoint(current);
    signal.throwIfAborted();
    onSave(structuredClone(current), stage);
  };
  const refineFinish = async () => {
    if (!finishOptions || current.virtualStatus !== 'mate') return;
    onSave(structuredClone(current), 'virtual');
    const alternative = await findNovelFinish(game, current.virtual, finishOptions, engine, signal);
    if (alternative) {
      current.virtual = alternative;
      current.virtualWinner = finishOptions.color;
      await persist('virtual');
    }
  };
  if (current.results.length) await persist('moves');
  for (let index = 0; index < game.moves.length; index++) {
    signal.throwIfAborted();
    const saved = current.results[index];
    if (saved?.topMoves?.length) {
      current.results[index] = annotate(saved);
      continue;
    }
    const move = game.moves[index];
    const before = game.frames[index];
    const start = performance.now();
    const best = await engine.search(before.fen, DEPTH, before.turn, undefined, TOP_MOVE_COUNT);
    const ranked = best.topMoves.find(pick => pick.uci === move.uci);
    const played = ranked?.score ?? (await engine.search(before.fen, DEPTH, before.turn, move.uci)).score;
    current.results[index] = annotate({
      ply: move.ply, best: best.score, played,
      bestMove: best.bestMove, topMoves: best.topMoves, ms: performance.now() - start,
    });
    await persist('moves');
  }
  if (current.virtualStatus !== 'pending') { await refineFinish(); return; }
  const final = game.frames.at(-1)!;
  const position = Chess.fromSetup(parseFen(current.virtual.at(-1)?.fen ?? final.fen).unwrap()).unwrap();
  if (current.virtual.length === 0 && position.isEnd()) {
    current.virtualStatus = 'terminal';
    await persist('virtual');
    return;
  }
  while (current.virtual.length < 20 && !position.isEnd()) {
    signal.throwIfAborted();
    const result = await engine.search(makeFen(position.toSetup()), DEPTH, position.turn);
    const move = parseUci(result.bestMove);
    if (!move || !position.isLegal(move)) throw new Error('Engine continuation returned an illegal move.');
    const san = makeSanAndPlay(position, move);
    current.virtual.push({ san, uci: result.bestMove, fen: makeFen(position.toSetup()) });
    // Persist each virtual ply as well, including the terminal result atomically.
    if (position.isEnd()) {
      current.virtualStatus = position.isCheckmate() ? 'mate' : 'terminal';
      if (position.isCheckmate()) current.virtualWinner = position.turn === 'white' ? 'black' : 'white';
    } else if (current.virtual.length === 20) current.virtualStatus = 'limit';
    await persist('virtual');
  }
  await refineFinish();
}
