import { expect, it } from 'vitest';
import { parseGame } from '../game';
import { analyzed } from '../fixtures/test-analysis';
import skewerPgn from '../fixtures/games/skewer.pgn?raw';
import { skewerCandidates } from '../tactics/skewers';
import {
  assessSkewer,
  FORK_MASTERY,
  SKEWER_MASTERY,
  masteryProgress,
  MASTERIES,
  MASTERY_IDS,
  type MasteryContribution,
} from './mastery';
import {
  contributions,
  prepareGrant,
  projectCollection,
  retainMastery,
  newlyUnlocked,
  type GameGrant,
} from './collection';
const game = parseGame(skewerPgn);
const candidate = skewerCandidates(game)[0];
it('uses the same authored tactical blueprint without sharing progress balances', () => {
  for (const key of [
    'quality_awards',
    'grade_bands',
    'level_thresholds',
    'level_requirements',
  ] as const)
    expect(SKEWER_MASTERY[key]).toEqual(FORK_MASTERY[key]);
  expect(MASTERIES.map((d) => d.id)).toEqual(MASTERY_IDS);
  expect(masteryProgress(20000, 2, SKEWER_MASTERY)).toMatchObject({
    level: 6,
    remainingHighGrades: 3,
    xp: 20000,
  });
  expect(masteryProgress(20000, 5, SKEWER_MASTERY).level).toBe(7);
  expect(masteryProgress(20000, 10, SKEWER_MASTERY).level).toBe(10);
});
it('awards all grade/XP bands only with matching current analysis and material proof', () => {
  for (const band of SKEWER_MASTERY.grade_bands) {
    const cp = analyzed(game);
    cp.results[0].played.value = -band.max_loss_cp;
    expect(assessSkewer(game, candidate, cp)).toMatchObject({
      status: 'qualified',
      event: {
        masteryId: 'mastery_skewers',
        grade: band.grade,
        evidence: {
          gradeVersion: SKEWER_MASTERY.grade_version,
          skewer: { attacker: 'b2', front: 'd4', rear: 'e5' },
        },
      },
    });
  }
  expect(assessSkewer(game, candidate).status).toBe('pending');
  const cp = analyzed(game);
  expect(assessSkewer(game, candidate, { ...cp, pgn: 'other' }).status).toBe('pending');
  expect(assessSkewer(game, candidate, { ...cp, version: 'old' }).status).toBe('pending');
  cp.results[0].played.value = -98;
  expect(assessSkewer(game, candidate, cp).status).toBe('rejected');
});
it('normalizes Black grades from White POV and credits no opponent or virtual moves', () => {
  const black = parseGame('[SetUp "1"]\n[FEN "6kr/8/8/8/Q3K3/8/8/8 b - - 0 1"]\n\n1... Rh4+ 0-1');
  const cp = analyzed(black, -200);
  cp.results[0].played.value = -193;
  expect(assessSkewer(black, skewerCandidates(black)[0], cp)).toMatchObject({
    status: 'qualified',
    event: { grade: 'S-' },
  });
  expect(
    contributions(black, 'white', cp).filter(
      (e) => e.kind === 'mastery' && e.masteryId === 'mastery_skewers',
    ),
  ).toEqual([]);
  const original = contributions(game, 'white', analyzed(game));
  const withVirtual = contributions(game, 'white', {
    ...analyzed(game),
    virtual: [],
    virtualStatus: 'terminal',
  });
  expect(withVirtual.filter((e) => e.kind === 'mastery')).toEqual(
    original.filter((e) => e.kind === 'mastery'),
  );
});
it('keeps skewers independent from forks, idempotent, and stable without analysis', () => {
  const first = prepareGrant([], game, 'white', analyzed(game));
  expect(projectCollection([first]).masteries.mastery_skewers).toMatchObject({
    xp: 137,
    highGrades: 1,
  });
  expect(projectCollection([first]).mastery).toMatchObject({ xp: 0, highGrades: 0 });
  expect(prepareGrant([first], game, 'white').events).toEqual(first.events);
  expect(
    projectCollection([prepareGrant([first], game, 'black')]).masteries.mastery_skewers.xp,
  ).toBe(0);
  const skewer = first.events.find((e): e is MasteryContribution => e.kind === 'mastery')!;
  const fork: MasteryContribution = {
    ...skewer,
    masteryId: 'mastery_knight_forks',
    evidence: {
      ...skewer.evidence,
      ruleVersion: FORK_MASTERY.rule_version,
      gradeVersion: FORK_MASTERY.grade_version,
    },
  };
  const samePly: GameGrant = { ...first, events: [skewer, fork] };
  expect(retainMastery(samePly, 'white', []).filter((e) => e.kind === 'mastery')).toHaveLength(2);
  expect(projectCollection([samePly]).masteries.mastery_skewers.xp).toBe(137);
  expect(projectCollection([samePly]).mastery.xp).toBe(137);
  const other = { ...first, id: 'other' };
  expect(
    newlyUnlocked([first], [first, other]).masteries.find(
      (m) => m.definition.id === 'mastery_skewers',
    ),
  ).toMatchObject({ xp: 137, levels: [2] });
  expect(newlyUnlocked([first], [first, other]).masteryXp).toBe(0);
});

it('retains a genuine knight fork and discovered skewer created on the same actual ply', () => {
  const compound=parseGame('[SetUp "1"]\n[FEN "8/8/8/RN1k3q/8/8/r7/1K6 w - - 0 1"]\n\n1. Nc3+ 1-0');
  const first=prepareGrant([],compound,'white',analyzed(compound));
  expect(first.events.filter(e=>e.kind==='mastery').map(e=>[e.masteryId,e.ply])).toEqual([['mastery_knight_forks',1],['mastery_skewers',1]]);
  expect(prepareGrant([first],compound,'white').events).toEqual(first.events);
  expect(projectCollection([first]).mastery.xp).toBe(137);
  expect(projectCollection([first]).masteries.mastery_skewers.xp).toBe(137);
});
