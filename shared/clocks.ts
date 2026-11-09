export function pgnClock(comments?: string[]): number | undefined {
  const raw = comments?.join(' ').match(/\[%clk\s+(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)\]/);
  if (!raw) return;
  const hours = Number(raw[1]); const minutes = Number(raw[2]); const seconds = Number(raw[3]);
  const total = hours * 3600 + minutes * 60 + seconds;
  return minutes < 60 && seconds < 60 && Number.isFinite(total) ? total : undefined;
}
export function lichessClocks(raw: unknown, plies: number): (number | null)[] | undefined {
  if (!Array.isArray(raw)) return;
  // Lichess records one final clock state for an unplayed turn when a game ends
  // asynchronously (for example resignation or timeout). Only played plies count.
  if (raw.length !== plies && raw.length !== plies + 1) return Array(plies).fill(null);
  return raw.slice(0, plies).map(value => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value / 100 : null);
}
