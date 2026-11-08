import { legalMoves, balance, captureGain } from './material';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { makeSan } from 'chessops/san';
import { opposite } from 'chessops/util';
import type { ReplayGame } from '../game';
import type { KnightForkCandidate } from './knight-forks';

export type MaterialThreat = { status: 'qualified'; gainCp: number; reply: string; capture: string }
  | { status: 'rejected'; reason: 'pinned' | 'capturable' | 'no-gain' }
  | { status: 'unresolved' };
const cache = new WeakMap<ReplayGame['frames'], Map<number, MaterialThreat>>();


function inspect(game: ReplayGame, fork: KnightForkCandidate): MaterialThreat {
  if (fork.pinned) return { status: 'rejected', reason: 'pinned' };
  if (fork.capturable) return { status: 'rejected', reason: 'capturable' };
  const pos = Chess.fromSetup(parseFen(game.frames[fork.ply].fen).unwrap()).unwrap();
  if (pos.isEnd()) return { status: 'rejected', reason: 'no-gain' };
  const own = pos.clone(); own.turn = fork.color;
  const budget = { nodes: 20_000 };
  try {
    const threats = fork.targets.filter(target => target.role === 'king'
      || captureGain(own, fork.square, target.square, budget) >= 100);
    if (threats.length < 2) return { status: 'rejected', reason: 'no-gain' };
    let worst: Extract<MaterialThreat, { status: 'qualified' }> | undefined;
    // Every immediate legal defense must still leave a profitable capture by
    // this knight. Check counterchecks, target moves, and captures elsewhere.
    for (const reply of legalMoves(pos)) {
      const next = pos.clone(); next.play(reply);
      let best = 0;
      let capture = '';
      if (next.board.get(fork.square)?.color === fork.color && !next.isEnd()) {
        for (const target of threats) {
          if (target.role === 'king') continue;
          const square = 'from' in reply && reply.from === target.square ? reply.to : target.square;
          if (next.board.get(square)?.color !== opposite(fork.color)) continue;
          const gain = captureGain(next, fork.square, square, budget);
          if (gain > best) { best = gain; capture = makeSan(next, { from: fork.square, to: square }); }
        }
      }
      const gainCp = balance(next, fork.color) - balance(pos, fork.color) + best;
      if (gainCp < 100 || !capture) return { status: 'rejected', reason: 'no-gain' };
      if (!worst || gainCp < worst.gainCp) worst = { status: 'qualified', gainCp, reply: makeSan(pos, reply), capture };
    }
    return worst ?? { status: 'rejected', reason: 'no-gain' };
  } catch (error) {
    if (error instanceof RangeError) return { status: 'unresolved' };
    throw error;
  }
}

export function forkMaterialThreat(game: ReplayGame, fork: KnightForkCandidate): MaterialThreat {
  let entries = cache.get(game.frames);
  if (!entries) { entries = new Map(); cache.set(game.frames, entries); }
  let result = entries.get(fork.ply);
  if (!result) { result = inspect(game, fork); entries.set(fork.ply, result); }
  return result;
}
