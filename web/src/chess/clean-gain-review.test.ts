import { expect, it } from 'vitest';
import { cleanGainFixture } from '../fixtures/clean-gain-evidence';
import { assessCleanGain } from './clean-gain';
import { cleanReviewFilename, parseCleanGainReview, reviewedBook, type CleanGainReview } from './clean-gain-review';
import { parseGame } from '../game';
import { ANALYSIS_VERSION } from '../storage';
import realEngineCase from '../fixtures/clean-gain-engine/loose-pawn.json';

function review(): CleanGainReview {
  const { game, evidence } = cleanGainFixture();
  return { schemaVersion: 1, pgn: game.pgn, capturePly: 2, expected: 'clean', note: '', evidence, book: [], analysisVersion: ANALYSIS_VERSION };
}
function assertJudgment(review: CleanGainReview) {
  const fixture = parseCleanGainReview(review);
  const assessment = assessCleanGain(parseGame(fixture.pgn), fixture.evidence, reviewedBook(fixture));
  expect(assessment.status === 'qualified', fixture.note || 'Saved clean-material judgment disagrees with the detector')
    .toBe(fixture.expected === 'clean');
}
it('runs the shared detector against the human expectation, independently of the observation', () => {
  const fixture = review();
  assertJudgment(fixture);
  expect(() => assertJudgment({ ...fixture, expected: 'not-clean' })).toThrow('judgment disagrees');
});
it('gives revised judgments the same filename and separates different games and captures', async () => {
  const fixture = review();
  expect(await cleanReviewFilename(fixture)).toBe(await cleanReviewFilename({ ...fixture, pgn: ` ${fixture.pgn}\n` }));
  expect(await cleanReviewFilename(fixture)).not.toBe(await cleanReviewFilename({ ...fixture, capturePly: 4 }));
});
it('refuses malformed fixtures and illegal evidence', () => {
  const fixture = review();
  for (const bad of [null, {}, { ...fixture, expected: 'yes' }, { ...fixture, evidence: {} },
    { ...fixture, capturePly: 1 }, { ...fixture, note: 'x'.repeat(2001) },
    { ...fixture, book: [{ fen: 'bad', uci: 'a1a2', evidence: { weight: 1 } }] }])
    expect(() => parseCleanGainReview(bad)).toThrow();
});
const reviews = import.meta.glob<CleanGainReview>('../fixtures/clean-gain-reviews/*.json', { eager: true, import: 'default' });
for (const [path, fixture] of Object.entries(reviews)) it(`honors saved clean-material judgment: ${path}`, () => assertJudgment(fixture));

it('replays a captured real Stockfish continuation through the current rule', () => {
  assertJudgment(parseCleanGainReview(realEngineCase));
});
