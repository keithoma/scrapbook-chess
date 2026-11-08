import type { Color } from 'chessops/types';
import type { ReplayGame } from '../game';
import type { Badge } from './catalog';
import type { Contribution } from './collection';
import { timeZone } from '../../../shared/time-zone';

export function calendarContributions(game: ReplayGame, color: Color, winner: Color | undefined, badges: Badge[]): Contribution[] {
  const zone = timeZone(game.timeZone);
  if (!zone || game.startedAt === undefined || !Number.isFinite(game.startedAt)) return [];
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: zone, weekday: 'long', hour: '2-digit', hourCycle: 'h23' }).formatToParts(game.startedAt);
  const day = parts.find(part => part.type === 'weekday')!.value.toLowerCase();
  const hour = Number(parts.find(part => part.type === 'hour')!.value);
  const start = Math.floor(hour / 4) * 4;
  const block = `${String(start).padStart(2, '0')}_${String(start + 4).padStart(2, '0')}`;
  const weekend = day === 'saturday' || day === 'sunday';
  return badges.filter(badge => {
    const metric = badge.config.metric_key;
    return metric === 'day_of_week' && badge.config.required_value === day
      || metric === 'time_block' && badge.config.required_value === block
      || metric === 'is_weekday_win' && winner === color && !weekend
      || metric === 'is_weekend_win' && winner === color && weekend;
  }).map(badge => ({ kind: 'badge', badgeId: badge.id, amount: 1, ply: game.moves.length }));
}
