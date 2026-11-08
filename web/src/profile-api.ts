import type { ProfileState, ImportReport, Platform } from '../../shared/contracts';
import type { Checkpoint } from './storage';
import type { GameGrant } from './achievements/collection';

export class ApiError extends Error { constructor(public code: string) { super(code); } }
async function request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  let response: Response;
  try { response = await fetch(`/api${path}`, { method, credentials: 'same-origin', headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) }); }
  catch { throw new ApiError('server_unavailable'); }
  let value;
  try { value = await response.json(); } catch { throw new ApiError('server_unavailable'); }
  if (!response.ok) throw new ApiError(value?.error ?? 'server_error');
  return value as T;
}
export const profileApi = {
  me: () => request<ProfileState>('/me'),
  login: () => request('/mock-login', 'POST', {}),
  logout: () => request('/logout', 'POST', {}),
  link: (platform: Platform, username: string) => request('/profile/accounts', 'POST', { platform, username }),
  unlink: (id: string) => request(`/profile/accounts/${encodeURIComponent(id)}`, 'DELETE', {}),
  check: () => request<{ reports: ImportReport[] }>('/profile/check-games', 'POST', {}),
  collection: () => request<GameGrant[]>('/profile/collection'),
  analysis: (id: string) => request<Checkpoint | null>(`/profile/games/${encodeURIComponent(id)}/analysis`),
  saveAnalysis: (id: string, checkpoint: Checkpoint) => request(`/profile/games/${encodeURIComponent(id)}/analysis`, 'PUT', { checkpoint }),
  collect: (id: string, checkpoint?: Checkpoint) => request<{ before: GameGrant[]; after: GameGrant[]; grant: GameGrant }>(`/profile/games/${encodeURIComponent(id)}/collect`, 'POST', { checkpoint }),
};

export function announceProfileChange() {
  window.dispatchEvent(new Event('scrapbook-profile-changed'));
  try { const channel = new BroadcastChannel('scrapbook-profile'); channel.postMessage('changed'); channel.close(); } catch {}
}
