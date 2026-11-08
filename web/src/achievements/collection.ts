import { Chess } from 'chessops/chess';
import { parseFen, makeFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';
import { makeSanAndPlay } from 'chessops/san';
import type { Color, Role } from 'chessops/types';
import type { ReplayGame } from '../game';
import type { Checkpoint, VirtualMove } from '../storage';
import { BADGES, BADGE_IDS, type BadgeId } from './catalog';
import { masteryContributions, masteryProgress, type MasteryContribution } from './mastery';

export type Contribution =
  | MasteryContribution
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
  source?: { platform: 'lichess' | 'chesscom'; username: string };
}
export interface Scrap {
  notation: string;
  mode: 'real' | 'virtual';
  realCounts: Record<Color, number>;
  occurrences: { gameId: string; color: Color; event: Extract<Contribution, { kind: 'scrap' }> }[];
}

export function gameIdentity(game: ReplayGame): string {
  const lichess = game.site.match(/^https?:\/\/(?:www\.)?lichess\.org\/(?:game\/)?([a-zA-Z0-9]{8})(?:[a-zA-Z0-9]{4})?(?:[/?#]|$)/);
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
  const last = game.moves.at(-1)!;
  const winner = game.frames.at(-1)!.checkmate ? last.color : game.result === '1-0' ? 'white' : game.result === '0-1' ? 'black' : undefined;
  if (winner === color) events.push({ kind: 'badge', badgeId: 'badge_won_total', amount: 1, ply: game.moves.length });
  for (const move of game.moves) {
    if (move.color !== color) continue;
    events.push({ kind: 'badge', badgeId: 'badge_moves_played', amount: 1, ply: move.ply });
    if (move.enPassant) events.push({ kind: 'badge', badgeId: 'badge_en_passant', amount: 1, ply: move.ply });
    if (move.check) events.push({ kind: 'badge', badgeId: 'badge_total_checks', amount: 1, ply: move.ply });
    if (move.promotion) events.push({ kind: 'badge', badgeId: 'badge_promotion', amount: 1, ply: move.ply });
    if (move.captured) events.push({ kind: 'badge', badgeId: 'badge_material_total', amount: MATERIAL_POINTS[move.captured], ply: move.ply });
  }
  if (game.frames.at(-1)!.checkmate && last.color === color) {
    events.push({ kind: 'scrap', mode: 'real', notation: last.san, ply: last.ply });
  } else {
    const mate = virtualMate(game, checkpoint);
    if (mate?.color === color) events.push({ kind: 'scrap', mode: 'virtual', notation: mate.notation, ply: game.moves.length, virtualPly: mate.plies });
  }
  return [...events, ...masteryContributions(game, color, checkpoint)];
}

// Gross captured points, not net advantage. Capture quality and material kept
// for later turns belong to the separate, still-inactive clean-material badges.
const MATERIAL_POINTS: Record<Role, number> = { pawn: 1, knight: 3, bishop: 3, rook: 5, queen: 9, king: 0 };

// Keep already collected XP and evidence stable through cache eviction, partial
// analysis, and tuning changes. Correcting the game's color replaces its awards.
export function retainMastery(previous: GameGrant | undefined, color: Color, events: Contribution[]): Contribution[] {
  const awards = new Map(events.filter((event): event is MasteryContribution => event.kind === 'mastery').map(event => [event.ply, event]));
  if (previous?.color === color) for (const event of previous.events) if (event.kind === 'mastery') awards.set(event.ply, event);
  return [...events.filter(event => event.kind !== 'mastery'), ...[...awards.values()].sort((a, b) => a.ply - b.ply)];
}

export function prepareGrant(before: GameGrant[], game: ReplayGame, color: Color, checkpoint?: Checkpoint, now = new Date().toISOString()): GameGrant {
  let events = contributions(game, color, checkpoint);
  const id = gameIdentity(game);
  const previous = before.find(entry => entry.id === id);
  const previousVirtual = previous?.color === color ? previous.events.filter(event => event.kind === 'scrap' && event.mode === 'virtual') : [];
  const keepVirtual = previousVirtual.length > 0 && !events.some(event => event.kind === 'scrap' && event.mode === 'real');
  if (keepVirtual) events = [...events.filter(event => !(event.kind === 'scrap' && event.mode === 'virtual')), ...previousVirtual];
  const virtual = keepVirtual ? previous?.virtual
    : events.some(event => event.kind === 'scrap' && event.mode === 'virtual') ? structuredClone(checkpoint?.virtual) : undefined;
  return { id, version: 1, pgn: game.pgn, color, events: retainMastery(previous, color, events), virtual,
    collectedAt: previous?.collectedAt ?? now, updatedAt: now };
}

export function projectCollection(games: GameGrant[]) {
  const totals = Object.fromEntries(BADGE_IDS.map(id => [id, 0])) as Record<BadgeId, number>;
  const scraps = new Map<string, Scrap>();
  let masteryXp = 0;
  for (const game of games) for (const event of game.events) {
    if (event.kind === 'badge') { totals[event.badgeId] += event.amount; continue; }
    if (event.kind === 'mastery') { masteryXp += event.amount; continue; }
    const scrap: Scrap = scraps.get(event.notation) ?? { notation: event.notation, mode: 'virtual', realCounts: { white: 0, black: 0 }, occurrences: [] };
    if (event.mode === 'real') { scrap.mode = 'real'; scrap.realCounts[game.color]++; }
    scrap.occurrences.push({ gameId: game.id, color: game.color, event });
    scraps.set(event.notation, scrap);
  }
  return { totals, mastery: masteryProgress(masteryXp), scraps: [...scraps.values()].sort((a, b) => a.notation.localeCompare(b.notation)) };
}

export function newlyUnlocked(before: GameGrant[], after: GameGrant[]) {
  const old = projectCollection(before);
  const next = projectCollection(after);
  return {
    masteryXp: next.mastery.xp - old.mastery.xp,
    masteryLevels: Array.from({ length: Math.max(0, next.mastery.level - old.mastery.level) }, (_, i) => old.mastery.level + i + 1),
    tiers: BADGES.flatMap(badge => badge.config.tiers.filter(tier => old.totals[badge.id] < tier.amount && next.totals[badge.id] >= tier.amount).map(tier => ({ badge, tier }))),
    scraps: next.scraps.filter(scrap => {
      const previous = old.scraps.find(item => item.notation === scrap.notation);
      return !previous || (previous.mode === 'virtual' && scrap.mode === 'real');
    }),
  };
}
