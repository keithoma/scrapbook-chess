import { expect, it } from 'vitest';
import { parseGame } from '../game';
import { analyzed } from '../fixtures/test-analysis';
import { BADGES } from './catalog';
import { contributions, prepareGrant, projectCollection } from './collection';
const candidates = [
  ['badge_clean_pawns', 'p'],
  ['badge_clean_knight', 'n'],
  ['badge_clean_bishop', 'b'],
  ['badge_clean_rook', 'r'],
  ['badge_clean_queen', 'q'],
] as const;
function capture(piece: string, black = false, exchange = false) {
  const fen = black
    ? `k2r4/8/8/8/3${piece.toUpperCase()}4/8/6P1/7K b - - 0 1`
    : `${exchange ? '3r3k' : '7k'}/6p1/8/3${piece}4/8/8/8/K2R4 w - - 0 1`;
  const moves = black
    ? '1... Rxd4 2. Kh2 Rd5 3. Kh1 Rd4 4. Kh2 Rd5 5. Kh1 Rd4 6. Kh2 Rd5 0-1'
    : exchange
      ? '1. Rxd5 Rxd5 2. Ka2 Kh7 3. Ka3 Kh8 4. Ka2 Kh7 5. Ka3 Kh8 6. Ka2 0-1'
      : '1. Rxd5 Kh7 2. Rd4 Kh8 3. Rd5 Kh7 4. Rd4 Kh8 5. Rd5 Kh7 6. Rd4 1-0';
  return parseGame(`[SetUp "1"]\n[FEN "${fen}"]\n\n${moves}`);
}
for (const [id, piece] of candidates.filter(([id]) => BADGES.some((b) => b.id === id))) {
  it(`${id} confirms retained material after ten actual plies, gates move quality and keeps saved evidence`, () => {
    for (const black of [false, true]) {
      const game = capture(piece, black);
      const color = black ? 'black' : 'white';
      const checkpoint = analyzed(game);
      const events = () =>
        contributions(game, color, checkpoint).filter(
          (e) => e.kind === 'badge' && e.badgeId === id,
        );
      expect(events()).toMatchObject([{ ply: 11, originPly: 1, amount: 1 }]);
      const saved = prepareGrant([], game, color, checkpoint);
      const again = prepareGrant([saved], game, color);
      expect(
        projectCollection([again]).totals[
          id as keyof ReturnType<typeof projectCollection>['totals']
        ],
      ).toBe(1);
      expect(
        projectCollection([prepareGrant([saved], game, black ? 'white' : 'black')]).totals[
          id as keyof ReturnType<typeof projectCollection>['totals']
        ],
      ).toBe(0);
      checkpoint.results[0].played.value = black ? 111 : -111;
      expect(events()).toEqual([]);
      checkpoint.results[0].played.value = black ? 110 : -110;
      expect(events()).toHaveLength(1);
      expect(contributions(game, color).some((e) => e.kind === 'badge' && e.badgeId === id)).toBe(
        false,
      );
      const short = { ...game, moves: game.moves.slice(0, 10), frames: game.frames.slice(0, 11) };
      expect(
        contributions(short, color, analyzed(short)).some(
          (e) => e.kind === 'badge' && e.badgeId === id,
        ),
      ).toBe(false);
      const partial = { ...checkpoint, results: checkpoint.results.slice(0, 1) };
      partial.results[0].played.value = 0;
      expect(
        contributions(game, color, partial).filter((e) => e.kind === 'badge' && e.badgeId === id),
      ).toHaveLength(1);
    }
    const exchange = capture(piece, false, true);
    expect(
      contributions(exchange, 'white', analyzed(exchange)).some(
        (e) => e.kind === 'badge' && e.badgeId === id,
      ),
    ).toBe(false);
  });
}
