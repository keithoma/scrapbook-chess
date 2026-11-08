import type { EndgameMasteryContribution } from '../achievements/mastery-policy';
import { scoreLabel } from '../game';
import { translate, type Locale, type Message, type Parameters } from '../i18n';

export function EndgameEvidence({ event, locale }: { event: EndgameMasteryContribution; locale: Locale }) {
  const t = (key: Message, parameters?: Parameters) => translate(locale, key, parameters);
  const e = event.evidence;
  return <div className="mt-2 space-y-2 text-sm" data-testid="endgame-evidence">
    <p className="font-semibold" data-testid="endgame-grade">{event.grade
      ? t('Endgame grade: {grade}', { grade: event.grade }) : t('Endgame grade unavailable')}</p>
    <p>{t('Starting position: {position} ({score})', {
      position: t(e.startingPosition === 'winning' ? 'Winning' : e.startingPosition === 'losing' ? 'Losing' : 'Even'),
      score: scoreLabel(e.startingEvaluation),
    })}</p>
    <p>{t('Result: {result}', { result: t(e.result === 'win' ? 'Win' : e.result === 'draw' ? 'Draw' : 'Loss') })}</p>
    <p>{t('Your endgame moves: {count}', { count: e.ownMoves })}</p>
    <p>{t('Endgame move quality: {percent}%', { percent: e.quality * 100 })}</p>
  </div>;
}
