import { parsePgn, startingPosition } from 'chessops/pgn';
import { makeSanAndPlay, parseSan } from 'chessops/san';
import { makeFen } from 'chessops/fen';
import { makeUci } from 'chessops/util';
import { kingCastlesTo } from 'chessops/util';
import { castlingSide } from 'chessops/chess';
import type { Color, Role } from 'chessops/types';

export interface Frame {
  fen: string;
  pieces: { square: number; color: Color; role: Role }[];
  checkmate: boolean;
  turn: Color;
}
export interface PlayedMove {
  ply: number;
  san: string;
  uci: string;
  color: Color;
  enPassant: boolean;
}
export interface ReplayGame {
  pgn: string;
  white: string;
  black: string;
  result: string;
  site: string;
  timestamp: string;
  frames: Frame[];
  moves: PlayedMove[];
}

export function parseGame(pgn: string): ReplayGame {
  const games = parsePgn(pgn.trim());
  if (games.length !== 1) throw new Error('Paste exactly one PGN game.');
  const game = games[0];
  const variant = game.headers.get('Variant');
  if (variant && !['standard', 'chess'].includes(variant.toLowerCase())) {
    throw new Error('This proof supports standard chess only.');
  }
  const pos = startingPosition(game.headers).unwrap();
  const frames: Frame[] = [];
  const moves: PlayedMove[] = [];
  const snapshot = () => frames.push({
    fen: makeFen(pos.toSetup()), turn: pos.turn, checkmate: pos.isCheckmate(),
    pieces: [...pos.board].map(([square, piece]) => ({ square, ...piece })),
  });
  snapshot();
  for (const node of game.moves.mainline()) {
    const move = parseSan(pos, node.san);
    if (!move) throw new Error(`Illegal move at ply ${moves.length + 1}: ${node.san}`);
    const color = pos.turn;
    const enPassant = 'from' in move && pos.board.getRole(move.from) === 'pawn'
      && move.to === pos.epSquare && !pos.board.has(move.to);
    // chessops represents castling as king-to-rook; standard UCI uses king-to-g/c.
    const castle = castlingSide(pos, move);
    const uci = castle && 'from' in move ? makeUci({ ...move, to: kingCastlesTo(color, castle) }) : makeUci(move);
    const san = makeSanAndPlay(pos, move);
    moves.push({ ply: moves.length + 1, san, uci, color, enPassant });
    snapshot();
  }
  if (!moves.length) throw new Error('No playable moves found in that PGN.');
  return {
    pgn: pgn.trim(), white: game.headers.get('White') ?? 'White',
    black: game.headers.get('Black') ?? 'Black', result: game.headers.get('Result') ?? '*',
    site: /^https:\/\/(?:www\.)?chess\.com\/game\/(?:live|daily)\/\d+/.test(game.headers.get('Link') ?? '')
      ? game.headers.get('Link')! : game.headers.get('Site') ?? '',
    timestamp: `${game.headers.get('UTCDate') ?? game.headers.get('Date') ?? ''} ${game.headers.get('UTCTime') ?? ''}`.trim(),
    frames, moves,
  };
}

// Recovered from the author's original Stockfish experiments (Git 8637c38).
export const SAMPLE_PGN = `[Event "rated rapid game"]
[Site "https://lichess.org/mKunkW9L"]
[White "sa6561"]
[Black "noctu2nality"]
[Result "1-0"]
[TimeControl "600+0"]

1. d4 Nf6 2. e3 g6 3. a3 Bg7 4. Nc3 O-O 5. Bd2 d6 6. h3 Nbd7 7. Nf3 c5 8. Be2 cxd4 9. exd4 b6 10. O-O Bb7 11. Be3 Rc8 12. Na2 Nd5 13. c4 N5f6 14. Nc3 Ne4 15. Rc1 Re8 16. Bd3 Nxc3 17. bxc3 e5 18. Be2 Ba6 19. Qb3 Qc7 20. Nd2 Nf6 21. Rfe1 Bb7 22. Nf3 Ne4 23. Bd3 Qe7 24. Nd2 Nxd2 25. Bxd2 Qh4 26. Be3 exd4 27. cxd4 Bxd4 28. Bxd4 Qxd4 29. Rcd1 Qf4 30. Qa2 Qg5 31. Bf1 Re7 32. Rxe7 Qxe7 33. Qd2 Qh4 34. Qxd6 Ba6 35. Rd4 Qg5 36. Qf4 Qxf4 37. Rxf4 Kg7 38. Bd3 Rc7 39. g3 h5 40. Kg2 Bb7+ 41. f3 Re7 42. Kf2 Rd7 43. Be4 Bxe4 44. Rxe4 Kf6 45. Ke3 Rd1 46. c5 bxc5 47. Rc4 Ra1 48. Rc3 c4 49. Rxc4 Rxa3+ 50. Ke4 a5 51. g4 hxg4 52. hxg4 Ke6 53. f4 f5+ 54. gxf5+ gxf5+ 55. Kd4 Rf3 56. Rc6+ Kd7 57. Ra6 Rxf4+ 58. Ke5 Rf1 59. Rxa5 f4 60. Ra2 Kc6 61. Ke4 Kd6 62. Ra3 f3 63. Ke3 Ke5 64. Ra2 Kf5 65. Ra5+ Kg4 66. Ra2 Kg3 67. Ra8 f2 68. Rg8+ Kh2 69. Rf8 1-0`;

// Black has a mate in one; this avoids relying on depth 6 discovering a long mate.
export const MATE_PGN = `[Event "Virtual finish example"]
[White "Example White"]
[Black "Example Black"]
[Result "*"]

1. f3 e5 2. g4 *`;

export function scoreLabel(score?: { type: 'cp' | 'mate'; value: number }): string {
  if (!score) return '—';
  if (score.type === 'mate') return `${score.value < 0 ? '−' : '+'}M${Math.abs(score.value)}`;
  return `${score.value >= 0 ? '+' : ''}${(score.value / 100).toFixed(2)}`;
}
