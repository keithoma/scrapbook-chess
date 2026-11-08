import { describe, expect, it } from 'vitest';
import { MATE_PGN, SAMPLE_PGN, parseGame } from './game';
import { parseScore } from './stockfish';

describe('legal replay and UCI boundary', () => {
  it('uses a Chess.com Link header as the source identity while preserving the original PGN', () => {
    const pgn = '[Site "Chess.com"]\n[Link "https://www.chess.com/game/live/999001"]\n\n1. f3 e5 2. g4 Qh4# 0-1';
    const game = parseGame(pgn);
    expect(game.site).toBe('https://www.chess.com/game/live/999001');
    expect(game.pgn).toBe(pgn);
  });
  it('replays the entire original experiment without changing the moves', () => {
    const game = parseGame(SAMPLE_PGN);
    expect(game.moves).toHaveLength(137);
    expect(game.frames).toHaveLength(138);
    expect(game.moves.at(-1)?.san).toBe('Rf8');
    expect(game.moves.find(m => m.san === 'O-O')?.uci).toBe('e8g8');
    expect(game.frames[0].pieces).toHaveLength(32);
    expect(game.pgn).toBe(SAMPLE_PGN);
  });
  it('recognizes actual checkmate and rejects illegal moves', () => {
    const game = parseGame(`${MATE_PGN.replace('2. g4 *', '2. g4 Qh4# 0-1')}`);
    expect(game.frames.at(-1)?.checkmate).toBe(true);
    expect(() => parseGame('1. e4 e5 2. Bh6 *')).toThrow(/Illegal move/);
    expect(() => parseGame('nothing here')).toThrow();
  });
  it('handles en passant and underpromotion from legal positions', () => {
    const ep = parseGame('1. e4 a6 2. e5 d5 3. exd6 *');
    expect(ep.frames.at(-1)?.pieces).toHaveLength(31);
    const promotion = parseGame('[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/7K w - - 0 1"]\n\n1. a8=N *');
    expect(promotion.moves[0].uci).toBe('a7a8n');
  });
  it('keeps scores on White’s perspective and ignores incomplete bounds', () => {
    expect(parseScore('info depth 6 score cp 125 pv e2e4', 'black')).toEqual({ type: 'cp', value: -125 });
    expect(parseScore('info depth 6 score mate 1 pv d8h4', 'black')).toEqual({ type: 'mate', value: -1 });
    expect(parseScore('info depth 6 score cp 50 lowerbound', 'white')).toBeUndefined();
  });
});
