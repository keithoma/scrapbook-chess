import { describe, expect, it } from 'vitest';
import { makeSquare } from 'chessops/util';
import { RECENT_GAME_PGN } from '../fixtures';
import { parseGame } from '../game';
import type { MoveResult } from '../storage';
import { forkEngineEvidence, knightForkCandidates } from './knight-forks';

const WHITE = '[SetUp "1"]\n[FEN "3q3k/8/8/4N3/8/8/8/7K w - - 0 1"]\n\n1. Nf7+ *';
const BLACK = '[SetUp "1"]\n[FEN "7k/8/8/8/4n3/8/8/3Q3K b - - 0 1"]\n\n1... Nf2+ *';

describe('knight-fork inspection candidates', () => {
  it('finds royal forks for either color and leaves the replay unchanged', () => {
    for (const [pgn, color, knight, queen, king] of [
      [WHITE, 'white', 'f7', 'd8', 'h8'], [BLACK, 'black', 'f2', 'd1', 'h1'],
    ]) {
      const game = parseGame(pgn);
      const original = structuredClone(game);
      const candidates = knightForkCandidates(game);
      expect(candidates).toHaveLength(1);
      const fork = candidates[0];
      expect(fork.color).toBe(color);
      expect(makeSquare(fork.square)).toBe(knight);
      expect(fork.targets.map(target => `${target.role}:${makeSquare(target.square)}`).sort())
        .toEqual([`king:${king}`, `queen:${queen}`]);
      expect(fork.pinned).toBe(false);
      expect(fork.capturable).toBe(false);
      expect(game).toEqual(original);
    }
  });

  it('retains a geometrical fork by a newly pinned knight as a counterexample', () => {
    const game = parseGame('[SetUp "1"]\n[FEN "k3r3/8/8/8/3N4/2r3r1/8/4K3 w - - 0 1"]\n\n1. Ne2 *');
    const [fork] = knightForkCandidates(game);
    expect(fork.pinned).toBe(true);
    expect(fork.targets.map(target => makeSquare(target.square))).toEqual(['c3', 'g3']);
    expect(fork.capturable).toBe(true);
  });

  it('includes low-value attacks for review rather than silently awarding progress', () => {
    const game = parseGame('[SetUp "1"]\n[FEN "7k/3b4/8/8/2p5/3N4/8/7K w - - 0 1"]\n\n1. Ne5 *');
    expect(knightForkCandidates(game)[0].targets.map(target => target.role)).toEqual(['pawn', 'bishop']);
  });

  it('handles a knight underpromotion', () => {
    const game = parseGame('[SetUp "1"]\n[FEN "k7/4P3/3r1q2/8/8/8/8/7K w - - 0 1"]\n\n1. e8=N *');
    expect(knightForkCandidates(game)[0].targets.map(target => target.role)).toEqual(['rook', 'queen']);
  });

  it('does not report friendly pieces, single targets, or unmoved knights', () => {
    expect(knightForkCandidates(parseGame('1. Nf3 Nc6 *'))).toEqual([]);
    const single = '[SetUp "1"]\n[FEN "k2q4/8/8/4N3/8/8/8/7K w - - 0 1"]\n\n1. Nf7 *';
    expect(knightForkCandidates(parseGame(single))).toEqual([]);
    const stationary = '[SetUp "1"]\n[FEN "7k/8/8/1q6/3N4/1r6/7P/7K w - - 0 1"]\n\n1. h3 *';
    expect(knightForkCandidates(parseGame(stationary))).toEqual([]);
    const onlyFriendly = '[SetUp "1"]\n[FEN "7k/3B4/8/8/2P5/3N4/8/7K w - - 0 1"]\n\n1. Ne5 *';
    expect(knightForkCandidates(parseGame(onlyFriendly))).toEqual([]);
  });

  it('identifies the actual Nxe3 in the supplied Black game, including the available recapture', () => {
    const fork = knightForkCandidates(parseGame(RECENT_GAME_PGN)).find(candidate => candidate.ply === 30)!;
    expect(fork.san).toBe('Nxe3');
    expect(fork.color).toBe('black');
    expect(fork.capturable).toBe(true);
    expect(fork.targets.map(target => `${target.role}:${makeSquare(target.square)}`).sort()).toEqual(['pawn:g2', 'queen:c2', 'rook:f1']);
  });
});

describe('fork engine evidence', () => {
  const white = knightForkCandidates(parseGame(WHITE))[0];
  const black = knightForkCandidates(parseGame(BLACK))[0];
  const result: MoveResult = { ply: 1, best: { type: 'cp', value: 100 }, played: { type: 'cp', value: -150 }, bestMove: 'e5f7', ms: 10 };

  it('keeps missing or unrelated analysis pending', () => {
    expect(forkEngineEvidence(white)).toBeUndefined();
    expect(forkEngineEvidence(white, { ...result, ply: 2 })).toBeUndefined();
  });
  it('normalizes both colors to the moving player and formats the best move as SAN', () => {
    expect(forkEngineEvidence(white, result)).toMatchObject({ lossCp: 250, bestMove: 'Nf7+' });
    expect(forkEngineEvidence(black, { ...result, bestMove: 'e4f2' })).toEqual({
      best: { type: 'cp', value: -100 }, played: { type: 'cp', value: 150 }, bestMove: 'Nf2+', lossCp: 0,
    });
    expect(forkEngineEvidence(black, { ...result, best: { type: 'cp', value: -300 }, played: { type: 'cp', value: 200 }, bestMove: 'e4f2' })?.lossCp).toBe(500);
  });
  it('never converts mate distances into centipawn losses', () => {
    for (const [best, played] of [
      [{ type: 'mate', value: 2 }, { type: 'cp', value: 500 }],
      [{ type: 'cp', value: 10 }, { type: 'mate', value: -3 }],
      [{ type: 'mate', value: 2 }, { type: 'mate', value: 5 }],
    ] as const) {
      const evidence = forkEngineEvidence(white, { ...result, best, played });
      expect(evidence?.lossCp).toBeUndefined();
      expect(evidence?.best).toEqual(best);
      expect(evidence?.played).toEqual(played);
    }
  });
});
