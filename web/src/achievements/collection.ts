import { Chess } from 'chessops/chess';
import { parseFen, makeFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';
import { makeSanAndPlay } from 'chessops/san';
import type { Color } from 'chessops/types';
import type { ReplayGame } from '../game';
import type { Checkpoint, VirtualMove } from '../storage';
import { BADGES, type BadgeId } from './catalog';

export type Contribution =
  | { kind: 'badge'; badgeId: BadgeId; amount: number; ply: number }
  | { kind: 'scrap'; notation: string; mode: 'real' | 'virtual'; ply: number; virtualPly?: number };
export interface GameGrant {
  id: string;
  version: 1;
  pgn: string;
  color: Color;
  events: Contribution[];
  collectedAt: string;
  updatedAt: string;
  virtual?: VirtualMove[];
}
export interface Scrap {
  notation: string;
  mode: 'real' | 'virtual';
  realCounts: Record<Color, number>;
  occurrences: { gameId: string; color: Color; event: Extract<Contribution, { kind: 'scrap' }> }[];
}

export function gameIdentity(game: ReplayGame): string {
  const lichess = game.site.match(/^https?:\/\/(?:www\.)?lichess\.org\/([a-zA-Z0-9]{8})(?:[a-zA-Z0-9]{4})?(?:[/?#]|$)/);
  const chesscom = game.site.match(/^https?:\/\/(?:www\.)?chess\.com\/game\/(live|daily)\/(\d+)/);
  if (lichess) return `lichess:${lichess[1]}`;
  if (chesscom) return `chesscom:${chesscom[1]}:${chesscom[2]}`;
  return JSON.stringify([game.white.toLowerCase(), game.black.toLowerCase(), game.timestamp,
    game.frames[0].fen, game.moves.map(move => move.uci)]);
}

export function isCompletedGame(game: ReplayGame): boolean {
  return ['1-0', '0-1', '1/2-1/2'].includes(game.result) || game.frames.at(-1)!.checkmate;
}

export function virtualMate(game: ReplayGame, checkpoint?: Checkpoint): { notation: string; color: Color; plies: number } | undefined {
  if (!checkpoint || checkpoint.pgn !== game.pgn || checkpoint.virtualStatus !== 'mate'
      || !checkpoint.virtual.length || checkpoint.virtual.length > 20 || game.frames.at(-1)!.checkmate) return;
  try {
    const pos = Chess.fromSetup(parseFen(game.frames.at(-1)!.fen).unwrap()).unwrap();
    if (pos.isEnd()) return;
    let san = '';
    for (const step of checkpoint.virtual) {
      const move = parseUci(step.uci);
      if (pos.isEnd() || !move || !pos.isLegal(move)) return;
      san = makeSanAndPlay(pos, move);
      if (san !== step.san || makeFen(pos.toSetup()) !== step.fen) return;
    }
    if (!pos.isCheckmate() || !san.endsWith('#')) return;
    return { notation: san, color: pos.turn === 'white' ? 'black' : 'white', plies: checkpoint.virtual.length };
  } catch { return; }
}

export function contributions(game: ReplayGame, color: Color, checkpoint?: Checkpoint): Contribution[] {
  if (!isCompletedGame(game)) throw new Error('Only completed games can be collected.');
  const events: Contribution[] = [{ kind: 'badge', badgeId: 'badge_played_total', amount: 1, ply: game.moves.length }];
  for (const move of game.moves) {
    if (move.color !== color) continue;
    events.push({ kind: 'badge', badgeId: 'badge_moves_played', amount: 1, ply: move.ply });
    if (move.enPassant) events.push({ kind: 'badge', badgeId: 'badge_en_passant', amount: 1, ply: move.ply });
  }
  const last = game.moves.at(-1)!;
  if (game.frames.at(-1)!.checkmate && last.color === color) {
    events.push({ kind: 'scrap', mode: 'real', notation: last.san, ply: last.ply });
  } else {
    const mate = virtualMate(game, checkpoint);
    if (mate?.color === color) events.push({ kind: 'scrap', mode: 'virtual', notation: mate.notation, ply: game.moves.length, virtualPly: mate.plies });
  }
  return events;
}

export function projectCollection(games: GameGrant[]) {
  const totals: Record<BadgeId, number> = { badge_played_total: 0, badge_moves_played: 0, badge_en_passant: 0 };
  const scraps = new Map<string, Scrap>();
  for (const game of games) for (const event of game.events) {
    if (event.kind === 'badge') { totals[event.badgeId] += event.amount; continue; }
    const scrap: Scrap = scraps.get(event.notation) ?? { notation: event.notation, mode: 'virtual', realCounts: { white: 0, black: 0 }, occurrences: [] };
    if (event.mode === 'real') { scrap.mode = 'real'; scrap.realCounts[game.color]++; }
    scrap.occurrences.push({ gameId: game.id, color: game.color, event });
    scraps.set(event.notation, scrap);
  }
  return { totals, scraps: [...scraps.values()].sort((a, b) => a.notation.localeCompare(b.notation)) };
}

export function newlyUnlocked(before: GameGrant[], after: GameGrant[]) {
  const old = projectCollection(before);
  const next = projectCollection(after);
  return {
    tiers: BADGES.flatMap(badge => badge.config.tiers.filter(tier => old.totals[badge.id] < tier.amount && next.totals[badge.id] >= tier.amount).map(tier => ({ badge, tier }))),
    scraps: next.scraps.filter(scrap => {
      const previous = old.scraps.find(item => item.notation === scrap.notation);
      return !previous || (previous.mode === 'virtual' && scrap.mode === 'real');
    }),
  };
}
