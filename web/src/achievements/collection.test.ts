import { describe, expect, it } from 'vitest';
import { Chess } from 'chessops/chess';
import { parseFen, makeFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';
import { makeSanAndPlay } from 'chessops/san';
import { parseGame, MATE_PGN, type ReplayGame } from '../game';
import { RECENT_GAME_PGN } from '../fixtures';
import type { Checkpoint } from '../storage';
import { BADGES, progressFor } from './catalog';
import { contributions, gameIdentity, isCompletedGame, newlyUnlocked, projectCollection, virtualMate, type GameGrant } from './collection';

const WHITE_FEN = '8/8/8/8/8/1NK5/R6R/1k6 w - - 0 1';
const BLACK_FEN = '8/8/8/8/8/1nk5/r6r/1K6 b - - 0 1';
function mateGame(fen: string, move: string) {
  return parseGame(`[SetUp "1"]\n[FEN "${fen}"]\n\n${fen.includes(' b ') ? '1...' : '1.'} ${move} *`);
}
function grant(game: ReplayGame, color: 'white' | 'black', checkpoint?: Checkpoint): GameGrant {
  return { id: gameIdentity(game), version: 1, pgn: game.pgn, color, events: contributions(game, color, checkpoint), collectedAt: '2026-11-08', updatedAt: '2026-11-08' };
}
function simulated(game: ReplayGame, moves: string[]): Checkpoint {
  const pos = Chess.fromSetup(parseFen(game.frames.at(-1)!.fen).unwrap()).unwrap();
  return { key: 'fixture', version: 'fixture', pgn: game.pgn, results: [], updatedAt: '', virtualStatus: 'mate', virtual: moves.map(uci => {
    const san = makeSanAndPlay(pos, parseUci(uci)!);
    return { uci, san, fen: makeFen(pos.toSetup()) };
  }) };
}

describe('local contribution extraction', () => {
  it('recognizes the supplied game, its /game/ Lichess URL, and Black’s actual contributions', () => {
    const game = parseGame(RECENT_GAME_PGN);
    expect(gameIdentity(game)).toBe('lichess:jrhXaNf4');
    expect(game.moves).toHaveLength(52);
    expect(game.moves.at(-1)?.san).toBe('Qe1+');
    expect(game.frames.at(-1)?.checkmate).toBe(false);
    const rewards = projectCollection([grant(game, 'black')]);
    expect(rewards.totals).toMatchObject({ badge_played_total: 1, badge_won_total: 1, badge_moves_played: 26,
      badge_total_checks: 2, badge_material_total: 11, badge_promotion: 0, badge_en_passant: 0 });
    expect(rewards.scraps).toEqual([]);
  });
  it('uses exact legal SAN, including file disambiguation, captures, and promotions', () => {
    const cases = [
      [WHITE_FEN, 'Rab2#'], [WHITE_FEN, 'Rhb2#'],
      ['1R6/8/8/8/2N5/2K5/k1N5/1R6 w - - 0 1', 'R1b2#'],
      ['8/8/8/8/8/1NK5/Rp5R/1k6 w - - 0 1', 'Raxb2#'],
      ['7k/P7/6K1/8/8/8/8/8 w - - 0 1', 'a8=Q#'],
      ['7k/P7/6K1/8/8/8/8/8 w - - 0 1', 'a8=R#'],
    ];
    const games = cases.map(([fen, san]) => grant(mateGame(fen, san), 'white'));
    expect(projectCollection(games).scraps.map(s => s.notation).sort()).toEqual(cases.map(c => c[1]).sort());
    expect(contributions(mateGame(WHITE_FEN, 'Rab2#'), 'black').filter(e => e.kind === 'scrap')).toEqual([]);
  });
  it('counts only the selected side’s moves and en passant, including drawn games', () => {
    const game = parseGame('1. e4 a6 2. e5 d5 3. exd6 1/2-1/2');
    expect(projectCollection([grant(game, 'white')]).totals).toMatchObject({ badge_played_total: 1, badge_won_total: 0,
      badge_moves_played: 3, badge_total_checks: 0, badge_material_total: 1, badge_promotion: 0, badge_en_passant: 1 });
    expect(projectCollection([grant(game, 'black')]).totals).toMatchObject({ badge_played_total: 1, badge_won_total: 0,
      badge_moves_played: 2, badge_total_checks: 0, badge_material_total: 0, badge_promotion: 0, badge_en_passant: 0 });
    expect(contributions(game, 'white').find(e => e.kind === 'badge' && e.badgeId === 'badge_en_passant')?.ply).toBe(5);
  });
  it('rejects unfinished games while accepting board-proven mate with an unknown result', () => {
    expect(() => contributions(parseGame(MATE_PGN), 'black')).toThrow(/completed/);
    expect(isCompletedGame(mateGame(WHITE_FEN, 'Rab2#'))).toBe(true);
  });
  it('identifies re-exports of a game consistently without merging different platform IDs', () => {
    expect(gameIdentity(parseGame('1. e4 e5 1-0'))).toBe(gameIdentity(parseGame('1.e4 {hello} e5 1-0')));
    const game = (site: string) => parseGame(`[Site "${site}"]\n\n1. e4 e5 1-0`);
    expect(gameIdentity(game('https://lichess.org/abcd1234/black'))).toBe(gameIdentity(game('https://lichess.org/abcd1234')));
    expect(gameIdentity(game('https://lichess.org/game/abcd1234'))).toBe(gameIdentity(game('https://lichess.org/abcd1234')));
    expect(gameIdentity(game('https://lichess.org/abcd1234'))).not.toBe(gameIdentity(game('https://lichess.org/abcd1235')));
  });
});

describe('scrap collection and tier progression', () => {
  it('upgrades a virtual scrap to real, combines colors, and never counts virtual occurrences', () => {
    const unfinished = parseGame('[SetUp "1"]\n[FEN "8/8/8/8/8/1NK5/R6R/2k5 b - - 0 1"]\n\n1... Kb1 1-0');
    const virtual = grant(unfinished, 'white', simulated(unfinished, ['a2b2']));
    const white = grant(mateGame(WHITE_FEN, 'Rab2#'), 'white');
    const black = grant(mateGame(BLACK_FEN, 'Rab2#'), 'black');
    const onlyVirtual = projectCollection([virtual]).scraps;
    expect(onlyVirtual).toHaveLength(1);
    expect(onlyVirtual[0].mode).toBe('virtual');
    expect(onlyVirtual[0].realCounts).toEqual({ white: 0, black: 0 });
    const both = projectCollection([virtual, white, black]).scraps;
    expect(both).toHaveLength(1);
    expect(both[0].mode).toBe('real');
    expect(both[0].realCounts).toEqual({ white: 1, black: 1 });
    expect(newlyUnlocked([virtual], [virtual, white]).scraps[0].mode).toBe('real');
    expect(newlyUnlocked([white], [white, virtual]).scraps).toEqual([]);
  });
  it('validates simulated moves instead of trusting a claimed winner, SAN, or FEN', () => {
    const game = parseGame(MATE_PGN.replaceAll('*', '0-1'));
    const checkpoint = simulated(game, ['d8h4']);
    checkpoint.virtualWinner = 'white';
    expect(virtualMate(game, checkpoint)?.color).toBe('black');
    expect(contributions(game, 'white', checkpoint).filter(e => e.kind === 'scrap')).toEqual([]);
    checkpoint.virtual[0].san = 'Rab2#';
    expect(virtualMate(game, checkpoint)).toBeUndefined();
    expect(virtualMate(game, { ...checkpoint, pgn: 'different' })).toBeUndefined();
  });
  it('never gives board-event badge progress for a virtual checkmate or capture', () => {
    const game = parseGame('[SetUp "1"]\n[FEN "8/8/8/8/8/1NK5/Rp5R/2k5 b - - 0 1"]\n\n1... Kb1 1-0');
    const checkpoint = simulated(game, ['a2b2']);
    expect(virtualMate(game, checkpoint)?.notation).toBe('Raxb2#');
    for (const color of ['white', 'black'] as const) {
      const actual = contributions(game, color).filter(event => event.kind === 'badge');
      expect(contributions(game, color, checkpoint).filter(event => event.kind === 'badge')).toEqual(actual);
    }
    // The engine can find a win even when the PGN declares a different result.
    const lost = parseGame(MATE_PGN.replaceAll('*', '1-0'));
    const line = simulated(lost, ['d8h4']);
    expect(projectCollection([grant(lost, 'black', line)]).totals).toMatchObject({ badge_won_total: 0, badge_total_checks: 0 });
  });
  it('loads authored thresholds and awards every crossed tier without rewriting them', () => {
    const obsession = BADGES.find(b => b.id === 'badge_played_total')!;
    expect(progressFor(obsession, 1).tier?.name).toBe('stone');
    expect(progressFor(obsession, 1).next?.amount).toBe(16);
    const record = grant(mateGame(WHITE_FEN, 'Rab2#'), 'white');
    record.events = [{ kind: 'badge', badgeId: 'badge_moves_played', amount: 900, ply: 1 }];
    expect(newlyUnlocked([], [record]).tiers.map(t => t.tier.name)).toEqual(['pawn', 'knight', 'bishop', 'rook', 'queen', 'king', 'immortal', 'legend']);
    expect(newlyUnlocked([record], [record]).tiers).toEqual([]);
  });
});
