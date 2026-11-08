export function timeZone(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim() || value.length > 128) return;
  try { return new Intl.DateTimeFormat('en-US', { timeZone: value.trim() }).resolvedOptions().timeZone; }
  catch { return; }
}

export function utcGameStart(headers: Map<string, string>): number | undefined {
  const date = headers.get('UTCDate') ?? (headers.get('Timezone') === 'UTC' ? headers.get('Date') : undefined);
  const clock = headers.get('UTCTime') ?? (headers.get('Timezone') === 'UTC' ? headers.get('StartTime') : undefined);
  if (!date || !clock || !/^\d{4}\.\d{2}\.\d{2}$/.test(date) || !/^\d{2}:\d{2}:\d{2}$/.test(clock)) return;
  const iso = `${date.replaceAll('.', '-')}T${clock}Z`;
  const value = Date.parse(iso);
  return Number.isFinite(value) && new Date(value).toISOString() === iso.replace('Z', '.000Z') ? value : undefined;
}
