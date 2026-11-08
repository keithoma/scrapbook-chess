import { describe, expect, it } from 'vitest';
import { Chess } from 'chessops/chess';
import { parseFen, makeFen } from 'chessops/fen';
import { makeSanAndPlay, parseSan } from 'chessops/san';
import { makeUci } from 'chessops/util';
import example from '../fixtures/games/opposite-castling.pgn?raw';
import { parseGame } from '../game';
import type { Checkpoint } from '../storage';
import { BADGES } from './catalog';
import { contributions, newlyUnlocked, prepareGrant, projectCollection } from './collection';

const id = 'badge_opposite_side_casteling';
const FEN = 'r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R';
function setup(moves: string, result = '1-0', turn = 'w', board = FEN, rights = 'KQkq') {
  return parseGame(`[SetUp "1"]\n[FEN "${board} ${turn} ${rights} - 0 1"]\n\n${moves} ${result}`);
}
const awards = (game: ReturnType<typeof parseGame>, color: 'white' | 'black', checkpoint?: Checkpoint) =>
  contributions(game, color, checkpoint).filter(event => event.kind === 'badge' && event.badgeId === id);

describe('Mirror Dimension', () => {
  it('counts one winning game at its final actual ply, after both castling moves', () => {
    for (const color of ['white', 'black'] as const) {
      const game = parseGame(example.replaceAll('1-0', color === 'white' ? '1-0' : '0-1'));
      expect(game.moves.filter(move => move.castling).map(move => [move.color, move.castling, move.ply])).toEqual([
        ['white', 'h', 13], ['black', 'a', 16],
      ]);
      expect(awards(game, color)).toEqual([{ kind: 'badge', badgeId: id, amount: 1, ply: 18 }]);
      expect(awards(game, color === 'white' ? 'black' : 'white')).toEqual([]);
    }
  });

  it('supports either side and castling order, while excluding same-side castling', () => {
    for (const white of ['O-O', 'O-O-O']) for (const black of ['O-O', 'O-O-O']) {
      for (const turn of ['w', 'b']) {
        const moves = turn === 'w' ? `1. ${white} ${black}` : `1... ${black} 2. ${white}`;
        const game = setup(moves, '1-0', turn);
        expect(awards(game, 'white').length).toBe(white === black ? 0 : 1);
      }
    }
  });

  it('does not award draws, losses, unfinished games, or just one castle', () => {
    expect(awards(setup('1. O-O O-O-O', '1/2-1/2'), 'white')).toEqual([]);
    expect(awards(setup('1. O-O O-O-O', '0-1'), 'white')).toEqual([]);
    expect(() => awards(setup('1. O-O O-O-O', '*'), 'white')).toThrow(/completed/);
    expect(awards(setup('1. O-O'), 'white')).toEqual([]);
    expect(awards(setup('1. a3 a6'), 'white')).toEqual([]);
  });

  it('does not infer castling from king destinations, rights, or PGN comments', () => {
    const walked = setup('1. Kg1 {O-O} Kc8 {O-O-O}', '1-0', 'w', 'r2k3r/pppppppp/8/8/8/8/PPPPPPPP/R4K1R', '-');
    expect(walked.moves.map(move => move.castling)).toEqual([undefined, undefined]);
    expect(awards(walked, 'white')).toEqual([]);
  });

  it('keeps the castling history after a king walks away and recognizes O-O+', () => {
    const game = setup('1... O-O-O 2. a3 Rdg8 3. a4 Kd8 4. a5 Ke8 5. a6 Kf8 6. O-O+', '1-0', 'b',
      'r3k2r/ppppp1pp/8/8/8/8/PPPPP1PP/R3K2R');
    expect(game.moves.at(-1)).toMatchObject({ san: 'O-O+', castling: 'h', captured: undefined });
    expect(awards(game, 'white')).toEqual([{ kind: 'badge', badgeId: id, amount: 1, ply: 10 }]);
  });

  it('ignores legal castling in the engine continuation', () => {
    const game = setup('1. a3 a6');
    const pos = Chess.fromSetup(parseFen(game.frames.at(-1)!.fen).unwrap()).unwrap();
    const virtual = ['O-O', 'O-O-O'].map(san => {
      const move = parseSan(pos, san)!;
      expect(pos.isLegal(move)).toBe(true);
      const uci = makeUci(move); const canonical = makeSanAndPlay(pos, move);
      return { uci, san: canonical, fen: makeFen(pos.toSetup()) };
    });
    const checkpoint: Checkpoint = { key: 'fixture', version: 'fixture', pgn: game.pgn, results: [], virtual, virtualStatus: 'limit', updatedAt: '' };
    expect(awards(game, 'white', checkpoint)).toEqual([]);
  });

  it('recollects old games once, corrects color, and preserves the authored tier set', () => {
    const game = parseGame(example);
    const old = prepareGrant([], game, 'white');
    old.events = old.events.filter(event => event.kind !== 'badge' || event.badgeId !== id);
    const saved = prepareGrant([old], game, 'white');
    expect(projectCollection([saved]).totals[id]).toBe(1);
    expect(newlyUnlocked([old], [saved]).tiers.map(item => item.badge.id)).toEqual([id]);
    expect(prepareGrant([saved], game, 'white').events).toEqual(saved.events);
    expect(projectCollection([prepareGrant([saved], game, 'black')]).totals[id]).toBe(0);
    const badge = BADGES.find(item => item.id === id)!;
    expect([badge.name, badge.category, badge.subcategory]).toEqual(['Mirror Dimension', 'Skill', 'Castling']);
    expect(badge.config.tiers.map(tier => tier.amount)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(badge.flavor?.text).toBeTruthy();
    for (const tier of badge.config.tiers) expect(tier.flavor?.text ?? tier.flavor?.player_quote).toBeTruthy();
  });
});
