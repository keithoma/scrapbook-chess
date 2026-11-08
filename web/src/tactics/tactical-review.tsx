import { useEffect, useState } from 'react';
import type { ReplayGame } from '../game';
import { translate, type Locale, type Message } from '../i18n';
import { ANALYSIS_VERSION, type Checkpoint } from '../storage';
import {
  tacticalReviewFilename, TACTICAL_REVIEW_URL,
  type ExpectedXp, type TacticalReviewFixture,
} from './review-fixture';

interface Props {
  game: ReplayGame;
  masteryId: string;
  ply: number;
  checkpoint?: Checkpoint;
  assessment: { status: 'qualified' | 'pending' | 'rejected'; event?: { amount: number } };
  locale: Locale;
}

export function TacticalReview(props: Props) {
  if (!import.meta.env.DEV) return null;
  return <ReviewControls key={`${props.game.pgn}:${props.masteryId}:${props.ply}`} {...props} />;
}

function ReviewControls({ game, masteryId, ply, checkpoint, assessment, locale }: Props) {
  const t = (key: Message) => translate(locale, key);
  const [choice, setChoice] = useState<ExpectedXp>();
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<Message>();
  const result = checkpoint?.pgn === game.pgn && checkpoint.version === ANALYSIS_VERSION
    ? checkpoint.results.find(result => result.ply === ply) : undefined;
  const analysis = result && {
    version: checkpoint!.version,
    result: { ply: result.ply, best: result.best, played: result.played, bestMove: result.bestMove },
  };
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const filename = await tacticalReviewFilename({ pgn: game.pgn, masteryId, ply });
        const response = await fetch(`${TACTICAL_REVIEW_URL}/${filename}`, { signal: controller.signal });
        if (response.status === 404) return;
        if (!response.ok) throw new Error();
        const saved: TacticalReviewFixture = await response.json();
        if (!controller.signal.aborted) setChoice(saved.expectedXp);
      } catch {
        if (!controller.signal.aborted) setError('Could not load the saved review. Try reloading.');
      } finally {
        if (!controller.signal.aborted) setBusy(false);
      }
    })();
    return () => controller.abort();
  }, [game.pgn, masteryId, ply]);

  async function save(expectedXp: ExpectedXp) {
    if (!analysis || busy) return;
    setBusy(true);
    setError(undefined);
    const fixture: TacticalReviewFixture = {
      schemaVersion: 1, masteryId, pgn: game.pgn, ply, expectedXp, analysis,
      observed: { status: assessment.status, xp: assessment.event?.amount ?? 0 },
    };
    try {
      const response = await fetch(TACTICAL_REVIEW_URL, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fixture),
      });
      if (!response.ok) throw new Error();
      setChoice(expectedXp);
    } catch { setError('Could not save the review fixture. Try again.'); }
    finally { setBusy(false); }
  }

  return <div className="border-t border-stone-200 pt-3 text-sm" data-testid="tactical-review">
    <p className="font-semibold">{t('Development review')}</p>
    <p className="mt-1 text-stone-600">{t('Should this tactic earn experience? Save your judgment as a test fixture.')}</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <button className="secondary-button" aria-pressed={choice === 'positive'} disabled={busy || !analysis}
        onClick={() => void save('positive')}>{t('Should earn XP')}</button>
      <button className="secondary-button" aria-pressed={choice === 'zero'} disabled={busy || !analysis}
        onClick={() => void save('zero')}>{t('Should earn 0 XP')}</button>
    </div>
    <p className="mt-2 text-stone-600" role="status">
      {busy ? t('Loading or saving review…') : error ? t(error)
        : choice === 'positive' ? t('Saved: should earn XP.')
        : choice === 'zero' ? t('Saved: should earn 0 XP.')
        : !analysis ? t('Finish analysis before saving a review.') : t('No judgment saved yet.')}
    </p>
  </div>;
}
