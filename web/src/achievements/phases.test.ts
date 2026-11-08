import { expect, it } from 'vitest';
import { parseGame, SAMPLE_PGN } from '../game';
import { divideGame, mixednessScore, phaseAt } from './phases';
import { contributions, prepareGrant } from './collection';
import upstreamGame from '../fixtures/games/lichess-divider.pgn?raw';

export function phaseGame(plies: number, result = '1-0') {
  const moves = parseGame(SAMPLE_PGN).moves.slice(0, plies).map((move, i) => `${i % 2 === 0 ? `${i / 2 + 1}. ` : ''}${move.san}`).join(' ');
  return parseGame(`${moves} ${result}`);
}
it('ports the upstream region scoring and before-board division conventions', () => {
  expect(mixednessScore(1, 4, 0)).toBe(0);
  expect(mixednessScore(7, 0, 4)).toBe(0);
  expect(mixednessScore(4, 1, 1)).toBe(5);
  expect(mixednessScore(5, 2, 2)).toBe(7);
  const simple = parseGame('1. e4 e5 1-0');
  expect(divideGame(simple)).toEqual({ middle: undefined, end: undefined, plies: 2 });
  expect(phaseAt(simple)).toBe('opening');
  const source = parseGame(SAMPLE_PGN);
  const split = divideGame(source);
  expect(split.middle).toBeGreaterThan(0); expect(split.end).toBeGreaterThan(split.middle!);
  expect(phaseAt(source, split.middle! - 1)).toBe('opening');
  expect(phaseAt(source, split.middle!)).toBe('middlegame');
  expect(phaseAt(source, split.end!)).toBe('endgame');
  expect(phaseAt(phaseGame(40))).toBe('middlegame');
  expect(phaseAt(phaseGame(120))).toBe('endgame');
});
it('identifies an endgame from the initial material without inventing a middlegame', () => {
  const game = parseGame('[SetUp "1"]\n[FEN "7k/8/8/8/8/8/P7/K7 w - - 0 1"]\n\n1. a3 1-0');
  expect(divideGame(game)).toEqual({ middle: undefined, end: 0, plies: 1 });
  expect(phaseAt(game)).toBe('endgame');
});
it('matches the upstream DividerTest game-one boundary expectations', () => {
  const split = divideGame(parseGame(upstreamGame));
  expect(split.middle).toBeGreaterThanOrEqual(18); expect(split.middle).toBeLessThanOrEqual(40);
  expect(split.end).toBeGreaterThanOrEqual(50); expect(split.end).toBeLessThanOrEqual(65);
});
it('awards Preparation once for an actual opening win, not a draw, loss, or later phase', () => {
  for (const color of ['white', 'black'] as const) {
    const result = color === 'white' ? '1-0' : '0-1';
    const game = phaseGame(2, result);
    const saved = prepareGrant([], game, color);
    expect(saved.events.filter(event => event.kind === 'badge' && event.badgeId === 'badge_won_opening')).toEqual([{ kind: 'badge', badgeId: 'badge_won_opening', amount: 1, ply: 2 }]);
    expect(prepareGrant([saved], game, color).events).toEqual(saved.events);
    for (const other of [phaseGame(2, '1/2-1/2'), phaseGame(40, result)]) expect(contributions(other, color).some(event => event.kind === 'badge' && event.badgeId === 'badge_won_opening')).toBe(false);
  }
});

it('Tactician counts middlegame wins for both colors once at game end',()=>{for(const color of ['white','black'] as const){const result=color==='white'?'1-0':'0-1';const game=phaseGame(40,result);expect(phaseAt(game)).toBe('middlegame');const saved=prepareGrant([],game,color);expect(saved.events.filter(e=>e.kind==='badge'&&e.badgeId==='badge_won_middlegame')).toEqual([{kind:'badge',badgeId:'badge_won_middlegame',amount:1,ply:40}]);expect(prepareGrant([saved],game,color).events).toEqual(saved.events);expect(contributions(phaseGame(40,'1/2-1/2'),color).some(e=>e.kind==='badge'&&e.badgeId==='badge_won_middlegame')).toBe(false);expect(contributions(phaseGame(2,result),color).some(e=>e.kind==='badge'&&e.badgeId==='badge_won_middlegame')).toBe(false);}});
