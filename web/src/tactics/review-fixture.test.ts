import { expect, it } from 'vitest';
import { parseGame } from '../game';
import { ANALYSIS_VERSION, type Checkpoint } from '../storage';
import { masteryContributions, TACTICAL_MASTERIES } from '../achievements/mastery';
import forkPgn from '../fixtures/games/knight-fork.pgn?raw';
import skewerPgn from '../fixtures/games/skewer.pgn?raw';
import { tacticalReviewFilename, type TacticalReviewFixture } from './review-fixture';

function assertJudgment(fixture: TacticalReviewFixture) {
  expect(fixture.schemaVersion).toBe(1);
  expect(TACTICAL_MASTERIES.map(mastery => mastery.id)).toContain(fixture.masteryId);
  expect(['positive', 'zero']).toContain(fixture.expectedXp);
  expect(fixture.analysis.result.ply).toBe(fixture.ply);
  const game = parseGame(fixture.pgn);
  const move = game.moves.find(move => move.ply === fixture.ply)!;
  expect(move).toBeDefined();
  const checkpoint: Checkpoint = {
    key: 'tactical-review-fixture', pgn: game.pgn,
    // Freeze captured scores and exercise today's award rules, independently of
    // engine updates. The fixture retains the original analysis provenance.
    version: ANALYSIS_VERSION, results: [{ ...fixture.analysis.result, ms: 0 }],
    virtual: [], virtualStatus: 'pending', updatedAt: '',
  };
  const xp = masteryContributions(game, move.color, checkpoint)
    .find(event => event.masteryId === fixture.masteryId && event.ply === fixture.ply)?.amount ?? 0;
  if (fixture.expectedXp === 'positive') expect(xp, 'Reviewed tactic should earn some XP').toBeGreaterThan(0);
  else expect(xp, 'Reviewed tactic should earn 0 XP').toBe(0);
}

function fixture(pgn: string, masteryId: string, expectedXp: 'positive' | 'zero'): TacticalReviewFixture {
  const game = parseGame(pgn);
  return {
    schemaVersion: 1, pgn: game.pgn, masteryId, ply: 1, expectedXp,
    analysis: {
      version: ANALYSIS_VERSION,
      result: { ply: 1, bestMove: game.moves[0].uci, best: { type: 'cp', value: 0 }, played: { type: 'cp', value: 0 } },
    },
    observed: { status: 'pending', xp: 0 },
  };
}

it('checks positive and zero XP judgments for both tactical tracks through the shared award rules', () => {
  for (const review of [
    fixture(forkPgn, 'mastery_knight_forks', 'positive'),
    fixture('[SetUp "1"]\n[FEN "k3r3/8/8/8/3N4/2r3r1/8/4K3 w - - 0 1"]\n\n1. Ne2 *', 'mastery_knight_forks', 'zero'),
    fixture(skewerPgn, 'mastery_skewers', 'positive'),
    fixture('[SetUp "1"]\n[FEN "8/8/8/3kr2q/8/8/8/RK6 w - - 0 1"]\n\n1. Ra5+ 1-0', 'mastery_skewers', 'zero'),
    fixture('[SetUp "1"]\n[FEN "6kr/8/8/8/Q3K3/8/8/8 b - - 0 1"]\n\n1... Rh4+ 0-1', 'mastery_skewers', 'positive'),
  ]) assertJudgment(review);
});

it('reports disagreements with the human label instead of accepting the recorded observation as truth', () => {
  const review = fixture(forkPgn, 'mastery_knight_forks', 'positive');
  assertJudgment(review);
  expect(() => assertJudgment({ ...review, expectedXp: 'zero' })).toThrow('should earn 0 XP');
  const badQuality = structuredClone(review);
  badQuality.analysis.result.played.value = -10_000;
  expect(() => assertJudgment(badQuality)).toThrow('should earn some XP');
});

it('keys a review by game, ply, and mastery rather than by the selected judgment', async () => {
  const review = fixture(forkPgn, 'mastery_knight_forks', 'positive');
  const filename = await tacticalReviewFilename(review);
  expect(await tacticalReviewFilename({ ...review, pgn: `  ${review.pgn}\n` })).toBe(filename);
  expect(await tacticalReviewFilename({ ...review, masteryId: 'mastery_skewers' })).not.toBe(filename);
  expect(await tacticalReviewFilename({ ...review, ply: 2 })).not.toBe(filename);
  expect(await tacticalReviewFilename({ ...review, pgn: skewerPgn })).not.toBe(filename);
});

// Every saved developer judgment automatically becomes a named regression test.
const reviews = import.meta.glob<TacticalReviewFixture>('../fixtures/tactical-reviews/*.json', {
  eager: true, import: 'default',
});
for (const [path, review] of Object.entries(reviews)) {
  it(`honors saved tactical judgment: ${path}`, () => assertJudgment(review));
}
