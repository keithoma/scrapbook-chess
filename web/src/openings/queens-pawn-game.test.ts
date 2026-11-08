import { afterEach, expect, it, vi } from 'vitest';
import { parseGame } from '../game';
import { analyzed } from '../fixtures/test-analysis';
import jobavaPgn from '../fixtures/games/jobava.pgn?raw';
import { prepareGrant, projectCollection } from '../achievements/collection';
import { OPENING_MASTERIES, masteryProgress, type OpeningMasteryContribution } from '../achievements/mastery-policy';
import { recognizeOpenings } from './recognition';
import { openingAssessment, openingContributions } from './mastery';
import { openingBook } from './book';

afterEach(() => vi.restoreAllMocks());

const clocked = (line: string) => {
  const game = parseGame(`[TimeControl "600+0"]\n\n${line} 1-0`);
  game.moves = game.moves.map((move, i) => ({ ...move, clock: 600 - Math.floor(i / 2) * 15 }));
  return game;
};
const game = clocked('d4 d5 Nf3 Nf6 e3 e6 Bd3 Bd6 O-O O-O');

it('recognizes the broad d4 family independently of the later opening and PGN labels', () => {
  for (const line of ['d4', 'd4 d5 e3', 'd4 Nf6 c4 g6', 'd4 f5', 'd4 e5', 'd4 c5']) {
    expect(recognizeOpenings(parseGame(`${line} 1-0`))).toEqual([
      expect.objectContaining({ id: 'queens-pawn-game', ply: 1 }),
    ]);
  }
  expect(recognizeOpenings(parseGame(jobavaPgn)).map(opening => opening.id)).toEqual(['rapport-jobava', 'queens-pawn-game']);
  // Recognize the same entry position even when reached in a different order.
  expect(recognizeOpenings(parseGame('Nf3 Nf6 Ng1 Ng8 d4 1-0'))).toEqual([
    expect.objectContaining({ id: 'queens-pawn-game', ply: 5 }),
  ]);
  expect(recognizeOpenings(parseGame('[Opening "Queen\'s Pawn Game"]\n[ECO "D00"]\n\ne4 e5 1-0'))).toEqual([]);
  expect(recognizeOpenings(parseGame('[SetUp "1"]\n[FEN "rnbqkbnr/pppppppp/8/8/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1"]\n\nd5 1-0'))).toEqual([]);
});

it('requires ten times Jobava XP at every level, retaining independent grade gates', () => {
  for (const color of ['white', 'black']) {
    const broad = OPENING_MASTERIES.find(definition => definition.opening_id === 'queens-pawn-game' && definition.color === color)!;
    const narrow = OPENING_MASTERIES.find(definition => definition.opening_id === 'rapport-jobava' && definition.color === color)!;
    expect(broad.level_thresholds).toEqual(narrow.level_thresholds.map(xp => xp * 10));
    expect(broad.level_requirements).toEqual(narrow.level_requirements);
    for (const [i, threshold] of broad.level_thresholds.entries()) {
      expect(masteryProgress(threshold, 10, broad).level).toBe(i + 1);
      if (i > 0) expect(masteryProgress(threshold - 1, 10, broad).level).toBe(i);
    }
    expect(masteryProgress(narrow.level_thresholds[1], 0, broad).level).toBe(1);
    expect(masteryProgress(broad.level_thresholds[5], 0, broad)).toMatchObject({ level: 5, gradeLocked: true, remainingHighGrades: 2 });
    expect(masteryProgress(broad.level_thresholds[6], 2, broad)).toMatchObject({ level: 6, remainingHighGrades: 3 });
    expect(masteryProgress(broad.level_thresholds[7], 5, broad)).toMatchObject({ level: 7, remainingHighGrades: 5 });
  }
});

it('awards the selected side on a plain Queen’s Pawn game and waits for clocks and analysis', () => {
  vi.spyOn(openingBook, 'lookup').mockReturnValue(undefined);
  const checkpoint = analyzed(game);
  expect(openingAssessment(game, 'white').status).toBe('analysis');
  expect(openingAssessment(game, 'white', { ...checkpoint, version: 'old' }).status).toBe('analysis');
  expect(openingAssessment({ ...game, timeControl: '?' }, 'white', checkpoint).status).toBe('clocks');
  for (const color of ['white', 'black'] as const) {
    const events = openingContributions(game, color, checkpoint);
    expect(events.length).toBeGreaterThan(0);
    expect(events.every(event => event.masteryId === `mastery_queens_pawn_game_${color}` && game.moves[event.ply - 1].color === color)).toBe(true);
    expect(events.filter(event => event.grade).map(event => event.grade)).toEqual(['S+']);
    expect(events.every(event => event.evidence.openingId === 'queens-pawn-game' && event.evidence.ruleVersion === 'queens-pawn-game-opening-v1')).toBe(true);
  }
});

it('credits overlapping tracks fully with one grade each and keeps saved Jobava awards when recollected', () => {
  const jobava = parseGame(jobavaPgn);
  const checkpoint = analyzed(jobava);
  const first = prepareGrant([], jobava, 'white', checkpoint);
  const jobavaEvents = first.events.filter((event): event is OpeningMasteryContribution => event.kind === 'mastery' && event.family === 'opening' && event.masteryId === 'mastery_rapport_jobava_white');
  // Simulate an award collected before the broad mastery existed, under older tuning.
  const legacy = { ...first, events: first.events.filter(event => !(event.kind === 'mastery' && event.masteryId === 'mastery_queens_pawn_game_white')) };
  legacy.events = legacy.events.map(event => event.kind === 'mastery' && event.family === 'opening' ? { ...event, amount: event.amount + 1 } : event);
  const savedJobava = legacy.events.filter(event => event.kind === 'mastery' && event.masteryId === 'mastery_rapport_jobava_white');
  const recollected = prepareGrant([legacy], jobava, 'white', checkpoint);
  expect(recollected.events.filter(event => event.kind === 'mastery' && event.masteryId === 'mastery_rapport_jobava_white')).toEqual(savedJobava);
  const broad = recollected.events.filter((event): event is OpeningMasteryContribution => event.kind === 'mastery' && event.family === 'opening' && event.masteryId === 'mastery_queens_pawn_game_white');
  expect(broad.map(event => [event.ply, event.amount, event.grade])).toEqual(jobavaEvents.map(event => [event.ply, event.amount, event.grade]));
  const progress = projectCollection([recollected]).masteries;
  expect(progress.mastery_queens_pawn_game_white).toMatchObject({ highGrades: 1, level: 1 });
  expect(progress.mastery_rapport_jobava_white.highGrades).toBe(1);
  expect(progress.mastery_queens_pawn_game_black.xp).toBe(0);
  expect(prepareGrant([recollected], jobava, 'white', analyzed(jobava, 400)).events.filter(event => event.kind === 'mastery')).toEqual(recollected.events.filter(event => event.kind === 'mastery'));
  expect(prepareGrant([recollected], jobava, 'white').events).toEqual(recollected.events);
  const corrected = prepareGrant([recollected], jobava, 'black', checkpoint);
  const correctedProgress = projectCollection([corrected]).masteries;
  expect(correctedProgress.mastery_queens_pawn_game_white.xp).toBe(0);
  expect(correctedProgress.mastery_rapport_jobava_white.xp).toBe(0);
  expect(correctedProgress.mastery_queens_pawn_game_black.xp).toBeGreaterThan(0);
  expect(correctedProgress.mastery_queens_pawn_game_black.xp).toBe(correctedProgress.mastery_rapport_jobava_black.xp);
});
