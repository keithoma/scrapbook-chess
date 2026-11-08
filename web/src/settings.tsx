import { useEffect, useState } from 'react';
import type { useProfile } from './profile';
import { profileApi, announceProfileChange } from './profile-api';
import { translate, type Locale, type Message } from './i18n';
import { timeZone } from '../../shared/time-zone';

export function SettingsView({ profile, locale, guestZone, onGuestZone }: {
  profile: ReturnType<typeof useProfile>; locale: Locale; guestZone: string; onGuestZone: (zone: string) => void;
}) {
  const current = profile.user?.timeZone ?? guestZone;
  const [draft, setDraft] = useState(current);
  const [status, setStatus] = useState<Message>();
  const [saving, setSaving] = useState(false);
  useEffect(() => { setDraft(current); }, [current]);
  const t = (message: Message) => translate(locale, message);
  return <form className="note-card my-10 space-y-4" onSubmit={event => {
    event.preventDefault(); const zone = timeZone(draft);
    if (!zone) { setStatus('Choose a valid time zone.'); return; }
    setSaving(true);
    void (async () => {
      try {
        if (profile.user) { await profileApi.settings(zone); await profile.refresh(); announceProfileChange(); }
        else onGuestZone(zone);
        setDraft(zone); setStatus('Settings saved.');
      } catch { setStatus('Could not save settings.'); }
      finally { setSaving(false); }
    })();
  }}>
    <h1 className="text-3xl">{t('Settings')}</h1>
    <label className="block text-sm font-semibold" htmlFor="time-zone">{t('Time zone')}</label>
    <input className="w-full rounded-lg border border-stone-300 p-3" id="time-zone" list="time-zones" value={draft} onChange={event => { setDraft(event.target.value); setStatus(undefined); }} required />
    <datalist id="time-zones">{['UTC', ...Intl.supportedValuesOf('timeZone')].map(zone => <option value={zone} key={zone} />)}</datalist>
    <p className="text-sm">{t('Calendar rewards use the game start time in your time zone. Previously collected games keep their original time zone.')}</p>
    <button className="primary-button" disabled={saving || profile.loading}>{t('Save settings')}</button>
    {status && <p role="status">{t(status)}</p>}
  </form>;
}
