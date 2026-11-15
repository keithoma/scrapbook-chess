import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { CollectedMasteries } from './collected-masteries';
import type { Contribution, GameGrant } from './collection';
import { masteryContributions, type MasteryContribution } from './mastery';
import { openingContributions } from '../openings/mastery';
import { endgameContributions } from '../endgames/mastery';
import { parseGame } from '../game';
import { analyzed } from '../fixtures/test-analysis';
import jobavaPgn from '../fixtures/games/jobava.pgn?raw';

const forkGame = parseGame('[SetUp "1"]\n[FEN "3r3k/8/8/4N3/8/8/7K/3r4 w - - 0 1"]\n\n1. Nf7+ 1-0');
const fork = masteryContributions(forkGame, 'white', analyzed(forkGame, 200))
  .find((event): event is MasteryContribution => event.family === undefined || event.family === 'tactical')!;
const grant = (events: Contribution[]): GameGrant => ({
  id: 'game', version: 1, pgn: forkGame.pgn, color: 'white', events, collectedAt: '', updatedAt: '',
});
const render = (game?: GameGrant, color: 'white' | 'black' | '' = 'white', locale: 'en' | 'de' = 'en') =>
  renderToStaticMarkup(createElement(CollectedMasteries, { game, color, locale }));

it('shows only collected masteries with XP for the selected player color', () => {
  for (const game of [undefined, grant([]), grant([
    { kind: 'badge', badgeId: 'badge_played_total', amount: 1, ply: 1 },
    { ...fork, amount: 0, grade: 'S+' },
  ])]) expect(render(game)).toBe('');
  expect(render(grant([fork]), 'black')).toBe('');
  expect(render(grant([fork]), '')).toBe('');
});

it('totals each mastery once while retaining every tactical award’s saved grade', () => {
  const html = render(grant([
    { ...fork, amount: 137, grade: 'S+' },
    { ...fork, amount: 89, ply: 3, grade: 'A+' },
  ]));
  expect(html).toContain('Knight forks +226 XP');
  expect(html).toContain('Grades: S+, A+');
  expect(html.match(/data-testid="collected-mastery_knight_forks"/g)).toHaveLength(1);
});

it('includes an opening’s whole-game grade even when its grade event awarded zero XP', () => {
  const openingGame = parseGame(jobavaPgn);
  const event = openingContributions(openingGame, 'white', analyzed(openingGame))[0];
  const html = render(grant([
    { ...event, amount: 11, grade: undefined },
    { ...event, ply: 33, amount: 0, grade: 'A' },
  ]));
  expect(html).toContain('The Modern Artist (Rapport-Jobava) +11 XP');
  expect(html).toContain('Grade: A');
  expect(html).not.toContain('Grades:');
});

it('shows endgame and tactical masteries together with their separate grades', () => {
  const endgame = parseGame('[SetUp "1"]\n[FEN "7k/6p1/8/8/8/8/1P6/K7 w - - 0 1"]\n\n1. Kb1 Kh7 2. Kc2 Kg6 3. Kd3 Kf5 1-0');
  const event = endgameContributions(endgame, 'white', analyzed(endgame))[0];
  const html = render(grant([fork, event]));
  expect(html).toContain(`Pawn vs Pawn +${event.amount} XP`);
  expect(html).toContain('Grade: S-');
  expect(html).toContain('Knight forks +137 XP');
  expect(html).toContain('Grade: S+');
});

it('recovers legacy tactical grades through shared rules and reports unavailable grades honestly', () => {
  const legacy = { ...fork, grade: undefined };
  expect(render(grant([legacy]))).toContain('Grade: S+');
  expect(render(grant([{ ...legacy, evidence: { ...legacy.evidence, ruleVersion: 'unknown' } }]))).toContain('Grade unavailable');
});

it('translates the summary, mastery names, XP and grades into German', () => {
  const html = render(grant([fork]), 'white', 'de');
  expect(html).toContain('In dieser Partie verdiente Meisterschaften');
  expect(html).toContain('Springergabeln +137 EP');
  expect(html).toContain('Bewertung: S+');
});
