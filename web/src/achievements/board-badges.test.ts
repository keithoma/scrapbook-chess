import { describe, expect, it } from 'vitest';
import { parseGame, MATE_PGN, type ReplayGame } from '../game';
import { BADGES, progressFor } from './catalog';
import { contributions, newlyUnlocked, prepareGrant, projectCollection } from './collection';

function setup(fen: string, moves: string, result = '1/2-1/2') {
  return parseGame(`[SetUp "1"]\n[FEN "${fen}"]\n[Result "${result}"]\n\n${moves} ${result}`);
}
function rewards(game: ReplayGame, color: 'white' | 'black') {
  return projectCollection([prepareGrant([], game, color)]).totals;
}

describe('board-fact badges', () => {
  it('counts a declared win at game end, with no win progress for a draw or the losing side', () => {
    for (const [result, winner] of [['1-0', 'white'], ['0-1', 'black']] as const) {
      const game = parseGame(`1. e4 e5 2. Nf3 Nc6 ${result}`);
      expect(rewards(game, winner).badge_won_total).toBe(1);
      expect(rewards(game, winner === 'white' ? 'black' : 'white').badge_won_total).toBe(0);
      expect(contributions(game, winner).find(event => event.kind === 'badge' && event.badgeId === 'badge_won_total')?.ply).toBe(4);
    }
    expect(rewards(parseGame('1. e4 e5 1/2-1/2'), 'white').badge_won_total).toBe(0);
  });

  it('uses board-proven mate for wins and counts the mating move as one check', () => {
    const game = parseGame(MATE_PGN.replace('2. g4 *', '2. g4 Qh4# *'));
    expect(rewards(game, 'black')).toMatchObject({ badge_won_total: 1, badge_total_checks: 1 });
    expect(rewards(game, 'white')).toMatchObject({ badge_won_total: 0, badge_total_checks: 0 });
    expect(contributions(game, 'black').find(event => event.kind === 'badge' && event.badgeId === 'badge_total_checks')?.ply).toBe(4);
  });

  it('counts castling checks without capturing the friendly rook, and a double check once', () => {
    const castle = setup('5k2/8/8/8/8/8/8/4K2R w K - 0 1', '1. O-O+');
    expect(castle.moves[0]).toMatchObject({ san: 'O-O+', check: true, captured: undefined });
    expect(rewards(castle, 'white')).toMatchObject({ badge_total_checks: 1, badge_material_total: 0 });
    const double = setup('4k3/8/8/8/8/8/4B3/K3R3 w - - 0 1', '1. Bb5+');
    expect(rewards(double, 'white').badge_total_checks).toBe(1);
  });

  it('counts en passant as one captured pawn, including an en-passant discovered check', () => {
    const game = setup('8/8/8/4RPpk/8/8/8/4K3 w - g6 0 1', '1. fxg6+');
    expect(game.moves[0]).toMatchObject({ enPassant: true, captured: 'pawn', check: true });
    expect(rewards(game, 'white')).toMatchObject({ badge_en_passant: 1, badge_material_total: 1, badge_total_checks: 1 });
    expect(rewards(game, 'black')).toMatchObject({ badge_en_passant: 0, badge_material_total: 0, badge_total_checks: 0 });
  });

  it('counts queen exchanges as gross captures for each player', () => {
    const game = setup('3r2k1/8/3q4/8/3Q4/2P5/8/7K w - - 0 1', '1. Qxd6 Rxd6');
    expect(rewards(game, 'white').badge_material_total).toBe(9);
    expect(rewards(game, 'black').badge_material_total).toBe(9);
    expect(game.moves.map(move => move.captured)).toEqual(['queen', 'queen']);
  });

  it('counts all promotions for either color and never invents captures for a quiet promotion', () => {
    for (const [role, san] of [['queen', 'Q+'], ['rook', 'R+'], ['bishop', 'B'], ['knight', 'N']] as const) {
      for (const [color, fen, moves] of [
        ['white', '7k/P7/8/8/8/8/8/7K w - - 0 1', `1. a8=${san}`],
        ['black', '7k/8/8/8/8/8/p7/7K b - - 0 1', `1... a1=${san}`],
      ] as const) {
        const game = setup(fen, moves);
        expect(game.moves[0].promotion).toBe(role);
        expect(rewards(game, color)).toMatchObject({ badge_promotion: 1, badge_material_total: 0 });
        expect(rewards(game, color === 'white' ? 'black' : 'white').badge_promotion).toBe(0);
      }
    }
  });

  it('values a capture-promotion by the captured piece and later captures by the promoted role', () => {
    const capture = setup('1r5k/P7/8/8/8/8/8/7K w - - 0 1', '1. axb8=Q+');
    expect(rewards(capture, 'white')).toMatchObject({ badge_promotion: 1, badge_material_total: 5, badge_total_checks: 1 });
    for (const [promotion, value] of [['Q+', 9], ['R+', 5], ['B', 3], ['N', 3]] as const) {
      const game = setup('7k/Pb6/8/8/8/8/8/6K1 w - - 0 1', `1. a8=${promotion} Bxa8`);
      expect(rewards(game, 'white')).toMatchObject({ badge_promotion: 1, badge_material_total: 0 });
      expect(rewards(game, 'black')).toMatchObject({ badge_promotion: 0, badge_material_total: value });
    }
  });

  it('preserves original win/material flavor and the promotion-specific tier set', () => {
    const winner = BADGES.find(badge => badge.id === 'badge_won_total')!;
    expect(progressFor(winner, 1).tier?.flavor?.player_quote).toBe("I like the moment when I break a man's ego.");
    expect(progressFor(winner, 1).next?.amount).toBe(7);
    const material = BADGES.find(badge => badge.id === 'badge_material_total')!;
    expect(progressFor(material, 420).tier?.flavor_text).toContain('queen trades');
    const promotion = BADGES.find(badge => badge.id === 'badge_promotion')!;
    expect(promotion.config.tiers.map(tier => [tier.name, tier.amount])).toEqual([['bronze', 10], ['silver', 50], ['gold', 250]]);
    const record = prepareGrant([], parseGame('1. e4 e5 1-0'), 'white');
    record.events = [{ kind: 'badge', badgeId: 'badge_promotion', amount: 250, ply: 1 }];
    expect(newlyUnlocked([], [record]).tiers.map(item => item.tier.name)).toEqual(['bronze', 'silver', 'gold']);
  });

  it('adds new board badges to old game records on recollection without duplicating totals', () => {
    const game = parseGame('1. e4 d5 2. exd5 1-0');
    const previous = prepareGrant([], game, 'white');
    previous.events = previous.events.filter(event => event.kind !== 'badge' || ['badge_played_total', 'badge_moves_played', 'badge_en_passant'].includes(event.badgeId));
    const updated = prepareGrant([previous], game, 'white');
    expect(projectCollection([updated]).totals).toMatchObject({ badge_played_total: 1, badge_moves_played: 2, badge_material_total: 1, badge_won_total: 1 });
    expect(prepareGrant([updated], game, 'white').events).toEqual(updated.events);
    expect(newlyUnlocked([updated], [updated]).tiers).toEqual([]);
  });
});
