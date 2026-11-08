import { Chess, castlingSide } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { makeSanAndPlay } from 'chessops/san';
import { kingCastlesTo, makeUci, parseUci } from 'chessops/util';
import type { Color, NormalMove } from 'chessops/types';
import type { ReplayGame } from './game';
import type { VirtualMove } from './storage';
import { DEPTH } from './storage';
import type { Score, StockfishClient } from './stockfish';

export interface FinishOptions { color?: Color; owned: ReadonlySet<string> }
const BRANCH_BUDGET = 3;
const MAX_PLIES = 20;

function legalMoves(position: Chess): string[] {
  const result: string[] = [];
  for (const [from, destinations] of position.allDests()) for (const to of destinations) {
    const promotions = position.board.getRole(from) === 'pawn' && (to < 8 || to >= 56)
      ? ['queen', 'rook', 'bishop', 'knight'] as const : [undefined];
    for (const promotion of promotions) {
      const move: NormalMove = { from, to, promotion };
      const castle = castlingSide(position, move);
      result.push(makeUci(castle ? { ...move, to: kingCastlesTo(position.turn, castle) } : move));
    }
  }
  return result;
}
function noWorse(best: Score, other: Score, color: Color): boolean {
  const sign = color === 'white' ? 1 : -1;
  if (other.type === 'mate' && other.value * sign > 0) return true;
  return best.type === 'cp' && other.type === 'cp' && other.value * sign >= best.value * sign;
}

// Explore the last three player decisions, with at most one alternative per
// decision. The defending side always receives unrestricted best-move searches.
export async function findNovelFinish(game: ReplayGame, baseline: VirtualMove[], options: FinishOptions,
  engine: Pick<StockfishClient, 'search'>, signal: AbortSignal): Promise<VirtualMove[] | undefined> {
  if (!options.color || !baseline.length || !options.owned.has(baseline.at(-1)!.san)) return;
  const pos = Chess.fromSetup(parseFen(game.frames.at(-1)!.fen).unwrap()).unwrap();
  const branches: { position: Chess; index: number }[] = [];
  for (const [index, step] of baseline.entries()) {
    const move = parseUci(step.uci);
    if (pos.isEnd() || !move || !pos.isLegal(move)) return;
    if (pos.turn === options.color) branches.push({ position: pos.clone(), index });
    pos.play(move);
  }
  if (!pos.isCheckmate() || pos.turn === options.color) return;
  for (const { position, index } of branches.reverse().slice(0, BRANCH_BUDGET)) {
    signal.throwIfAborted();
    const alternatives = legalMoves(position).filter(move => move !== baseline[index].uci);
    if (!alternatives.length) continue;
    const best = await engine.search(makeFen(position.toSetup()), DEPTH, position.turn);
    const other = await engine.search(makeFen(position.toSetup()), DEPTH, position.turn, alternatives.join(' '));
    if (!noWorse(best.score, other.score, options.color)) continue;
    const line = baseline.slice(0, index);
    let uci = other.bestMove;
    while (line.length < MAX_PLIES && !position.isEnd()) {
      signal.throwIfAborted();
      const move = parseUci(uci);
      if (!move || !position.isLegal(move)) break;
      const san = makeSanAndPlay(position, move);
      line.push({ san, uci, fen: makeFen(position.toSetup()) });
      if (!position.isEnd() && line.length < MAX_PLIES) {
        uci = (await engine.search(makeFen(position.toSetup()), DEPTH, position.turn)).bestMove;
      }
    }
    if (position.isCheckmate() && position.turn !== options.color && !options.owned.has(line.at(-1)!.san)) return line;
  }
}
