import { parseGame } from '../game';
import type { EnginePick } from '../stockfish';
import { CLEAN_GAIN_RULE, MATERIAL_VALUES, type CleanGainEvidence } from '../chess/clean-gain';
import type { Role } from 'chessops/types';

// Legal lines with synthetic scores isolate rule arithmetic from engine tuning.
export function cleanGainFixture(role: Exclude<Role, 'king'> = 'pawn', black = false) {
  const char = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q' }[role];
  const board = Array.from({ length: 8 }, () => Array<string>(8).fill(''));
  const place = (square: string, piece: string) => { board[8 - Number(square[1])][square.charCodeAt(0) - 97] = piece; };
  place('a1', 'K'); place('h8', 'k'); place('g2', 'P'); place('g7', 'p');
  place(black ? 'd8' : 'd1', black ? 'r' : 'R');
  const from = black ? (role === 'knight' ? 'e2' : role === 'bishop' ? 'e3' : 'd3')
    : (role === 'knight' ? 'e7' : role === 'bishop' ? 'e6' : 'd6');
  const to = black ? 'd4' : 'd5';
  place(from, black ? char.toUpperCase() : char);
  const fen = board.map(rank => {
    let result = ''; let empty = 0;
    for (const piece of rank) {
      if (!piece) { empty++; continue; }
      if (empty) result += empty;
      empty = 0; result += piece;
    }
    return result + (empty || '');
  }).join('/') + ` ${black ? 'w' : 'b'} - - 0 1`;
  const san = role === 'pawn' ? to : `${char.toUpperCase()}${to}`;
  const game = parseGame(`[SetUp "1"]\n[FEN "${fen}"]\n\n${black ? `1. ${san} Rxd4 0-1` : `1... ${san} 2. Rxd5 1-0`}`);
  const quiet = black ? ['a1a2', 'h8h7', 'a2a1', 'h7h8', 'a1a2', 'h8h7'] : ['h8h7', 'a1a2', 'h7h8', 'a2a1', 'h8h7', 'a1a2'];
  const gain = MATERIAL_VALUES[role] * 0.8 * (black ? -1 : 1);
  const pick = (pv: string[], value: number, depth: number): EnginePick => ({ uci: pv[0], pv, depth, score: { type: 'cp', value } });
  const evidence: CleanGainEvidence = {
    ruleVersion: CLEAN_GAIN_RULE.version, capturePly: 2,
    attempts: [{ capturePly: 2, concessionPly: 1, samples: [10, 14].map(depth => ({ depth,
      before: pick([...game.moves.map(move => move.uci), ...quiet], 0, depth),
      conceded: pick([game.moves[1].uci, ...quiet], gain, depth),
      captureBest: pick([game.moves[1].uci, ...quiet], gain, depth),
      after: pick(quiet, gain, depth),
    })) }],
  };
  return { game, evidence };
}
