import { expect, it } from 'vitest';
import { analyzed } from '../fixtures/test-analysis';
import { cleanGainFixture } from '../fixtures/clean-gain-evidence';
import { BADGES } from './catalog';
import { contributions, prepareGrant, projectCollection } from './collection';
import { parseGame } from '../game';

for (const [role, id] of [
  ['pawn', 'badge_clean_pawns'], ['knight', 'badge_clean_knight'], ['bishop', 'badge_clean_bishop'],
  ['rook', 'badge_clean_rook'], ['queen', 'badge_clean_queen'],
] as const) {
  it(`${id} awards a confirmed actual capture without a survival delay and retains its saved evidence`, () => {
    for (const black of [false, true]) {
      const { game, evidence } = cleanGainFixture(role, black);
      const color = black ? 'black' : 'white';
      const checkpoint = { ...analyzed(game), cleanGains: [evidence] };
      const events = () => contributions(game, color, checkpoint).filter(event => event.kind === 'badge' && event.badgeId === id);
      expect(events()).toMatchObject([{ ply: 2, originPly: 1, amount: 1, evidence: { rule: 'clean-gains-v2', depth: 14 } }]);
      const saved = prepareGrant([], game, color, checkpoint);
      const again = prepareGrant([saved], game, color);
      expect(projectCollection([again]).totals[id]).toBe(1);
      expect(projectCollection([prepareGrant([saved], game, black ? 'white' : 'black')]).totals[id]).toBe(0);
      checkpoint.cleanGains = [];
      expect(events()).toEqual([]);
      expect(contributions(game, color).some(event => event.kind === 'badge' && event.badgeId === id)).toBe(false);
    }
  });
}
it('does not award compensated captures or missing, partial, malformed or mismatched evidence', () => {
  const { game, evidence } = cleanGainFixture();
  const checkpoint = { ...analyzed(game), cleanGains: [evidence] };
  const events = () => contributions(game, 'white', checkpoint).filter(event => event.kind === 'badge' && event.badgeId === 'badge_clean_pawns');
  for (const sample of evidence.attempts[0].samples) sample.after.score.value = 50;
  expect(events()).toEqual([]);
  evidence.attempts[0].samples.length = 1;
  expect(events()).toEqual([]);
  checkpoint.pgn += ' ';
  expect(events()).toEqual([]);
});
it('the catalog uses the shared engine rule rather than a survival window', () => {
  for (const badge of BADGES.filter(badge => badge.subcategory === 'Clean Gains')) {
    expect(badge.config).not.toHaveProperty('survival_plies');
    expect(badge.description).toContain('80%');
  }
});

it('cannot repeatedly spend one concession’s evaluation budget on different captured pawns', () => {
  const game = parseGame('[SetUp "1"]\n[FEN "7k/6p1/3p4/6p1/8/8/6P1/K2R4 b - - 0 1"]\n\n1... d5 2. Rxd5 Kh7 3. Rxg5 1-0');
  const first = cleanGainFixture().evidence;
  const second = structuredClone(first);
  second.capturePly = 4; second.attempts[0].capturePly = 4;
  const quiet = ['h7h6', 'a1a2', 'h6h7', 'a2a1', 'h7h6', 'a1a2'];
  for (const evidence of [first, second]) for (const sample of evidence.attempts[0].samples) {
    const capture = evidence.capturePly;
    const lines = {
      before: [...game.moves.map(move => move.uci), ...quiet],
      conceded: [...game.moves.slice(1).map(move => move.uci), ...quiet],
      captureBest: [...game.moves.slice(capture - 1).map(move => move.uci), ...quiet],
      after: [...game.moves.slice(capture).map(move => move.uci), ...quiet],
    };
    for (const field of ['before', 'conceded', 'captureBest', 'after'] as const) {
      sample[field].pv = lines[field]; sample[field].uci = lines[field][0];
    }
  }
  const checkpoint = { ...analyzed(game), cleanGains: [first, second] };
  const events = contributions(game, 'white', checkpoint).filter(event => event.kind === 'badge' && event.badgeId === 'badge_clean_pawns');
  expect(events).toHaveLength(1);
});
