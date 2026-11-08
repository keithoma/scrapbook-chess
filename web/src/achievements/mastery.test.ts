import { describe, expect, it } from 'vitest';
import { parseGame } from '../game';
import { RECENT_GAME_PGN } from '../fixtures';
import ne2Pgn from '../fixtures/games/halce-noctu2nality-ne2.pgn?raw';
import nxd4Pgn from '../fixtures/games/halce-noctu2nality-nxd4.pgn?raw';
import { analyzed } from '../fixtures/test-analysis';
import { ANALYSIS_VERSION, type Checkpoint } from '../storage';
import { knightForkCandidates } from '../tactics/knight-forks';
import { forkMaterialThreat } from '../tactics/fork-material';
import {
  assessFork,
  FORK_MASTERY,
  TACTICAL_GRADES,
  forkGrade,
  gradeForContribution,
  withMasteryGrade,
  masteryProgress,
  qualityXp,
} from './mastery';
import {
  contributions,
  newlyUnlocked,
  projectCollection,
  retainMastery,
  prepareGrant,
  type GameGrant,
} from './collection';

const pgn = '[SetUp "1"]\n[FEN "3r3k/8/8/4N3/8/8/7K/3r4 w - - 0 1"]\n\n1. Nf7+ 1-0';
const game = parseGame(pgn);
const fork = knightForkCandidates(game)[0];
function checkpoint(loss = 0): Checkpoint {
  return {
    key: 'test',
    version: ANALYSIS_VERSION,
    pgn: game.pgn,
    results: [
      {
        ply: 1,
        best: { type: 'cp', value: 200 },
        played: { type: 'cp', value: 200 - loss },
        bestMove: 'e5f7',
        ms: 1,
      },
    ],
    virtual: [],
    virtualStatus: 'pending',
    updatedAt: '',
  };
}
function grant(events = contributions(game, 'white', checkpoint())): GameGrant {
  return {
    id: 'game',
    version: 1,
    pgn: game.pgn,
    color: 'white',
    events,
    collectedAt: '',
    updatedAt: '',
  };
}
describe('material qualification', () => {
  it('validates winning an exchange after every legal king reply and accounts for recapture', () => {
    expect(forkMaterialThreat(game, fork)).toMatchObject({
      status: 'qualified',
      gainCp: 200,
      capture: 'Nxd8',
    });
  });
  it('validates a royal queen fork for both colors without needing a played capture', () => {
    for (const [fen, move] of [
      ['3q3k/8/8/4N3/8/8/8/7K w - - 0 1', 'Nf7+'],
      ['7k/8/8/8/4n3/8/8/3Q3K b - - 0 1', 'Nf2+'],
    ]) {
      const example = parseGame(`[SetUp "1"]\n[FEN "${fen}"]\n\n${move} *`);
      expect(forkMaterialThreat(example, knightForkCandidates(example)[0])).toMatchObject({
        status: 'qualified',
        gainCp: 900,
      });
    }
  });
  it('rejects defended pawn attacks, pinned knights, and the recapturable Nxe3 from the actual game', () => {
    for (const [fen, move, reason] of [
      ['2rr3k/3p4/8/8/2p5/3N4/8/7K w - - 0 1', 'Ne5', 'no-gain'],
      ['k3r3/8/8/8/3N4/2r3r1/8/4K3 w - - 0 1', 'Ne2', 'pinned'],
    ]) {
      const example = parseGame(`[SetUp "1"]\n[FEN "${fen}"]\n\n${move} *`);
      expect(forkMaterialThreat(example, knightForkCandidates(example)[0])).toEqual({
        status: 'rejected',
        reason,
      });
    }
    const recent = parseGame(RECENT_GAME_PGN);
    expect(
      forkMaterialThreat(
        recent,
        knightForkCandidates(recent).find((candidate) => candidate.ply === 30)!,
      ),
    ).toEqual({ status: 'rejected', reason: 'capturable' });
  });
  it('rejects a queen-and-rook fork when a countercheck prevents the knight from taking its target', () => {
    const example = parseGame('[SetUp "1"]\n[FEN "7k/8/1q3r2/8/8/2N5/7K/8 w - - 0 1"]\n\n1. Nd5 *');
    const candidate = knightForkCandidates(example)[0];
    expect(candidate.capturable).toBe(false);
    expect(candidate.pinned).toBe(false);
    expect(forkMaterialThreat(example, candidate)).toEqual({
      status: 'rejected',
      reason: 'no-gain',
    });
  });
});
describe('quality-based XP and levels', () => {
  it('awards Ne2+ once and gives no additional fork XP for Nxd4 in Halce–noctu2nality', () => {
    const example = parseGame(ne2Pgn);
    const cp = analyzed(example, -309);
    const candidates = knightForkCandidates(example);
    const creatingFork = candidates.find(candidate => candidate.san === 'Ne2+')!;
    const followUp = candidates.find(candidate => candidate.san === 'Nxd4')!;
    expect(assessFork(example, creatingFork, cp)).toMatchObject({
      status: 'qualified',
      event: { ply: 1, amount: 137, grade: 'S+', evidence: { lossCp: 0, materialGainCp: 500 } },
    });
    expect(assessFork(example, followUp, cp).status).toBe('rejected');
    const first = prepareGrant([], example, 'black', cp);
    expect(first.events.filter(event => event.kind === 'mastery' && event.masteryId === 'mastery_knight_forks'))
      .toMatchObject([{ ply: 1, amount: 137, grade: 'S+' }]);
    expect(projectCollection([first]).mastery).toMatchObject({ xp: 137, highGrades: 1 });
    const again = prepareGrant([first], example, 'black', cp);
    expect(again.events).toEqual(first.events);
    expect(prepareGrant([first], example, 'black').events.filter(event => event.kind === 'mastery'))
      .toEqual(first.events.filter(event => event.kind === 'mastery'));
    expect(newlyUnlocked([first], [again]).masteryXp).toBe(0);

    const isolatedFollowUp = parseGame(nxd4Pgn);
    const followUpGrant = prepareGrant([], isolatedFollowUp, 'black', analyzed(isolatedFollowUp, -367));
    expect(projectCollection([followUpGrant]).mastery.xp).toBe(0);
  });

  it('uses authored irregular values with decreasing awards and rejects moves outside the gate', () => {
    for (const [i, band] of FORK_MASTERY.quality_awards.entries()) {
      expect(qualityXp({ type: 'cp', value: 0 }, { type: 'cp', value: -band.max_loss_cp }).xp).toBe(
        band.xp,
      );
      const after = qualityXp(
        { type: 'cp', value: 0 },
        { type: 'cp', value: -band.max_loss_cp - 1 },
      ).xp;
      expect(after).toBe(FORK_MASTERY.quality_awards[i + 1]?.xp ?? 0);
    }
  });
  it('keeps mate transitions distinct from cp and rejects losing a win or hastening a loss', () => {
    expect(qualityXp({ type: 'mate', value: 2 }, { type: 'mate', value: 5 }).xp).toBe(137);
    expect(qualityXp({ type: 'cp', value: 900 }, { type: 'mate', value: 2 }).xp).toBe(137);
    expect(qualityXp({ type: 'mate', value: 2 }, { type: 'cp', value: 900 }).xp).toBe(0);
    expect(qualityXp({ type: 'mate', value: -2 }, { type: 'mate', value: -9 }).xp).toBe(137);
    expect(qualityXp({ type: 'mate', value: -9 }, { type: 'mate', value: -2 }).xp).toBe(0);
    expect(qualityXp({ type: 'cp', value: -300 }, { type: 'mate', value: -2 }).xp).toBe(0);
  });
  it('keeps missing, unrelated, and stale analysis pending; poor quality earns nothing', () => {
    expect(assessFork(game, fork).status).toBe('pending');
    expect(assessFork(game, fork, { ...checkpoint(), pgn: 'different' }).status).toBe('pending');
    expect(assessFork(game, fork, { ...checkpoint(), version: 'old' }).status).toBe('pending');
    expect(assessFork(game, fork, checkpoint(98)).status).toBe('rejected');
    expect(assessFork(game, fork, checkpoint(23))).toMatchObject({
      status: 'qualified',
      event: { amount: 89, ply: 1 },
    });
  });
  it('derives levels at each authored boundary and caps at the final level', () => {
    FORK_MASTERY.level_thresholds.forEach((xp, i) => {
      expect(masteryProgress(xp, 10).level).toBe(i + 1);
      if (xp) expect(masteryProgress(xp - 1, 10).level).toBe(i);
    });
    expect(masteryProgress(999999, 10)).toMatchObject({ level: 10, next: undefined });
  });
  it('saves XP as evidence-bearing move contributions, preserves it without a cache, and removes it on color correction', () => {
    const saved = grant();
    expect(projectCollection([saved]).mastery.xp).toBe(137);
    const earned = saved.events.find((event) => event.kind === 'mastery')!;
    expect(earned).toMatchObject({
      kind: 'mastery',
      amount: 137,
      evidence: { ruleVersion: FORK_MASTERY.rule_version, materialGainCp: 200 },
    });
    expect(
      retainMastery(saved, 'white', contributions(game, 'white')).filter(
        (event) => event.kind === 'mastery',
      ),
    ).toEqual([earned]);
    expect(
      retainMastery(saved, 'white', contributions(game, 'white', checkpoint(61))).filter(
        (event) => event.kind === 'mastery',
      ),
    ).toEqual([earned]);
    expect(retainMastery(saved, 'black', contributions(game, 'black'))).not.toContainEqual(earned);
    expect(
      contributions(game, 'black', checkpoint()).some((event) => event.kind === 'mastery'),
    ).toBe(false);
    expect(newlyUnlocked([], [saved, { ...saved, id: 'other' }])).toMatchObject({
      masteryXp: 274,
      masteryLevels: [2],
    });
    expect(
      newlyUnlocked([], [grant([...saved.events, { ...earned, amount: 1700 }])]).masteryLevels,
    ).toEqual([2, 3, 4, 5]);
  });
});

it('grades every qualified CP loss band from S+ down to D- without changing XP', () => {
  expect([...FORK_MASTERY.grade_bands].reverse().map((band) => band.grade)).toEqual(TACTICAL_GRADES);
  for (const [i, band] of FORK_MASTERY.grade_bands.entries()) {
    const best = { type: 'cp' as const, value: 200 };
    const played = { type: 'cp' as const, value: 200 - band.max_loss_cp };
    expect(forkGrade(best, played)).toBe(band.grade);
    const next = { ...played, value: played.value - 1 };
    expect(forkGrade(best, next)).toBe(FORK_MASTERY.grade_bands[i + 1]?.grade);
    expect(assessFork(game, fork, checkpoint(band.max_loss_cp))).toMatchObject({
      status: 'qualified',
      event: {
        grade: band.grade,
        amount: qualityXp(best, played).xp,
        evidence: { gradeVersion: FORK_MASTERY.grade_version },
      },
    });
  }
  expect(forkGrade({ type: 'cp', value: 200 }, { type: 'cp', value: 201 })).toBe('S+');
  expect(forkGrade({ type: 'cp', value: 0 }, { type: 'cp', value: NaN })).toBeUndefined();
});
it('grades accepted mate outcomes separately and never invents a grade for rejected quality', () => {
  expect(forkGrade({ type: 'mate', value: 2 }, { type: 'mate', value: 5 })).toBe('S+');
  expect(forkGrade({ type: 'cp', value: -300 }, { type: 'mate', value: -2 })).toBeUndefined();
  expect(forkGrade({ type: 'mate', value: 2 }, { type: 'cp', value: 900 })).toBeUndefined();
});
it('recovers legacy grades from evidence, preserves earned XP and grades, and leaves unknown rules ungraded', () => {
  const earned = assessFork(game, fork, checkpoint(7));
  if (earned.status !== 'qualified') throw new Error('Expected a qualified fixture');
  const legacy = structuredClone(earned.event);
  delete legacy.grade;
  delete legacy.evidence.gradeVersion;
  expect(gradeForContribution(legacy)).toBe('S-');
  const migrated = withMasteryGrade(legacy);
  expect(migrated).toMatchObject({
    grade: 'S-',
    amount: legacy.amount,
    evidence: { gradeVersion: FORK_MASTERY.grade_version },
  });
  expect(legacy.grade).toBeUndefined();
  expect(
    gradeForContribution({
      ...legacy,
      amount: 137,
      evidence: { ...legacy.evidence, ruleVersion: 'unknown' },
    }),
  ).toBeUndefined();
  const saved = grant([migrated]);
  const retained = retainMastery(saved, 'white', contributions(game, 'white', checkpoint(0)));
  expect(retained.filter((event) => event.kind === 'mastery')).toEqual([migrated]);
  expect(
    retainMastery(grant([legacy]), 'white', []).filter((event) => event.kind === 'mastery'),
  ).toEqual([migrated]);
  expect(retainMastery(saved, 'black', []).some((event) => event.kind === 'mastery')).toBe(false);
});

it('keeps all banked XP while separate S-grade batches restrict levels', () => {
  expect(masteryProgress(20000, 0)).toMatchObject({
    xp: 20000,
    xpLevel: 10,
    level: 5,
    gradeLocked: true,
    requiredHighGrades: 2,
    remainingHighGrades: 2,
    remainingXp: 0,
  });
  expect(masteryProgress(20000, 1).level).toBe(5);
  expect(masteryProgress(20000, 2)).toMatchObject({
    level: 6,
    requiredHighGrades: 3,
    remainingHighGrades: 3,
    usedHighGrades: 2,
    availableHighGrades: 0,
    xp: 20000,
  });
  expect(masteryProgress(20000, 3)).toMatchObject({ level: 6, remainingHighGrades: 2 });
  expect(masteryProgress(20000, 4).level).toBe(6);
  expect(masteryProgress(20000, 5)).toMatchObject({
    level: 7,
    requiredHighGrades: 5,
    remainingHighGrades: 5,
    usedHighGrades: 5,
    availableHighGrades: 0,
  });
  expect(masteryProgress(20000, 9).level).toBe(7);
  expect(masteryProgress(20000, 10)).toMatchObject({
    level: 10,
    xp: 20000,
    next: undefined,
    usedHighGrades: 10,
  });
  for (let level = 1; level <= 5; level++)
    expect(masteryProgress(FORK_MASTERY.level_thresholds[level - 1]).level).toBe(level);
  expect(masteryProgress(FORK_MASTERY.level_thresholds[5] - 1, 100).level).toBe(5);
  const blocked = masteryProgress(20000, 0);
  expect(blocked.gained).toBe(blocked.needed);
});
it('counts S-, S and S+ per saved fork and allocates separate batches to unlock banked levels', () => {
  const event = contributions(game, 'white', checkpoint()).find(
    (event) => event.kind === 'mastery',
  )!;
  const base = grant([{ ...event, amount: 20000, grade: 'A+' }]);
  expect(projectCollection([base]).mastery).toMatchObject({ level: 5, highGrades: 0, xp: 20000 });
  const ranked = (grade: typeof event.grade, id: string) => ({
    ...grant([{ ...event, grade }]),
    id,
  });
  const one = ranked('S-', 'one');
  const two = ranked('S', 'two');
  const three = ranked('S+', 'three');
  expect(projectCollection([base, one]).mastery.level).toBe(5);
  expect(newlyUnlocked([base, one], [base, one, two]).masteryLevels).toEqual([6]);
  expect(projectCollection([base, one, two]).mastery).toMatchObject({
    highGrades: 2,
    level: 6,
    xp: 20274,
  });
  expect(newlyUnlocked([base, one, two], [base, one, two, three]).masteryLevels).toEqual([]);
  const five = [base, one, two, three, ranked('S-', 'four'), ranked('S+', 'five')];
  expect(newlyUnlocked([base, one, two, three], five).masteryLevels).toEqual([7]);
  const ten = [...five, ...Array.from({ length: 5 }, (_, i) => ranked('S', `extra${i}`))];
  expect(newlyUnlocked(five, ten).masteryLevels).toEqual([8, 9, 10]);
  const sameGame = grant([
    { ...event, grade: 'S-' },
    { ...event, ply: 2, grade: 'S+' },
  ]);
  expect(projectCollection([sameGame]).mastery.highGrades).toBe(2);
  const legacy = { ...event };
  delete legacy.grade;
  expect(projectCollection([grant([legacy])]).mastery.highGrades).toBe(1);
});
