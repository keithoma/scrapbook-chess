import { useState, type FormEvent } from 'react';
import { translate, type Locale, type Message } from './i18n';

const DRAFT_KEY = 'scrapbook.feedback-draft';
function restoreDraft(): { text: string; message?: Message } {
  try {
    const text = localStorage.getItem(DRAFT_KEY) ?? '';
    return { text, message: text ? 'Draft saved on this device. It has not been sent.' : undefined };
  } catch { return { text: '', message: 'Could not restore the feedback draft.' }; }
}

export function FeedbackBox({ locale }: { locale: Locale }) {
  const [restored] = useState(restoreDraft);
  const [text, setText] = useState(restored.text);
  const [message, setMessage] = useState<Message | undefined>(restored.message);
  const t = (key: Message) => translate(locale, key);
  const save = (event: FormEvent) => {
    event.preventDefault();
    try {
      localStorage.setItem(DRAFT_KEY, text);
      setMessage('Draft saved on this device. It has not been sent.');
    } catch { setMessage('Could not save the draft. Please copy your text before leaving.'); }
  };
  const clear = () => {
    try {
      localStorage.removeItem(DRAFT_KEY); setText(''); setMessage('Draft cleared.');
    } catch { setMessage('Could not save the draft. Please copy your text before leaving.'); }
  };
  return <form className="note-card mx-auto max-w-2xl" onSubmit={save} aria-labelledby="feedback-title">
    <h1 className="text-3xl" id="feedback-title">{t('Feedback')}</h1>
    <p className="my-4 text-sm leading-6 text-stone-600">{t('Feedback stays on this device for now. We’ll connect submission to GitHub later.')}</p>
    <label className="text-sm font-semibold" htmlFor="feedback-text">{t('Your feedback')}</label>
    <textarea id="feedback-text" required maxLength={5000} value={text} onChange={event => { setText(event.target.value); setMessage('Unsaved draft'); }} placeholder={t('What would you like to tell us?')} className="my-3 min-h-48 w-full rounded-lg border border-stone-300 bg-white/60 p-3" />
    <div className="flex flex-wrap gap-3">
      <button className="primary-button" type="submit">{t('Save draft')}</button>
      <button className="secondary-button" type="button" onClick={clear}>{t('Clear draft')}</button>
    </div>
    {message && <p role="status" className="mt-4 text-sm text-stone-600">{t(message)}</p>}
  </form>;
}
