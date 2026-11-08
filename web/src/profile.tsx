import { useCallback, useEffect, useRef, useState } from 'react';
import type { ImportedGame, ImportReport, Platform, ProfileState } from '../../shared/contracts';
import { profileApi, ApiError, announceProfileChange } from './profile-api';
import { translate, type Locale, type Message, type Parameters } from './i18n';

const empty: ProfileState = { user: null, accounts: [], games: [], localAccountTesting: false, mockLogin: false, multipleAccounts: false };
export function useProfile() {
  const [state, setState] = useState(empty);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const revision = useRef(0);
  const refresh = useCallback(async () => {
    const ticket = ++revision.current;
    try { const value = await profileApi.me(); if (ticket === revision.current) { setState(value); setUnavailable(false); } }
    catch { if (ticket === revision.current) setUnavailable(true); }
    finally { if (ticket === revision.current) setLoading(false); }
  }, []);
  useEffect(() => {
    void refresh();
    const update = () => { void refresh(); };
    window.addEventListener('scrapbook-profile-changed', update);
    window.addEventListener('focus', update);
    let channel: BroadcastChannel | undefined;
    try { channel = new BroadcastChannel('scrapbook-profile'); channel.onmessage = update; } catch {}
    return () => { window.removeEventListener('scrapbook-profile-changed', update); window.removeEventListener('focus', update); channel?.close(); };
  }, [refresh]);
  return { ...state, unavailable, loading, refresh };
}
const errors: Record<string, Message> = {
  invalid_username: 'Enter a valid platform username.',
  one_account_per_platform: 'Only one account per platform is allowed.',
  account_already_linked: 'This account is already linked.',
  check_cooldown: 'Please wait a few seconds before checking again.',
  account_not_found: 'The platform could not find this account.',
  rate_limited: 'The platform is limiting requests. Try again later.',
  platform_unavailable: 'The platform is unavailable or refused the request. Try again later.',
  invalid_platform_response: 'The platform returned an unexpected response. Try again later.',
  response_too_large: 'The platform response is too large for this import. No games were silently discarded.',
  server_unavailable: 'The local profile server is unavailable. Restart the app with pnpm dev.',
  sign_in_required: 'Use the local mock login first.',
};
export function profileError(error: unknown, locale: Locale) {
  const code = error instanceof ApiError ? error.code : typeof error === 'string' ? error : '';
  return translate(locale, errors[code] ?? 'The request failed. Please try again.');
}

export function ProfileView({ profile, locale, busy, onOpen }: {
  profile: ReturnType<typeof useProfile>; locale: Locale; busy: boolean; onOpen: (game: ImportedGame) => void;
}) {
  const t = (key: Message, parameters?: Parameters) => translate(locale, key, parameters);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [reports, setReports] = useState<ImportReport[]>([]);
  const [platform, setPlatform] = useState<Platform>('chesscom');
  const [name, setName] = useState('');
  async function act(operation: () => Promise<unknown>) {
    setPending(true); setError('');
    try { await operation(); await profile.refresh(); announceProfileChange(); }
    catch (cause) { setError(profileError(cause, locale)); }
    finally { setPending(false); }
  }
  return <section className="my-10 space-y-5" aria-labelledby="profile-title">
    <h1 id="profile-title" className="text-4xl">{t('Your profile and games')}</h1>
    <p className="text-sm leading-6 text-stone-600">{t('Play on your chess platform, check for new games here, then analyze and collect rewards.')}</p>
    {profile.unavailable && <p role="alert">{t('The local profile server is unavailable. Restart the app with pnpm dev.')}</p>}
    {!profile.user ? <div className="note-card">
      <h2 className="text-2xl">{t('Local mock login')}</h2>
      <p className="mt-3 text-sm">{t('Mock login is for local testing. Proper authentication will be added later.')}</p>
      <button className="primary-button mt-4" disabled={pending || !profile.mockLogin} onClick={() => void act(profileApi.login)}>{t('Use local mock login')}</button>
      {!profile.mockLogin && !profile.unavailable && <p className="mt-3 text-sm">{t('Mock login is disabled on this server.')}</p>}
      <p className="mt-3 text-xs text-stone-600">{t('Your guest notebook remains separate from profile rewards.')}</p>
    </div> : <>
      <div className="note-card">
        <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-2xl">{profile.user.name}</h2>
          <button className="text-button" disabled={pending} onClick={() => void act(profileApi.logout)}>{t('Sign out')}</button></div>
        <p className="mt-3 text-sm">{t('Collection starts: {date}', { date: new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(profile.user.createdAt) })}</p>
        <p className="mt-2 text-xs text-stone-600">{t('This is a development profile. Its start date is fixed after the first mock login.')}</p>
      </div>
      <div className="note-card">
        <h2 className="text-2xl">{t('Linked accounts')}</h2>
        <p className="mt-2 text-xs text-stone-600">{t('Accounts are unverified in local mock mode. Unlinking stops future imports and keeps saved games.')}</p>
        <ul className="mt-4 space-y-3">{profile.accounts.map(account => <li key={account.id} className="flex flex-wrap justify-between gap-3 text-sm">
          <span>{account.platform === 'lichess' ? 'Lichess' : 'chess.com'} · {account.username}</span>
          <button className="text-button" disabled={pending} onClick={() => void act(() => profileApi.unlink(account.id))}>{t('Unlink')}</button>
        </li>)}</ul>
        <form className="mt-5 flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); void act(async () => { await profileApi.link(platform, name); setName(''); }); }}>
          <label className="text-xs">{t('Platform')}<select aria-label={t('Platform')} className="mt-1 block rounded border border-stone-300 p-2" value={platform} onChange={event => setPlatform(event.target.value as Platform)}><option value="lichess">Lichess</option><option value="chesscom">chess.com</option></select></label>
          <label className="text-xs">{t('Platform username')}<input className="mt-1 block rounded border border-stone-300 p-2" value={name} onChange={event => setName(event.target.value)} required minLength={2} maxLength={30} autoComplete="off" /></label>
          <button className="secondary-button" disabled={pending}>{t('Add account')}</button>
        </form>
        {profile.multipleAccounts && <p className="mt-3 text-xs">{t('Multiple accounts per platform are enabled for local testing.')}</p>}
      </div>
      <div className="note-card">
        <h2 className="text-2xl">{t('New games')}</h2>
        <p className="mt-2 text-sm text-stone-600">{t('Only completed, rated standard games against people, started after your profile date, are eligible. Chess.com may publish new games with a delay.')}</p>
        <button className="primary-button mt-4" disabled={pending || !profile.accounts.length} onClick={() => void act(async () => setReports((await profileApi.check()).reports))}>{pending ? t('Checking…') : t('Check for new games')}</button>
        <ul className="mt-3 space-y-2 text-sm" role="status">{reports.map(report => <li key={report.accountId}>
          {report.platform === 'lichess' ? 'Lichess' : 'chess.com'} · {report.username}: {report.error ? profileError(report.error, locale) : t('{count} new games imported; {skipped} ineligible records skipped.', { count: report.imported, skipped: report.skipped })}
        </li>)}</ul>
      </div>
      <h2 className="text-2xl">{t('Imported games')}</h2>
      {!profile.games.length && <p className="text-sm">{t('No eligible games imported yet.')}</p>}
      <ul className="space-y-3">{profile.games.map(game => <li className="note-card flex flex-wrap items-center justify-between gap-3 !p-4" key={game.id} data-testid={`imported-${game.id}`}>
        <div className="text-sm"><strong>{game.white} {t('vs')} {game.black}</strong>
          <p className="mt-1 text-xs text-stone-600">{game.platform === 'lichess' ? 'Lichess' : 'chess.com'} · {game.username} · {t(game.color === 'white' ? 'White' : 'Black')} · {game.timeControl}</p>
          <p className="mt-1 text-xs">{game.collected ? t('Rewards collected') : game.analyzed ? t('Analysis saved') : t('Ready to analyze')}</p>
        </div>
        <button className="secondary-button" disabled={busy} onClick={() => onOpen(game)}>{t('Open game')}</button>
      </li>)}</ul>
    </>}
    {error && <p className="text-sm text-red-800" role="alert">{error}</p>}
  </section>;
}
