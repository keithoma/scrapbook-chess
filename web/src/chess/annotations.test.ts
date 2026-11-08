import { afterEach, expect, it, vi } from 'vitest';
import { Chess, normalizeMove } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';
import { parseGame } from '../game';
import { analyzed } from '../fixtures/test-analysis';
import { openingBook, polyglotKey } from '../openings/book';
import { annotateMoves, createMoveAnnotator } from './annotations';

afterEach(() => vi.restoreAllMocks());

it('annotates both players without selecting a profile side or recognizing a named opening', () => {
  const game = parseGame('1. e4 e5 2. Nf3 Nc6 *');
  const results = analyzed(game).results;
  const annotations = annotateMoves(game, results);
  expect(annotations.map(result => result.annotations?.book.status)).toEqual(Array(4).fill('candidate'));
  expect(results.every(result => !result.annotations)).toBe(true);
  const lookup = openingBook.lookup.bind(openingBook);
  vi.spyOn(openingBook, 'lookup').mockImplementation((pos, move) => {
    const evidence = lookup(pos, move);
    return evidence && { ...evidence, games: 100, losses: 40 };
  });
  expect(annotateMoves(game, results).every(result => result.annotations?.book.status === 'book')).toBe(true);
  results[0].played.value = -111; // White mistake.
  results[1].played.value = 169; // Black blunder, in White's evaluation perspective.
  expect(annotateMoves(game, results).slice(0, 2).map(result => result.annotations)).toMatchObject([
    { quality: 'mistake', book: { status: 'outside', reason: 'quality' } },
    { quality: 'blunder', book: { status: 'outside', reason: 'quality' } },
  ]);
});

it('recomputes stale annotations and permits inaccuracies below the mistake threshold', () => {
  const game = parseGame('1. d4 d5 *');
  const results = analyzed(game).results;
  results[0].played.value = -110;
  const stale = annotateMoves(game, results);
  stale[0].annotations!.book.status = 'book';
  stale[0].annotations!.book.ruleVersion = 'obsolete';
  expect(annotateMoves(game, stale)[0].annotations).toMatchObject({
    quality: 'clean', book: { status: 'candidate', ruleVersion: 'book-move-v1' },
  });
});

it('preserves the position across resume and normalizes standard castling', () => {
  const game = parseGame('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. O-O *');
  const results = analyzed(game).results;
  const annotate = createMoveAnnotator(game);
  const resumed = [...results.slice(0, 3).map(annotate), ...results.slice(3).map(annotate)];
  expect(resumed).toEqual(annotateMoves(game, results));
  expect(resumed.at(-1)!.annotations!.book.status).toBe('candidate');
});

it('retains a pinned en passant square that display FEN removes', () => {
  const game = parseGame('[SetUp "1"]\n[FEN "k3r3/3p4/8/4P3/8/8/8/4K3 b - - 0 1"]\n\n1... d5 2. Kf2 *');
  const initial = Chess.fromSetup(parseFen(game.frames[0].fen).unwrap()).unwrap();
  initial.play(normalizeMove(initial, parseUci(game.moves[0].uci)!));
  const expected = polyglotKey(initial);
  const observed: bigint[] = [];
  vi.spyOn(openingBook, 'lookup').mockImplementation(pos => { observed.push(polyglotKey(pos)); return undefined; });
  annotateMoves(game, analyzed(game).results);
  expect(game.frames[1].fen.split(' ')[3]).toBe('-');
  expect(observed[1]).toBe(expected);
  expect(observed[1]).not.toBe(polyglotKey(Chess.fromSetup(parseFen(game.frames[1].fen).unwrap()).unwrap()));
});
