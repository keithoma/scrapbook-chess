import { expect,it } from 'vitest';
import { parseGame } from '../game';
import { analyzed } from '../fixtures/test-analysis';
import { BADGES } from './catalog';
import { contributions,prepareGrant,projectCollection } from './collection';
for(const [id,severity,other] of [['badge_punish_mistakes',111,169],['badge_punish_blunders',169,111]] as const) {
 if(!BADGES.some(b=>b.id===id))continue;
 it(`${id} credits played exploitation once per opponent error, with correct severity and color`,()=>{
  for(const color of ['white','black'] as const){
   const game=parseGame('1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 1/2-1/2'); const cp=analyzed(game);
   const first=color==='black'?0:1;const sign=color==='black'?-1:1;
   const events=()=>contributions(game,color,cp).filter(e=>e.kind==='badge'&&e.badgeId===id);
   for(const index of [first,first+2]) {cp.results[index].played.value=sign*severity;cp.results[index+1].played.value=sign*severity;}
   expect(events()).toMatchObject([{ply:first+2,originPly:first+1},{ply:first+4,originPly:first+3}]);
   const saved=prepareGrant([],game,color,cp);expect(projectCollection([prepareGrant([saved],game,color)]).totals[id as keyof ReturnType<typeof projectCollection>['totals']]).toBe(2);
   cp.results[first].played.value=sign*other;expect(events()).toHaveLength(1);
   cp.results[first].played.value=sign*severity;cp.results[first+1].played.value=0;expect(events()).toHaveLength(1);
   cp.results[first+1].played.value=-sign*200;expect(events()).toHaveLength(1);
   cp.results.pop();expect(events()).toEqual([]);
  }
  const end=parseGame('1. e4 e5 1-0');const cp=analyzed(end);cp.results[1].played.value=severity;
  expect(contributions(end,'white',cp).some(e=>e.kind==='badge'&&e.badgeId===id)).toBe(false);
 });
}
