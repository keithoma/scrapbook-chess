import type { Color } from 'chessops/types';
import { makeSquare } from 'chessops/util';
import { BADGES } from './achievements/catalog';
import type { Contribution } from './achievements/collection';
import { MASTERIES } from './achievements/mastery-policy';
import { translate, type Locale, type Message, type Parameters } from './i18n';
import type { MoveResult } from './storage';
import type { KnightForkCandidate } from './tactics/knight-forks';
import type { SkewerCandidate } from './tactics/skewers';

export interface ReviewHighlight { ply: number; reasons: string[] }

export function reviewHighlights({ events, forks, skewers, results, color, locale }: {
  events: Contribution[]; forks: KnightForkCandidate[]; skewers: SkewerCandidate[];
  results: MoveResult[]; color: Color | ''; locale: Locale;
}): ReviewHighlight[] {
  const t = (key: Message, parameters?: Parameters) => translate(locale, key, parameters);
  const byPly = new Map<number, Set<string>>();
  const add = (ply: number, reason: string) => {
    if (!byPly.has(ply)) byPly.set(ply, new Set());
    byPly.get(ply)!.add(reason);
  };

  for (const event of events) {
    if (event.kind === 'badge') {
      if (event.originPly === undefined) continue;
      const badge = BADGES.find(badge => badge.id === event.badgeId)!;
      add(event.originPly, t('{badge} +{amount}: {description} Confirmed at ply {ply}.', {
        badge: badge.name, amount: event.amount, description: badge.description, ply: event.ply,
      }));
    } else if (event.kind === 'scrap') {
      add(event.ply, t(event.mode === 'real'
        ? 'Checkmate earned the {move} scrap.'
        : 'The separate engine finish earned the virtual {move} scrap.', { move: event.notation }));
    } else {
      const mastery = t(MASTERIES.find(definition => definition.id === event.masteryId)!.name);
      if (event.family === 'endgame') {
        add(event.evidence.startPly, t('Pawn ending begins: only kings and pawns remain, with pawns on both sides.'));
        add(event.ply, t('{mastery} +{xp} XP for your play from ply {start} through the game result.', {
          mastery, xp: event.amount, start: event.evidence.startPly,
        }));
      } else if (event.family === 'opening') {
        if (event.amount > 0) add(event.ply, t(event.evidence.inBook
          ? '{mastery} +{xp} XP for a book move in this opening.'
          : '{mastery} +{xp} XP for your play beyond the opening book.', { mastery, xp: event.amount }));
        if (event.grade) add(event.ply, `${mastery} · ${t('Opening grade: {grade}', { grade: event.grade })}`);
      } else {
        add(event.ply, t('Qualified tactic: {mastery} +{xp} XP.', { mastery, xp: event.amount }));
      }
    }
  }
  for (const fork of forks.filter(fork => fork.color === color)) {
    add(fork.ply, t('Knight-fork candidate: the knight on {square} attacks enemy pieces on {targets}. This alone does not guarantee mastery XP.', {
      square: makeSquare(fork.square), targets: fork.targets.map(target => makeSquare(target.square)).join(', '),
    }));
  }
  for (const skewer of skewers.filter(skewer => skewer.color === color)) {
    for (const line of skewer.lines) add(skewer.ply, t('Skewer candidate: {attacker} attacks {front} with {rear} behind it. This alone does not guarantee mastery XP.', {
      attacker: line.attackerName, front: line.front.name, rear: line.rear.name,
    }));
  }
  for (const result of results.filter(result => result.annotations?.only && byPly.has(result.ply))) {
    add(result.ply, t('Only move: the played move is a best move, while the next-best engine choice is an inaccuracy or worse.'));
  }
  return [...byPly].sort(([a], [b]) => a - b).map(([ply, reasons]) => ({ ply, reasons: [...reasons] }));
}
