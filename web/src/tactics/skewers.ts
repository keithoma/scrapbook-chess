import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { makeSan } from 'chessops/san';
import { makeSquare, opposite, parseUci } from 'chessops/util';
import type { Color, Role, Square } from 'chessops/types';
import type { ReplayGame, Frame } from '../game';
import { balance, captureGain, legalMoves } from './material';

const value: Record<Role, number> = {
  pawn: 100,
  knight: 300,
  bishop: 300,
  rook: 500,
  queen: 900,
  king: Infinity,
};
interface Target {
  square: Square;
  role: Role;
  name: string;
}
export interface SkewerLine {
  attacker: Square;
  attackerName: string;
  role: Role;
  front: Target;
  rear: Target;
}
export interface SkewerCandidate {
  ply: number;
  san: string;
  color: Color;
  beforeFen: string;
  lines: SkewerLine[];
}
export type SkewerMaterial =
  | { status: 'qualified'; gainCp: number; reply: string; capture: string; line: SkewerLine }
  | { status: 'rejected'; reason: 'no-gain' }
  | { status: 'unresolved' };
const directions = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [1, 1],
  [1, -1],
  [-1, 1],
  [-1, -1],
] as const;
function lines(frame: Frame, color: Color): SkewerLine[] {
  const occupied = new Map(frame.pieces.map((piece) => [piece.square, piece]));
  const found: SkewerLine[] = [];
  for (const piece of frame.pieces) {
    if (piece.color !== color || !['bishop', 'rook', 'queen'].includes(piece.role)) continue;
    for (const [dx, dy] of directions) {
      if ((piece.role === 'bishop' && (!dx || !dy)) || (piece.role === 'rook' && dx && dy))
        continue;
      const targets: Target[] = [];
      for (
        let x = (piece.square % 8) + dx, y = (piece.square >> 3) + dy;
        x >= 0 && x < 8 && y >= 0 && y < 8;
        x += dx, y += dy
      ) {
        const square = (y * 8 + x) as Square;
        const target = occupied.get(square);
        if (!target) continue;
        if (target.color === color) break;
        targets.push({ square, role: target.role, name: makeSquare(square) });
        if (targets.length === 2) break;
      }
      if (
        targets.length === 2 &&
        targets[0].role !== 'pawn' &&
        targets[1].role !== 'king' &&
        value[targets[0].role] > value[targets[1].role]
      )
        found.push({
          attacker: piece.square,
          attackerName: makeSquare(piece.square),
          role: piece.role,
          front: targets[0],
          rear: targets[1],
        });
    }
  }
  return found;
}
const candidates = new WeakMap<Frame[], SkewerCandidate[]>();
export function skewerCandidates(game: ReplayGame): SkewerCandidate[] {
  const saved = candidates.get(game.frames);
  if (saved) return saved;
  const result = game.moves.flatMap((move) => {
    const before = lines(game.frames[move.ply - 1], move.color);
    const uci = parseUci(move.uci);
    const created = lines(game.frames[move.ply], move.color).filter((line) => {
      const origin =
        uci && 'from' in uci && uci.to === line.attacker && !move.promotion
          ? uci.from
          : line.attacker;
      return !before.some(
        (old) =>
          old.attacker === origin &&
          old.front.square === line.front.square &&
          old.rear.square === line.rear.square,
      );
    });
    return created.length
      ? [
          {
            ply: move.ply,
            san: move.san,
            color: move.color,
            beforeFen: game.frames[move.ply - 1].fen,
            lines: created,
          },
        ]
      : [];
  });
  candidates.set(game.frames, result);
  return result;
}
function inspect(game: ReplayGame, candidate: SkewerCandidate, line: SkewerLine): SkewerMaterial {
  const pos = Chess.fromSetup(parseFen(game.frames[candidate.ply].fen).unwrap()).unwrap();
  if (pos.isEnd()) return { status: 'rejected', reason: 'no-gain' };
  const budget = { nodes: 20_000 };
  let worst: Extract<SkewerMaterial, { status: 'qualified' }> | undefined;
  try {
    for (const reply of legalMoves(pos)) {
      const next = pos.clone();
      next.play(reply);
      let best = 0;
      let capture = '';
      if (!next.isEnd())
        for (const target of [line.front, line.rear]) {
          if (target.role === 'king') continue;
          const square = 'from' in reply && reply.from === target.square ? reply.to : target.square;
          if (next.board.get(square)?.color !== opposite(candidate.color)) continue;
          const froms: Square[] = [];
          if (
            next.board.get(line.attacker)?.color === candidate.color &&
            next.board.getRole(line.attacker) === line.role
          )
            froms.push(line.attacker);
          // A skewered front piece may capture the attacker instead of retreating.
          // Count that defense only when a legal recapture of the SAME target
          // still wins material. Unrelated hanging pieces do not prove a skewer.
          else if (square === line.attacker && 'from' in reply && reply.from === target.square)
            froms.push(...next.board[candidate.color]);
          for (const captureMove of legalMoves(next)) {
            if (
              !('from' in captureMove) ||
              captureMove.to !== square ||
              !froms.includes(captureMove.from)
            )
              continue;
            const gain = captureGain(next, captureMove.from, square, budget, captureMove.promotion);
            if (gain > best) {
              best = gain;
              capture = makeSan(next, captureMove);
            }
          }
        }
      const gainCp = balance(next, candidate.color) - balance(pos, candidate.color) + best;
      if (gainCp < 100 || !capture) return { status: 'rejected', reason: 'no-gain' };
      if (!worst || gainCp < worst.gainCp)
        worst = { status: 'qualified', gainCp, reply: makeSan(pos, reply), capture, line };
    }
    return worst ?? { status: 'rejected', reason: 'no-gain' };
  } catch (error) {
    if (error instanceof RangeError) return { status: 'unresolved' };
    throw error;
  }
}
const materials = new WeakMap<Frame[], Map<number, SkewerMaterial>>();
export function skewerMaterialThreat(game: ReplayGame, candidate: SkewerCandidate): SkewerMaterial {
  let entries = materials.get(game.frames);
  if (!entries) {
    entries = new Map();
    materials.set(game.frames, entries);
  }
  const saved = entries.get(candidate.ply);
  if (saved) return saved;
  let result: SkewerMaterial = { status: 'rejected', reason: 'no-gain' };
  for (const line of candidate.lines) {
    const evaluated = inspect(game, candidate, line);
    if (
      evaluated.status === 'qualified' &&
      (result.status !== 'qualified' || evaluated.gainCp > result.gainCp)
    )
      result = evaluated;
    else if (evaluated.status === 'unresolved' && result.status === 'rejected') result = evaluated;
  }
  entries.set(candidate.ply, result);
  return result;
}
