import { describe, expect, it } from 'vitest';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import { parseSquare } from 'chessops/util';
import { parseGame } from '../game';
import ne2Pgn from '../fixtures/games/halce-noctu2nality-ne2.pgn?raw';
import nxd4Pgn from '../fixtures/games/halce-noctu2nality-nxd4.pgn?raw';
import { knightForkCandidates } from './knight-forks';
import { forkMaterialThreat } from './fork-material';
import { balance, captureGain } from './material';

describe('Halce–noctu2nality fork material', () => {
  it('qualifies Ne2+ even though the queen can capture the defended knight', () => {
    const game = parseGame(ne2Pgn);
    const fork = knightForkCandidates(game)[0];
    expect(fork).toMatchObject({
      san: 'Ne2+',
      capturable: true,
      pinned: false,
    });
    expect(forkMaterialThreat(game, fork)).toMatchObject({
      status: 'qualified',
      gainCp: 500,
      capture: 'Nxd4',
    });

    const pos = Chess.fromSetup(
      parseFen(game.frames[fork.ply].fen).unwrap(),
    ).unwrap();
    const next = pos.clone();
    next.play(parseSan(next, 'Qxe2')!);
    expect(
      balance(next, 'black') -
        balance(pos, 'black') +
        captureGain(next, parseSquare('e8')!, parseSquare('e2')!, {
          nodes: 20_000,
        }),
    ).toBe(600);
  });

  it('rejects Nxd4 because Qc3 saves the queen and defends the bishop', () => {
    const game = parseGame(nxd4Pgn);
    const fork = knightForkCandidates(game)[0];
    expect(fork).toMatchObject({
      san: 'Nxd4',
      capturable: false,
      pinned: false,
    });
    expect(forkMaterialThreat(game, fork)).toEqual({
      status: 'rejected',
      reason: 'no-gain',
    });
    const pos = Chess.fromSetup(
      parseFen(game.frames[fork.ply].fen).unwrap(),
    ).unwrap();
    pos.play(parseSan(pos, 'Qc3')!);
    expect(
      captureGain(pos, parseSquare('d4')!, parseSquare('c2')!, {
        nodes: 20_000,
      }),
    ).toBe(0);
  });
});

it('qualifies the defended knight sacrifice with colors reversed', () => {
  const game = parseGame(
    '[SetUp "1"]\n[FEN "5rk1/ppb2p2/5q1p/2pr1Np1/8/2P2PP1/PPQ2PK1/4R3 w - - 0 24"]\n\n24. Ne7+ *',
  );
  const fork = knightForkCandidates(game)[0];
  expect(fork.capturable).toBe(true);
  expect(forkMaterialThreat(game, fork)).toMatchObject({
    status: 'qualified',
    gainCp: 500,
    capture: 'Nxd5',
  });
});

it.each([
  // No defender: Qxe2 simply wins the knight.
  ['8/ppq2pk1/2p2pp1/8/2PR1nP1/5Q1P/PPB2P2/5RK1', 'Ne2+'],
  // The defender can recapture a bishop, but only trades equal material.
  ['4r3/ppq2pk1/2p2pp1/8/2PR1nP1/5B1P/PPB2P2/5RK1', 'Ne2+'],
  // A hanging queen elsewhere does not compensate for losing the knight.
  ['8/ppq2pk1/2p2pp1/8/2PR1nP1/5Q1P/PPB2P2/2R2RK1', 'Ne2+'],
  // Recapturing the rook that took the knight loses the defender in return.
  ['4r3/ppq2pk1/2p2pp1/8/2PR1nP1/4RQ1P/PPB2R2/5RK1', 'Ne2+'],
])(
  'rejects a knight capture without a profitable recapture: %s',
  (board, move) => {
    const game = parseGame(
      `[SetUp "1"]\n[FEN "${board} b - - 0 24"]\n\n24... ${move} *`,
    );
    const fork = knightForkCandidates(game)[0];
    expect(fork.capturable).toBe(true);
    expect(forkMaterialThreat(game, fork)).toEqual({
      status: 'rejected',
      reason: 'capturable',
    });
  },
);
