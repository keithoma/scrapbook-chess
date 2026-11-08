import { describe, expect, it } from 'vitest';
import { parseGame } from './game';
import { analyzed } from './fixtures/test-analysis';
import { hasCompleteAnalysis } from './review-state';
import { gameLibrary } from './game-library';
import type { ImportedGame } from '../../shared/contracts';

const game = parseGame('[Site "https://lichess.org/Gate0001"]\n\n1. f3 e5 2. g4 Qh4# 0-1');
const complete = { ...analyzed(game), virtualStatus: 'terminal' as const };

describe('review preparation', () => {
  it('keeps review locked through partial move analysis and pending continuation', () => {
    expect(hasCompleteAnalysis(game)).toBe(false);
    expect(hasCompleteAnalysis(game, { ...complete, results: complete.results.slice(0, -1) })).toBe(false);
    expect(hasCompleteAnalysis(game, analyzed(game))).toBe(false);
    expect(hasCompleteAnalysis(game, complete)).toBe(true);
  });
  it('does not unlock review using another game or an outdated checkpoint', () => {
    expect(hasCompleteAnalysis(game, { ...complete, pgn: '1. e4 *' })).toBe(false);
    expect(hasCompleteAnalysis(game, { ...complete, version: 'previous' })).toBe(false);
  });
  it('distinguishes server analysis presence from verified completion and merges local checkpoints with imports', () => {
    const imported: ImportedGame = { id: 'lichess:Gate0001', platform: 'lichess', sourceId: 'Gate0001', username: 'Black', white: game.white, black: game.black, color: 'black', pgn: game.pgn, startedAt: 1, finishedAt: 2, speed: 'blitz', timeControl: '180+0', analyzed: true };
    expect(gameLibrary([complete], [], []).entries[0].status).toBe('Analysis complete');
    expect(gameLibrary([], [], [imported]).entries[0].status).toBe('Analysis saved');
    const library = gameLibrary([complete], [], [imported]);
    expect(library.entries).toHaveLength(1);
    expect(library.entries[0]).toMatchObject({ status: 'Ready to review', color: 'black', source: 'Lichess', game: { timeControl: '180+0' } });
  });
});
