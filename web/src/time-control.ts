export type Speed = 'ultrabullet' | 'bullet' | 'blitz' | 'rapid' | 'classical';

// Lichess FAQ: initial seconds + 40 increments. Platform speed labels may differ.
// Only single-stage live controls are supported; never guess from game duration.
export function lichessSpeed(timeControl: string): Speed | undefined {
  const match = /^(\d+)(?:\+(\d+))?$/.exec(timeControl);
  if (!match) return;
  const initial = Number(match[1]);
  const increment = Number(match[2] ?? 0);
  const seconds = initial + 40 * increment;
  if (!Number.isSafeInteger(initial) || !Number.isSafeInteger(increment)
      || !Number.isSafeInteger(seconds) || seconds <= 0) return;
  if (seconds < 30) return 'ultrabullet';
  if (seconds < 180) return 'bullet';
  if (seconds < 480) return 'blitz';
  if (seconds < 1500) return 'rapid';
  return 'classical';
}
