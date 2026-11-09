import { afterEach, expect, it, vi } from 'vitest';
import { parseGame } from '../game';
import { analyzed } from '../fixtures/test-analysis';
import { german, translate } from '../i18n';
import { prepareGrant, projectCollection } from '../achievements/collection';
import { OPENING_MASTERIES, OPENING_POLICY, masteryProgress } from '../achievements/mastery-policy';
import { CARO_KANN_OPENINGS, OPENINGS, recognizeOpenings } from './recognition';
import { openingAssessment, openingContributions } from './mastery';
import { openingBook } from './book';
import source from '../../../data/openings/sources/caro-kann.tsv?raw';
import catalog from '../../../data/openings/caro-kann.json';
import pgn from '../fixtures/games/caro-kann.pgn?raw';

afterEach(() => vi.restoreAllMocks());
const rows = source.trim().split('\n').slice(1).map(line => {
  const [eco, name, pgn] = line.split('\t');
  return { eco, name, pgn };
});
const clocked = (line: string) => {
  const game = parseGame(`[TimeControl "600+0"]\n\n${line} 1-0`);
  game.moves = game.moves.map((move, index) => ({ ...move, clock: 600 - 10 * Math.floor(index / 2) }));
  return game;
};
const track = (openingId: string, color: 'white' | 'black' = 'white') => OPENING_MASTERIES.find(definition => definition.opening_id === openingId && definition.color === color)!;

it('covers the entire pinned Caro-Kann source and folds generic continuation labels into named identities', () => {
  expect(rows).toHaveLength(110);
  expect(catalog.sourceEntryCount).toBe(rows.length);
  expect(new Set(rows.map(row => row.name)).size).toBe(92);
  expect(CARO_KANN_OPENINGS).toHaveLength(84);
  expect(OPENING_MASTERIES.filter(definition => definition.opening_id?.startsWith('caro-kann'))).toHaveLength(168);
  expect(CARO_KANN_OPENINGS.flatMap(opening => opening.aliases).sort()).toEqual([...new Set(rows.map(row => row.name))].sort());
  expect(CARO_KANN_OPENINGS.some(opening => /main-line|exchange-line|retreat-line/.test(opening.id))).toBe(false);
  expect(CARO_KANN_OPENINGS.find(opening => opening.id === 'caro-kann-advance-variation-short-variation')?.aliases).toEqual([
    'Caro-Kann Defense: Advance Variation, Short Variation', 'Caro-Kann Defense: Advance, Short Variation',
  ]);
  expect(track('caro-kann', 'white').name).toBe('The Wall Breaker (Facing the Caro-Kann)');
  expect(track('caro-kann', 'black').name).toBe('The Iron Wall (Caro-Kann)');
});

it.each(rows)('legally recognizes $eco $name from its pinned source position', row => {
  const definition = CARO_KANN_OPENINGS.filter(opening => opening.aliases.includes(row.name));
  expect(definition).toHaveLength(1);
  const game = parseGame(`${row.pgn} 1-0`);
  expect(game.moves.length).toBeGreaterThan(0);
  expect(definition[0].entryLines).toContain(game.moves.map(move => move.san).join(' '));
  expect(recognizeOpenings(game).map(opening => opening.id)).toContain(definition[0].id);
});

it.each(CARO_KANN_OPENINGS)('can award both color tracks for $name with independent evidence and grades', opening => {
  vi.spyOn(openingBook, 'lookup').mockReturnValue(undefined);
  const game = clocked(opening.entryLines[0]);
  for (const color of ['white', 'black'] as const) {
    const events = openingContributions(game, color, analyzed(game)).filter(event => event.evidence.openingId === opening.id);
    expect(events.length).toBeGreaterThan(0);
    expect(events.every(event => event.masteryId === track(opening.id, color).id && game.moves[event.ply - 1].color === color && event.amount > 0)).toBe(true);
    const ownMoves = game.moves.filter(move => move.color === color).length;
    expect(events.filter(event => event.grade).map(event => event.grade)).toEqual(ownMoves >= OPENING_POLICY.minimum_grade_moves ? ['S+'] : []);
    expect(events.every(event => event.evidence.ruleVersion === 'caro-kann-opening-v1' && event.evidence.recognitionVersion === catalog.sourceVersion)).toBe(true);
    expect(track(opening.id, color).level_requirements).toEqual(OPENING_POLICY.level_requirements);
    expect(translate('de', track(opening.id, color).name)).toBeTruthy();
  }
});

it('recognizes transpositions without relying on ECO codes, name prefixes, or the chosen route', () => {
  const paths = [
    'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5',
    'e4 c6 d4 d5 Nd2 dxe4 Nxe4 Bf5',
    'd4 d5 e4 c6 Nc3 dxe4 Nxe4 Bf5',
  ];
  for (const line of paths) expect(recognizeOpenings(clocked(line)).map(opening => opening.id)).toContain('caro-kann-classical-variation');
  expect(recognizeOpenings(clocked('e4 c6 d4 d5 e5 Bf5 Nf3')).map(opening => opening.id)).toEqual([
    'caro-kann', 'caro-kann-advance-variation', 'caro-kann-advance-variation-short-variation',
  ]);
  expect(recognizeOpenings(clocked('e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nf6 Nxf6+ gxf6')).map(opening => opening.id)).toContain('caro-kann-bronstein-larsen-variation');
  expect(recognizeOpenings(clocked('e4 c6 d4 d5 Nc3 dxe4 Nxe4 Nf6 Nxf6+ gxf6')).map(opening => opening.id)).not.toContain('caro-kann-tartakower-variation');
  for (const line of ['e4 e5', 'c4 c6']) expect(recognizeOpenings(parseGame(`[ECO "B12"]\n[Opening "Caro-Kann Defense: Advance Variation"]\n\n${line} 1-0`))).toEqual([]);
  expect(recognizeOpenings(parseGame('[SetUp "1"]\n[FEN "rnbqkbnr/pp1ppppp/2p5/8/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2"]\n\n2. d4 d5 1-0'))).toEqual([]);
});

it('uses the common scoring and grades with higher thresholds for broader branches', () => {
  const root = track('caro-kann');
  const advance = track('caro-kann-advance-variation');
  const short = track('caro-kann-advance-variation-short-variation');
  for (const definition of [root, advance, short]) {
    const multiplier = OPENING_POLICY.level_threshold_multipliers[definition.opening_id!];
    expect(definition.level_thresholds).toEqual(OPENING_POLICY.level_thresholds.map(value => value * multiplier));
    expect(masteryProgress(definition.level_thresholds[5], 0, definition)).toMatchObject({ level: 5, gradeLocked: true, remainingHighGrades: 2 });
  }
  expect(root.level_thresholds[1]).toBeGreaterThan(advance.level_thresholds[1]);
  expect(advance.level_thresholds[1]).toBeGreaterThan(short.level_thresholds[1]);
  expect(short.level_thresholds).toEqual(track('rapport-jobava').level_thresholds);
  for (const opening of OPENINGS) expect(Object.hasOwn(german, opening.name)).toBe(true);
});

it('collects every reached branch once, preserves saved awards, and replaces all tracks on color correction', () => {
  vi.spyOn(openingBook, 'lookup').mockReturnValue(undefined);
  const game = parseGame(pgn);
  const checkpoint = analyzed(game);
  expect(openingAssessment(game, 'white').status).toBe('analysis');
  expect(openingAssessment(game, 'white', { ...checkpoint, results: checkpoint.results.slice(1) }).status).toBe('analysis');
  expect(openingAssessment({ ...game, moves: game.moves.map(move => ({ ...move, clock: undefined })) }, 'white', checkpoint).status).toBe('clocks');
  const first = prepareGrant([], game, 'white', checkpoint);
  const progress = projectCollection([first]).masteries;
  const expected = ['caro-kann', 'caro-kann-advance-variation', 'caro-kann-advance-variation-short-variation'];
  for (const id of expected) {
    expect(progress[track(id).id]).toMatchObject({ highGrades: 1 });
    expect(progress[track(id).id].xp).toBe(progress.mastery_caro_kann_white.xp);
    expect(progress[track(id, 'black').id].xp).toBe(0);
  }
  expect(progress[track('caro-kann-advance-variation-tal-variation').id].xp).toBe(0);
  expect(prepareGrant([first], game, 'white').events).toEqual(first.events);
  expect(prepareGrant([first], game, 'white', analyzed(game, 400)).events.filter(event => event.kind === 'mastery')).toEqual(first.events.filter(event => event.kind === 'mastery'));
  const legacy = { ...first, events: first.events.filter(event => event.kind !== 'mastery' || event.masteryId === 'mastery_caro_kann_white') };
  const updated = prepareGrant([legacy], game, 'white', checkpoint);
  for (const id of expected) expect(updated.events.filter(event => event.kind === 'mastery' && event.masteryId === track(id).id))
    .toEqual(first.events.filter(event => event.kind === 'mastery' && event.masteryId === track(id).id));
  expect(updated.collectedAt).toBe(legacy.collectedAt);
  const corrected = projectCollection([prepareGrant([first], game, 'black', checkpoint)]).masteries;
  for (const id of expected) {
    expect(corrected[track(id).id].xp).toBe(0);
    expect(corrected[track(id, 'black').id].xp).toBeGreaterThan(0);
    expect(corrected[track(id, 'black').id].highGrades).toBe(1);
  }
});
