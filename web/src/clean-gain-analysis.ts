import type { ReplayGame } from './game';
import type { MoveResult } from './storage';
import type { StockfishClient, EnginePick } from './stockfish';
import { openingBook } from './openings/book';
import { Chess } from 'chessops/chess';
import { parseFen, makeFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';
import {
  CLEAN_GAIN_RULE, cleanGainCandidates, candidateBookGate, assessCleanGainAttempt, materialLine, validCleanGainEvidence,
  type BookLookup, type CleanGainEvidence, type CleanGainSample,
} from './chess/clean-gain';

export async function analyzeCleanGain(
  game: ReplayGame, capturePly: number, engine: Pick<StockfishClient, 'search'>,
  signal: AbortSignal, options: {
    results?: MoveResult[];
    lookup?: BookLookup;
    cache?: Map<string, EnginePick>;
    budget?: { remainingNodes: number };
    previous?: CleanGainEvidence;
    onProgress?: (evidence: CleanGainEvidence) => void;
  } = {},
): Promise<CleanGainEvidence> {
  const lookup = options.lookup ?? ((pos, move) => openingBook.lookup(pos, move));
  const cache = options.cache ?? new Map<string, EnginePick>();
  const evidence: CleanGainEvidence = options.previous?.capturePly === capturePly && validCleanGainEvidence(game, options.previous)
    ? structuredClone(options.previous) : { ruleVersion: CLEAN_GAIN_RULE.version, capturePly, attempts: [] };
  delete evidence.budgetExhausted;
  const exhausted = new Error('Clean gain analysis budget exhausted.');
  if (!game.moves[capturePly - 1]?.captured || Chess.fromSetup(parseFen(game.frames[capturePly].fen).unwrap()).unwrap().isEnd()) return evidence;
  const candidates = cleanGainCandidates(game, capturePly);
  // Shallow scores only order the work; they never discard a possible baseline.
  const delta = (ply: number) => {
    const result = options.results?.[ply - 1];
    return result?.best.type === 'cp' && result.played.type === 'cp'
      ? Math.abs(result.best.value - result.played.value) : 0;
  };
  candidates.sort((a, b) => delta(b.concessionPly) - delta(a.concessionPly));
  const searchFen = async (fen: string, turn: 'white' | 'black', depth: number) => {
    signal.throwIfAborted();
    const key = `${depth}:${fen}`;
    if (cache.has(key)) return cache.get(key)!;
    if (options.budget && options.budget.remainingNodes < 1) throw exhausted;
    const result = await engine.search(fen, depth, turn, undefined, 1,
      options.budget ? { nodes: options.budget.remainingNodes, allowPartialDepth: true } : undefined);
    signal.throwIfAborted();
    if (options.budget) options.budget.remainingNodes -= Math.max(1, result.nodes ?? options.budget.remainingNodes);
    if (result.depth < depth) throw exhausted;
    const pick = result.topMoves[0];
    cache.set(key, pick);
    return pick;
  };
  const search = (board: number, depth: number) => searchFen(game.frames[board].fen, game.frames[board].turn, depth);
  const settledSearch = async (board: number, depth: number) => {
    const pick = structuredClone(await search(board, depth));
    if (!pick.pv?.length) return pick;
    const color = game.moves[capturePly - 1].color;
    // UCI PVs can end at a tactical leaf. Extend that leaf with independently
    // searched best replies, rather than interpreting its output boundary as
    // evidence that an exchange is still running. Keep the original root score.
    const position = Chess.fromSetup(parseFen(game.frames[board].fen).unwrap()).unwrap();
    for (const uci of pick.pv) {
      const move = parseUci(uci);
      if (position.isEnd() || !move || !position.isLegal(move)) return pick;
      position.play(move);
    }
    for (let i = 0; i < CLEAN_GAIN_RULE.maximumExtensionPlies && pick.pv.length < CLEAN_GAIN_RULE.maximumLinePlies; i++) {
      if (position.isEnd() || materialLine(game.frames[board].fen, pick, color, 0)?.settled) break;
      const reply = await searchFen(makeFen(position.toSetup()), position.turn, CLEAN_GAIN_RULE.depths[0]);
      const move = parseUci(reply.uci);
      if (!move || !position.isLegal(move)) break;
      pick.pv.push(reply.uci); position.play(move);
    }
    return pick;
  };
  const progress = () => options.onProgress?.(structuredClone(evidence));
  try {
    for (const candidate of candidates) {
      signal.throwIfAborted();
      let attempt = evidence.attempts.find(attempt => attempt.concessionPly === candidate.concessionPly);
      if (!attempt) { attempt = { ...candidate, samples: [] as CleanGainSample[] }; evidence.attempts.push(attempt); }
      if (candidateBookGate(game, candidate, lookup) === 'excluded') { progress(); continue; }
      const saved = assessCleanGainAttempt(game, attempt, lookup);
      if (saved.status === 'qualified') return evidence;
      if (saved.status === 'rejected') continue;
      for (const depth of CLEAN_GAIN_RULE.depths) {
        if (attempt.samples.some(sample => sample.depth === depth)) continue;
        const before = await search(candidate.concessionPly - 1, depth);
        const conceded = await settledSearch(candidate.concessionPly, depth);
        const captureBest = await search(capturePly - 1, depth);
        const after = await settledSearch(capturePly, depth);
        attempt.samples.push({ depth, before, conceded, captureBest, after });
        progress();
        const result = assessCleanGainAttempt(game, attempt, lookup);
        if (result.status === 'qualified') return evidence;
        if (result.status === 'rejected') break;
      }
    }
  } catch (error) {
    if (error !== exhausted) throw error;
    evidence.budgetExhausted = true;
  }
  return evidence;
}
