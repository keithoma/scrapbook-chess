import { expect, it } from 'vitest';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { parseGame } from '../game';
import { openingBook, polyglotKey, PolyglotBook } from './book';
import { recognizeOpening } from './recognition';

it('matches published Polyglot hashes including turn, castling and EP', () => {
  const pos = Chess.default();
  expect(polyglotKey(pos)).toBe(0x463b96181691fc9cn);
  for (const [san, expected] of [
    ['e4', 0x823c9b50fd114196n], ['d5', 0x0756b94461c50fb0n],
    ['e5', 0x662fafb965db29d4n], ['f5', 0x22a48b5a8e47ff78n],
  ] as const) {
    pos.play(parseSan(pos, san)!);
    expect(polyglotKey(pos)).toBe(expected);
  }
});
it('reads actual book moves and recognizes equivalent Jobava move orders', () => {
  for (const line of ['d4 d5 Nc3 Nf6 Bf4 e6 e3 Bd6 Nf3 O-O', 'd4 Nf6 Nc3 d5 Bf4', 'd4 d5 Bf4 Nf6 Nc3', 'd4 d5 Nc3 e6 Bf4']) {
    const pos = Chess.default();
    for (const san of line.split(' ')) {
      const move = parseSan(pos, san)!;
      expect(openingBook.has(pos, move)).toBe(true);
      pos.play(move);
    }
    expect(recognizeOpening(parseGame(`${line} 1-0`))).toMatchObject({ id: 'rapport-jobava', ply: 5 });
  }
  expect(recognizeOpening(parseGame('[Opening "Rapport-Jobava System"]\n\n1. d4 d5 2. Nf3 Nf6 3. Bf4 1-0'))).toBeUndefined();
  const setup = Chess.fromSetup(parseFen('8/8/8/8/8/8/5K2/7k w - - 0 1').unwrap()).unwrap();
  expect(openingBook.has(setup, parseSan(setup, 'Ke3')!)).toBe(false);
  expect(() => new PolyglotBook(new Uint8Array(3))).toThrow();
});
