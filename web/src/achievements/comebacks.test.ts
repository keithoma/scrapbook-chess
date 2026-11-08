import { expect, it } from 'vitest';
import { parseGame, SAMPLE_PGN } from '../game';
import { analyzed } from '../fixtures/test-analysis';
import { BADGES } from './catalog';
import { divideGame } from './phases';
import { contributions, prepareGrant, projectCollection } from './collection';
function phaseGame(plies: number, result = '1-0') {
  const moves = parseGame(SAMPLE_PGN)
    .moves.slice(0, plies)
    .map((m, i) => `${i % 2 === 0 ? `${i / 2 + 1}. ` : ''}${m.san}`)
    .join(' ');
  return parseGame(`${moves} ${result}`);
}
const cases = [
  ['badge_comeback_1_5_late', 137, 150, 'late'],
  ['badge_comeback_2_0_fast', 40, 200, 'middle'],
  ['badge_comeback_3_0_mid', 40, 300, 'middle'],
  ['badge_comeback_endgame_2_0', 137, 200, 'end'],
] as const;
for (const [id, plies, deficit, boundary] of cases.filter(([id]) =>
  BADGES.some((b) => b.id === id),
)) {
  it(`${id} uses Lichess phase boundary evaluations, player perspective and exact deficits`, () => {
    for (const color of ['white', 'black'] as const) {
      const game = phaseGame(plies, color === 'white' ? '1-0' : '0-1');
      const checkpoint = analyzed(game);
      const division = divideGame(game);
      const origin = boundary === 'end' ? division.end! : division.middle!;
      const sign = color === 'white' ? -1 : 1;
      const events = () =>
        contributions(game, color, checkpoint).filter(
          (e) => e.kind === 'badge' && String(e.badgeId) === id,
        );
      checkpoint.results[origin].best.value = sign * deficit;
      if (boundary === 'late') checkpoint.results[division.end!].best.value = sign * deficit;
      expect(events()).toMatchObject([{ ply: game.moves.length, originPly: origin, amount: 1 }]);
      const saved = prepareGrant([], game, color, checkpoint);
      expect(
        projectCollection([prepareGrant([saved], game, color)]).totals[
          id as keyof ReturnType<typeof projectCollection>['totals']
        ],
      ).toBe(1);
      checkpoint.results[origin].best.value = sign * (deficit - 1);
      expect(events()).toEqual([]);
      checkpoint.results[origin].best = { type: 'mate', value: sign * 3 };
      expect(events()).toHaveLength(1);
      checkpoint.results.pop();
      expect(events()).toEqual([]);
    }
    const draw = phaseGame(plies, '1/2-1/2');
    const cp = analyzed(draw, -deficit);
    const result = contributions(draw, 'white', cp).some(
      (e) => e.kind === 'badge' && String(e.badgeId) === id,
    );
    expect(result).toBe(boundary === 'end');
    const opening = phaseGame(2);
    expect(
      contributions(opening, 'white', analyzed(opening, -1000)).some(
        (e) => e.kind === 'badge' && String(e.badgeId) === id,
      ),
    ).toBe(false);
    if (id === 'badge_comeback_2_0_fast') {
      const slow = phaseGame(137);
      expect(
        contributions(slow, 'white', analyzed(slow, -200)).some(
          (e) => e.kind === 'badge' && String(e.badgeId) === id,
        ),
      ).toBe(false);
    }
  });
}
