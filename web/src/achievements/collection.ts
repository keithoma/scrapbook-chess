import { Chess } from 'chessops/chess';
import { parseFen, makeFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';
import { makeSanAndPlay } from 'chessops/san';
import type { Color, Role } from 'chessops/types';
import type { ReplayGame } from '../game';
import type { GameRatings } from '../../../shared/ratings';
import { lichessSpeed } from '../time-control';
import type { Checkpoint, VirtualMove } from '../storage';
import { BADGES, BADGE_IDS, RATING_GAPS, type BadgeId } from './catalog';
import { masteryContributions, masteryProgress, type MasteryContribution } from './mastery';
import { calendarContributions } from './calendar';
import { phaseAt } from './phases';
import { fianchettoContributions } from './fianchetto';
import { clockContributions } from './clock-badges';
import { precisionContributions } from './precision';

export type Contribution =
  | MasteryContribution
  | { kind: 'badge'; badgeId: BadgeId; amount: number; ply: number; originPly?: number; evidence?: Record<string, string | number> }
  | { kind: 'scrap'; notation: string; mode: 'real' | 'virtual'; ply: number; virtualPly?: number };
export interface GameGrant {
  id: string;
  version: 1;
  pgn: string;
  timeControl?: string;
  ratings?: GameRatings;
  startedAt?: number;
  timeZone?: string;
  clocks?: (number | null)[];
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
  const speed = lichessSpeed(game.timeControl);
  if (speed) events.push({ kind: 'badge', badgeId: `badge_played_${speed}`, amount: 1, ply: game.moves.length });
  const last = game.moves.at(-1)!;
  const winner = game.frames.at(-1)!.checkmate ? last.color : game.result === '1-0' ? 'white' : game.result === '0-1' ? 'black' : undefined;
  if (winner === color) events.push({ kind: 'badge', badgeId: 'badge_won_total', amount: 1, ply: game.moves.length });
  const phaseWin = winner === color && BADGES.find(badge => badge.config.metric_key === `is_${phaseAt(game)}_win`);
  if (phaseWin) events.push({ kind: 'badge', badgeId: phaseWin.id, amount: 1, ply: game.moves.length });
  const speedWin = speed && BADGE_IDS.find(id => id === `badge_won_${speed}`);
  if (winner === color && speedWin) events.push({ kind: 'badge', badgeId: speedWin, amount: 1, ply: game.moves.length });
  const whiteCastle = game.moves.find(move => move.color === 'white' && move.castling)?.castling;
  const blackCastle = game.moves.find(move => move.color === 'black' && move.castling)?.castling;
  if (winner === color && whiteCastle && blackCastle && whiteCastle !== blackCastle) {
    events.push({ kind: 'badge', badgeId: 'badge_opposite_side_casteling', amount: 1, ply: game.moves.length });
  }
  const player = game.ratings[color];
  const opponent = game.ratings[color === 'white' ? 'black' : 'white'];
  if (player && opponent && !player.provisional && !opponent.provisional) {
    const gap = opponent.value - player.value;
    if (winner === color && gap >= RATING_GAPS.win) events.push({ kind: 'badge', badgeId: 'badge_upset', amount: 1, ply: game.moves.length });
    if (!winner && game.result === '1/2-1/2' && gap >= RATING_GAPS.draw) events.push({ kind: 'badge', badgeId: 'hold_your_own', amount: 1, ply: game.moves.length });
  }
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
  return [...events, ...precisionContributions(game, color, winner, BADGES, checkpoint), ...clockContributions(game, color, winner, BADGES), ...fianchettoContributions(game, color, BADGES.find(badge => badge.id === 'badge_fianchetto_total')),
    ...calendarContributions(game, color, winner, BADGES), ...masteryContributions(game, color, checkpoint)];
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

export function retainCollectedEvidence(previous: GameGrant | undefined, color: Color, events: Contribution[]): Contribution[] {
  const stable = retainMastery(previous, color, events);
  if (previous?.color !== color) return stable;
  const engineBadge = (event: Contribution) => event.kind === 'badge' && BADGES.find(badge => badge.id === event.badgeId)?.config.analysis_required;
  const awards = new Map(stable.filter(engineBadge).map(event => [`${event.kind === 'badge' ? event.badgeId : ''}:${event.ply}`, event]));
  for (const event of previous.events.filter(engineBadge)) awards.set(`${event.kind === 'badge' ? event.badgeId : ''}:${event.ply}`, event);
  return [...stable.filter(event => !engineBadge(event)), ...[...awards.values()].sort((a, b) => a.ply - b.ply)];
}

export function prepareGrant(before: GameGrant[], game: ReplayGame, color: Color, checkpoint?: Checkpoint, now = new Date().toISOString()): GameGrant {
  const id = gameIdentity(game);
  const previous = before.find(entry => entry.id === id);
  game = { ...game, timeZone: previous?.timeZone ?? game.timeZone ?? 'UTC' };
  let events = contributions(game, color, checkpoint);
  const previousVirtual = previous?.color === color ? previous.events.filter(event => event.kind === 'scrap' && event.mode === 'virtual') : [];
  const keepVirtual = previousVirtual.length > 0 && !events.some(event => event.kind === 'scrap' && event.mode === 'real');
  if (keepVirtual) events = [...events.filter(event => !(event.kind === 'scrap' && event.mode === 'virtual')), ...previousVirtual];
  const virtual = keepVirtual ? previous?.virtual
    : events.some(event => event.kind === 'scrap' && event.mode === 'virtual') ? structuredClone(checkpoint?.virtual) : undefined;
  return { id, version: 1, pgn: game.pgn, timeControl: game.timeControl, ratings: structuredClone(game.ratings), startedAt: game.startedAt, timeZone: game.timeZone, clocks: game.moves.some(move => move.clock !== undefined) ? game.moves.map(move => move.clock ?? null) : undefined, color, events: retainCollectedEvidence(previous, color, events), virtual,
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
