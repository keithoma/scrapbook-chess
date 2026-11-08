import { expect, it } from 'vitest';
import { parseGame } from '../game';
import { analyzed } from '../fixtures/test-analysis';
import { BADGES } from './catalog';
import { boardDrawReason, drawReason } from '../draw-reason';
import { contributions,prepareGrant,projectCollection } from './collection';
const fixtures = [
 ['badge_draw_lost_threefold','repetition','1. Nf3 Nf6 2. Ng1 Ng8 3. Nf3 Nf6 4. Ng1 Ng8 1/2-1/2'],
 ['badge_draw_lost_agreement','agreement','[Termination "Game drawn by agreement"]\n\n1. e4 e5 1/2-1/2'],
 ['badge_draw_lost_50move','fifty-move','[SetUp "1"]\n[FEN "7k/8/8/8/8/8/8/KR6 w - - 99 1"]\n\n1. Rb2 1/2-1/2'],
 ['badge_draw_lost_insufficient','insufficient','[SetUp "1"]\n[FEN "7k/8/8/8/8/8/1r6/K7 w - - 0 1"]\n\n1. Kxb2 1/2-1/2'],
] as const;
for(const [id,reason,pgn] of fixtures.filter(([id])=>BADGES.some(b=>b.id===id))) {
 it(`${id} requires an actual draw, matching reason and a prior player deficit`,()=>{
  const game=parseGame(pgn);expect(drawReason(game)).toBe(reason);
  for(const color of ['white','black'] as const){
   const cp=analyzed(game);cp.results[0].best.value=color==='white'?-300:300;
   const events=()=>contributions(game,color,cp).filter(e=>e.kind==='badge'&&e.badgeId===id);
   expect(events()).toMatchObject([{amount:1,originPly:0,ply:game.moves.length}]);
   const saved=prepareGrant([],game,color,cp);expect(projectCollection([prepareGrant([saved],game,color)]).totals[id as keyof ReturnType<typeof projectCollection>['totals']]).toBe(1);
   cp.results[0].best.value=color==='white'?-299:299;expect(events()).toEqual([]);
   cp.results[0].best={type:'mate',value:color==='white'?-3:3};expect(events()).toHaveLength(1);
   cp.results.pop();expect(events()).toEqual([]);
   expect(contributions({...game,drawReason:'other'},color,analyzed(game,-300)).some(e=>e.kind==='badge'&&e.badgeId===id)).toBe(false);
  }
  expect(drawReason({...game,result:'1-0'})).toBeUndefined();
  expect(contributions(game,'white').some(e=>e.kind==='badge'&&e.badgeId===id)).toBe(false);
 });
}
it('never invents agreement from generic normal termination or confuses stalemate with insufficient material',()=>{
 expect(drawReason(parseGame('[Termination "Normal"]\n\n1. e4 e5 1/2-1/2'))).toBeUndefined();
 expect(boardDrawReason(parseGame('1. Nf3 Nf6 2. Ng1 Ng8 1/2-1/2'))).toBeUndefined();
 expect(drawReason(parseGame('[SetUp "1"]\n[FEN "7k/5K2/8/6Q1/8/8/8/8 w - - 0 1"]\n\n1. Qg6 1/2-1/2'))).toBe('stalemate');
});
