import { timeZone } from '../../shared/time-zone';
export function initialTimeZone(): string {
  try { return timeZone(localStorage.getItem('scrapbook.time-zone')) ?? timeZone(Intl.DateTimeFormat().resolvedOptions().timeZone) ?? 'UTC'; }
  catch { return 'UTC'; }
}
export function saveTimeZone(zone: string) { localStorage.setItem('scrapbook.time-zone', zone); }
