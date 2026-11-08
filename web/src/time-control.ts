export type Speed = 'ultrabullet' | 'hyperbullet' | 'bullet' | 'blitz' | 'rapid' | 'classical';

// Lichess's duration formula, with a separate 30–59 second hyperbullet bucket.
// Only single-stage live controls are supported; never guess from game duration.
export function lichessSpeed(timeControl: string): Speed | undefined {
  const match = /^(\d+)(?:\+(\d+))?$/.exec(timeControl);
  if (!match) return;
  return clockSpeed(Number(match[1]), Number(match[2] ?? 0));
}

export function clockSpeed(initial: number, increment: number): Speed | undefined {
  const seconds = initial + 40 * increment;
  if (!Number.isSafeInteger(initial) || initial < 0 || !Number.isSafeInteger(increment) || increment < 0
      || !Number.isSafeInteger(seconds) || seconds <= 0) return;
  if (seconds < 30) return 'ultrabullet';
  if (seconds < 60) return 'hyperbullet';
  if (seconds < 180) return 'bullet';
  if (seconds < 480) return 'blitz';
  if (seconds < 1500) return 'rapid';
  return 'classical';
}
