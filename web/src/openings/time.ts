import type { Color } from 'chessops/types';
import type { ReplayGame } from '../game';
import { OPENING_POLICY as policy } from '../achievements/mastery-policy';

export function openingClocks(game: ReplayGame, color: Color): { nominal: number; seconds: Map<number, number> } | undefined {
  const control = /^(\d+)(?:\+(\d+))?$/.exec(game.timeControl);
  if (!control) return;
  const initial = Number(control[1]); const increment = Number(control[2] ?? 0);
  const nominal = initial + 40 * increment;
  if (!Number.isSafeInteger(nominal) || nominal <= 0) return;
  const previous: Partial<Record<Color, number>> = {};
  const seconds = new Map<number, number>();
  for (const move of game.moves) {
    if (move.clock === undefined || !Number.isFinite(move.clock) || move.clock < 0) return;
    const before = previous[move.color];
    // First samples anchor each clock: the platforms' first-move clock rules differ.
    const elapsed = before === undefined ? 0 : before + increment - move.clock;
    if (elapsed < -0.05) return; // Additional time or broken evidence cannot prove thinking time.
    previous[move.color] = move.clock;
    if (move.color === color) seconds.set(move.ply, Math.min(policy.clock_move_cap_seconds, Math.max(0, elapsed)));
  }
  return { nominal, seconds };
}

export function openingTimeMultiplier(nominal: number, creditedSeconds: number): number {
  return Math.max(policy.minimum_time_multiplier,
    (Math.min(nominal, policy.control_cap_seconds) / 600) ** policy.control_exponent *
    (0.25 + 0.75 * Math.sqrt(Math.min(nominal, creditedSeconds) / nominal)) /
    (0.25 + 0.75 * Math.sqrt(0.5)));
}
