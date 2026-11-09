import { expect, it } from 'vitest';
import { parseGame } from '../game';
import { cleanGainFixture } from '../fixtures/clean-gain-evidence';
import { CLEAN_GAIN_EXAMPLES } from '../fixtures/clean-gain-examples';
import {
  assessCleanGain, cleanGainBookGate, cleanGainCandidates, materialLine, validCleanGainEvidence,
  mergeCleanGainEvidence,
} from './clean-gain';
import { openingBook } from '../openings/book';

const outside = () => undefined;
for (const role of ['pawn', 'knight', 'bishop', 'rook', 'queen'] as const) {
  for (const black of [false, true]) {
    it(`requires 80% of the full ${role} value for ${black ? 'black' : 'white'} and includes the boundary`, () => {
      const { game, evidence } = cleanGainFixture(role, black);
      expect(validCleanGainEvidence(game, evidence)).toBe(true);
      expect(assessCleanGain(game, evidence, outside)).toMatchObject({ status: 'qualified', reason: 'settled' });
      for (const sample of evidence.attempts[0].samples) sample.after.score.value += black ? 1 : -1;
      expect(assessCleanGain(game, evidence, outside)).toMatchObject({ status: 'rejected', reason: 'compensation' });
    });
  }
}
it('requires the evaluation improvement to originate in the opponent’s material-conceding move', () => {
  const { game, evidence } = cleanGainFixture();
  for (const sample of evidence.attempts[0].samples) sample.conceded.score.value = 50;
  expect(assessCleanGain(game, evidence, outside)).toMatchObject({ status: 'rejected', reason: 'compensation' });
});
it('requires successive, agreeing deeper searches, rather than a single favorable score', () => {
  const { game, evidence } = cleanGainFixture();
  const samples = evidence.attempts[0].samples;
  samples[0].after.score.value = 140;
  expect(assessCleanGain(game, evidence, outside).status).toBe('pending');
  samples.push({ ...structuredClone(samples[1]), depth: 18 });
  for (const field of ['before', 'conceded', 'captureBest', 'after'] as const) samples[2][field].depth = 18;
  expect(assessCleanGain(game, evidence, outside).status).toBe('qualified');
  samples.splice(0, 1);
  expect(validCleanGainEvidence(game, evidence)).toBe(false);
});
it('does not treat a truncated or tactically unfinished PV as a settled position', () => {
  const { game, evidence } = cleanGainFixture();
  for (const sample of evidence.attempts[0].samples) sample.after.pv = sample.after.pv!.slice(0, 2);
  expect(assessCleanGain(game, evidence, outside)).toMatchObject({ status: 'pending', reason: 'unsettled-line' });
});
it('replays every move and refuses illegal, missing, mismatched, oversized, stale and mate evidence', () => {
  const { game, evidence } = cleanGainFixture();
  for (const alter of [
    (e: typeof evidence) => { e.attempts[0].samples[1].after.pv = ['h8h1']; },
    (e: typeof evidence) => { delete e.attempts[0].samples[1].after.pv; },
    (e: typeof evidence) => { e.attempts[0].samples[1].after.pv![1] = 'a1a8'; },
    (e: typeof evidence) => { e.attempts[0].samples[1].after.pv = Array(65).fill('h8h7'); },
    (e: typeof evidence) => { e.attempts[0].capturePly = 1; },
    (e: typeof evidence) => { e.attempts[0].samples.reverse(); },
  ]) {
    const bad = structuredClone(evidence); alter(bad);
    expect(validCleanGainEvidence(game, bad)).toBe(false);
    expect(assessCleanGain(game, bad, outside).status).toBe('pending');
  }
  for (const sample of evidence.attempts[0].samples) sample.after.score = { type: 'mate', value: 3 };
  expect(assessCleanGain(game, evidence, outside).status).toBe('pending');
  evidence.ruleVersion = 'old';
  expect(assessCleanGain(game, evidence, outside).status).toBe('pending');
});
it('does not require later recorded moves, and later blunders cannot revoke the original capture', () => {
  const { game, evidence } = cleanGainFixture();
  const extended = parseGame(game.pgn.replace('1-0', '2... Kh7 3. Rd8 g6 4. Rh8+ Kxh8 0-1'));
  expect(assessCleanGain(game, evidence, outside).status).toBe('qualified');
  expect(assessCleanGain(extended, evidence, outside).status).toBe('qualified');
});
it('counts net material over the whole sequence, excluding ordinary trades', () => {
  const game = parseGame('1. e4 d5 2. exd5 Qxd5 3. Nc3 *');
  expect(cleanGainCandidates(game, 4)).toEqual([]); // Black recovered the pawn, rather than winning one.
  const { game: existing } = cleanGainFixture();
  const alreadyHanging = { ...existing, moves: existing.moves.slice(1).map(move => ({ ...move, ply: 1 })), frames: existing.frames.slice(1) };
  expect(cleanGainCandidates(alreadyHanging, 1)).toEqual([]);
});
it('detects delayed material returns even across a quiet interval in a legal continuation', () => {
  const fen = '7k/6p1/8/3r4/8/8/6P1/K7 w - - 0 1';
  const line = parseGame(`[SetUp "1"]\n[FEN "${fen}"]\n\n1. Ka2 Rd8 2. Ka1 Rd2 3. Kb1 Rxg2 4. Ka1 Rg1+ 5. Kb2 *`);
  const pv = line.moves.map(move => move.uci);
  const pick = { uci: pv[0], pv, depth: 14, score: { type: 'cp' as const, value: 0 } };
  expect(materialLine(fen, pick, 'white', 0)).toMatchObject({ gainCp: -600, settled: false });
});
it('rejects a materially poisoned capture even when the supplied evaluation gain is large enough', () => {
  const game = parseGame('[SetUp "1"]\n[FEN "3r3k/6p1/2p5/8/8/8/6P1/K1R5 b - - 0 1"]\n\n1... c5 2. Rxc5 *');
  const continuation = parseGame(`[SetUp "1"]\n[FEN "${game.frames[2].fen}"]\n\n2... Rd5 3. Ka2 Rxc5 4. Ka3 Rc8 5. Ka2 Rc7 6. Ka3 Rc8 *`);
  const { evidence } = cleanGainFixture();
  for (const sample of evidence.attempts[0].samples) {
    const after = continuation.moves.map(move => move.uci);
    for (const [field, pv] of [
      ['before', [...game.moves.map(move => move.uci), ...after]],
      ['conceded', [game.moves[1].uci, ...after]],
      ['captureBest', [game.moves[1].uci, ...after]], ['after', after],
    ] as const) { sample[field].pv = [...pv]; sample[field].uci = pv[0]; }
  }
  expect(validCleanGainEvidence(game, evidence)).toBe(true);
  expect(assessCleanGain(game, evidence, outside)).toMatchObject({ status: 'rejected', reason: 'material-returned', materialGainCp: -400 });
});
it('excludes book entries with missing outcomes and admits only a verified below-30%-wins trap', () => {
  expect(cleanGainBookGate()).toBe('outside');
  for (const evidence of [
    { weight: 1 }, { weight: 1, games: 100, losses: 80 },
    { weight: 1, games: 24, wins: 0 }, { weight: 1, games: 100, wins: 30 },
    { weight: 1, games: 100, wins: 40 }, { weight: 1, games: 100, wins: -1 },
    { weight: 1, games: 100, wins: 20, losses: 90 },
  ]) expect(cleanGainBookGate(evidence)).toBe('excluded');
  expect(cleanGainBookGate({ weight: 1, games: 100, wins: 29, losses: 50 })).toBe('trap');
  const { game, evidence } = cleanGainFixture();
  expect(assessCleanGain(game, evidence, () => ({ weight: 1 })).reason).toBe('book');
  expect(assessCleanGain(game, evidence, () => ({ weight: 1, games: 100, wins: 29 })).status).toBe('qualified');
  const gambit = parseGame(CLEAN_GAIN_EXAMPLES.find(example => example.name === 'King’s Gambit')!.pgn);
  const candidate = cleanGainCandidates(gambit, 4).find(candidate => candidate.concessionPly === 3)!;
  expect(candidate).toBeDefined();
  expect(assessCleanGain(gambit, { ruleVersion: 'clean-gains-v2', capturePly: 4, attempts: [{ ...candidate, samples: [] }] },
    openingBook.lookup.bind(openingBook))).toMatchObject({ status: 'rejected', reason: 'book' });
});

it('replays castling, en passant and promotions using legal board material rather than capture notation', () => {
  for (const [pgn, expected] of [
    ['1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. O-O Be7 5. Re1 O-O *', 0],
    ['1. e4 a6 2. e5 d5 3. exd6 *', 100],
    ['[SetUp "1"]\n[FEN "7k/P7/8/8/8/8/8/K7 w - - 0 1"]\n\n1. a8=Q+ *', 900],
  ] as const) {
    const game = parseGame(pgn);
    const pv = game.moves.map(move => move.uci);
    expect(materialLine(game.frames[0].fen, { uci: pv[0], pv, depth: 14, score: { type: 'cp', value: 0 } }, 'white', 0)?.gainCp).toBe(expected);
  }
});

it('preserves complete evidence when an older or budget-limited checkpoint is synchronized', () => {
  const { evidence } = cleanGainFixture();
  expect(mergeCleanGainEvidence([evidence], undefined)).toEqual([evidence]);
  expect(mergeCleanGainEvidence([evidence], [{ ...evidence, attempts: [], budgetExhausted: true }])).toEqual([evidence]);
  expect(mergeCleanGainEvidence([{ ...evidence, budgetExhausted: true }], [evidence])).toEqual([evidence]);
});
