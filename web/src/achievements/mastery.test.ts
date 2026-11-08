import { describe, expect, it } from 'vitest';
import { parseGame } from '../game';
import { RECENT_GAME_PGN } from '../fixtures';
import { ANALYSIS_VERSION, type Checkpoint } from '../storage';
import { knightForkCandidates } from '../tactics/knight-forks';
import { forkMaterialThreat } from '../tactics/fork-material';
import { assessFork, FORK_MASTERY, masteryProgress, qualityXp } from './mastery';
import { contributions, newlyUnlocked, projectCollection, retainMastery, type GameGrant } from './collection';

const pgn = '[SetUp "1"]\n[FEN "3r3k/8/8/4N3/8/8/7K/3r4 w - - 0 1"]\n\n1. Nf7+ 1-0';
const game = parseGame(pgn);
const fork = knightForkCandidates(game)[0];
function checkpoint(loss = 0): Checkpoint {
  return { key: 'test', version: ANALYSIS_VERSION, pgn: game.pgn, results: [{ ply: 1, best: { type: 'cp', value: 200 }, played: { type: 'cp', value: 200 - loss }, bestMove: 'e5f7', ms: 1 }], virtual: [], virtualStatus: 'pending', updatedAt: '' };
}
function grant(events = contributions(game, 'white', checkpoint())): GameGrant {
  return { id: 'game', version: 1, pgn: game.pgn, color: 'white', events, collectedAt: '', updatedAt: '' };
}
describe('material qualification', () => {
  it('validates winning an exchange after every legal king reply and accounts for recapture', () => {
    expect(forkMaterialThreat(game, fork)).toMatchObject({ status: 'qualified', gainCp: 200, capture: 'Nxd8' });
  });
  it('validates a royal queen fork for both colors without needing a played capture', () => {
    for (const [fen, move] of [
      ['3q3k/8/8/4N3/8/8/8/7K w - - 0 1', 'Nf7+'],
      ['7k/8/8/8/4n3/8/8/3Q3K b - - 0 1', 'Nf2+'],
    ]) {
      const example = parseGame(`[SetUp "1"]\n[FEN "${fen}"]\n\n${move} *`);
      expect(forkMaterialThreat(example, knightForkCandidates(example)[0])).toMatchObject({ status: 'qualified', gainCp: 900 });
    }
  });
  it('rejects defended pawn attacks, pinned knights, and the recapturable Nxe3 from the actual game', () => {
    for (const [fen, move, reason] of [
      ['2rr3k/3p4/8/8/2p5/3N4/8/7K w - - 0 1', 'Ne5', 'no-gain'],
      ['k3r3/8/8/8/3N4/2r3r1/8/4K3 w - - 0 1', 'Ne2', 'pinned'],
    ]) {
      const example = parseGame(`[SetUp "1"]\n[FEN "${fen}"]\n\n${move} *`);
      expect(forkMaterialThreat(example, knightForkCandidates(example)[0])).toEqual({ status: 'rejected', reason });
    }
    const recent = parseGame(RECENT_GAME_PGN);
    expect(forkMaterialThreat(recent, knightForkCandidates(recent).find(candidate => candidate.ply === 30)!)).toEqual({ status: 'rejected', reason: 'capturable' });
  });
});
describe('quality-based XP and levels', () => {
  it('uses authored irregular values with decreasing awards and rejects moves outside the gate', () => {
    for (const [i, band] of FORK_MASTERY.quality_awards.entries()) {
      expect(qualityXp({ type: 'cp', value: 0 }, { type: 'cp', value: -band.max_loss_cp }).xp).toBe(band.xp);
      const after = qualityXp({ type: 'cp', value: 0 }, { type: 'cp', value: -band.max_loss_cp - 1 }).xp;
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
    expect(assessFork(game, fork, checkpoint(23))).toMatchObject({ status: 'qualified', event: { amount: 89, ply: 1 } });
  });
  it('derives levels at each authored boundary and caps at the final level', () => {
    FORK_MASTERY.level_thresholds.forEach((xp, i) => {
      expect(masteryProgress(xp).level).toBe(i + 1);
      if (xp) expect(masteryProgress(xp - 1).level).toBe(i);
    });
    expect(masteryProgress(999999)).toMatchObject({ level: 10, next: undefined });
  });
  it('saves XP as evidence-bearing move contributions, preserves it without a cache, and removes it on color correction', () => {
    const saved = grant();
    expect(projectCollection([saved]).mastery.xp).toBe(137);
    const earned = saved.events.find(event => event.kind === 'mastery')!;
    expect(earned).toMatchObject({ kind: 'mastery', amount: 137, evidence: { ruleVersion: FORK_MASTERY.rule_version, materialGainCp: 200 } });
    expect(retainMastery(saved, 'white', contributions(game, 'white'))).toEqual(saved.events);
    expect(retainMastery(saved, 'white', contributions(game, 'white', checkpoint(61)))).toEqual(saved.events);
    expect(retainMastery(saved, 'black', contributions(game, 'black'))).not.toContainEqual(earned);
    expect(contributions(game, 'black', checkpoint()).some(event => event.kind === 'mastery')).toBe(false);
    expect(newlyUnlocked([], [saved, { ...saved, id: 'other' }])).toMatchObject({ masteryXp: 274, masteryLevels: [2] });
    expect(newlyUnlocked([], [grant([...saved.events, { ...earned, amount: 1700 }])]).masteryLevels).toEqual([2, 3, 4, 5]);
  });
});
