import { expect, it } from 'vitest';
import { parseGame } from '../game';
import { skewerCandidates, skewerMaterialThreat } from './skewers';

export const rookPgn = '[SetUp "1"]\n[FEN "8/8/8/3k3q/8/8/8/RK6 w - - 0 1"]\n\n1. Ra5+ 1-0';
export const bishopPgn = '[SetUp "1"]\n[FEN "8/8/8/4r3/3k4/8/8/2B4K w - - 0 1"]\n\n1. Bb2+ 1/2-1/2';
it('finds and proves royal skewers from rooks, bishops and queens, for either color', () => {
  for (const [pgn, gain] of [
    [rookPgn, 900],
    [bishopPgn, 200],
    ['[SetUp "1"]\n[FEN "4r3/8/2k5/8/8/8/8/3Q3K w - - 0 1"]\n\n1. Qa4+ 1-0', 500],
    ['[SetUp "1"]\n[FEN "6kr/8/8/8/Q3K3/8/8/8 b - - 0 1"]\n\n1... Rh4+ 0-1', 900],
  ] as const) {
    const game = parseGame(pgn);
    const candidates = skewerCandidates(game);
    expect(candidates).toHaveLength(1);
    expect(skewerMaterialThreat(game, candidates[0])).toMatchObject({
      status: 'qualified',
      gainCp: gain,
    });
  }
});
it('distinguishes pins, equal-value alignments and friendly blockers from skewers', () => {
  for (const fen of [
    '8/8/8/3q3k/8/8/8/RK6 w - - 0 1',
    '7k/8/8/3r3r/8/8/8/RK6 w - - 0 1',
    '8/8/8/3k1P1q/8/8/8/RK6 w - - 0 1',
  ]) {
    const game = parseGame(`[SetUp "1"]\n[FEN "${fen}"]\n\n1. Ra5+ 1-0`);
    expect(skewerCandidates(game)).toEqual([]);
  }
});
it('rejects a capturable attacker and a rear capture that loses more material than it wins', () => {
  const game = parseGame('[SetUp "1"]\n[FEN "8/8/8/3kr2q/8/8/8/RK6 w - - 0 1"]\n\n1. Ra5+ 1-0');
  expect(skewerCandidates(game)).toHaveLength(1);
  expect(skewerMaterialThreat(game, skewerCandidates(game)[0]).status).toBe('rejected');
  const losing = parseGame('[SetUp "1"]\n[FEN "8/8/8/3kr3/8/8/8/QK6 w - - 0 1"]\n\n1. Qa5+ 1-0');
  expect(skewerMaterialThreat(losing, skewerCandidates(losing)[0]).status).toBe('rejected');
});
it('proves relative skewers and handles a front queen capturing a defended attacker', () => {
  for (const [front, rear, backrank] of [
    ['r', 'n', '2B2R1K'],
    ['q', 'r', '1RB2R1K'],
  ] as const) {
    const game = parseGame(
      `[SetUp "1"]\n[FEN "7k/8/5${rear}2/8/3${front}4/8/5PPP/${backrank} w - - 0 1"]\n\n1. Bb2 1-0`,
    );
    const candidates = skewerCandidates(game);
    expect(candidates).toHaveLength(1);
    expect(skewerMaterialThreat(game, candidates[0]).status).toBe(
      front === 'q' ? 'qualified' : 'rejected',
    );
  }
});
it('credits discovered rays once and suppresses unchanged or same-ray slider shuffles', () => {
  const game = parseGame(
    '[SetUp "1"]\n[FEN "8/8/8/RN1k3q/8/8/8/1K6 w - - 0 1"]\n\n1. Nc3+ Ke6 2. Ka1 1-0',
  );
  expect(
    skewerCandidates(game)
      .filter((c) => c.color === 'white')
      .map((c) => c.ply),
  ).toEqual([1]);
  const shuffle = parseGame(
    '[SetUp "1"]\n[FEN "7k/8/5r2/8/3q4/8/1B3PPP/1R3R1K w - - 0 1"]\n\n1. Bc3 1-0',
  );
  expect(skewerCandidates(shuffle)).toEqual([]);
});
