import { translate, type Locale, type Message, type Parameters } from '../i18n';
import type { MasteryDefinition, OpeningMasteryContribution } from '../achievements/mastery-policy';
import type { GameGrant } from '../achievements/collection';
import type { Jump } from '../achievements/collection-ui';

export function OpeningHistory({ definition, games, labels, locale, busy, onOpen }: {
  definition: MasteryDefinition; games: GameGrant[]; labels: Map<string, string>;
  locale: Locale; busy: boolean; onOpen: (pgn: string, jump?: Jump) => void;
}) {
  const t = (key: Message, parameters?: Parameters) => translate(locale, key, parameters);
  const number = (value: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
  return <>{games.map(record => {
    const events = record.events.filter((e): e is OpeningMasteryContribution => e.kind === 'mastery' && e.family === 'opening' && e.masteryId === definition.id);
    if (!events.length) return null;
    const grade = events.find(e => e.grade)?.grade;
    return <details key={record.id} data-testid="opening-history">
      <summary className="cursor-pointer text-sm">{labels.get(record.id)} · {t('{xp} XP', { xp: events.reduce((s, e) => s + e.amount, 0) })}</summary>
      <p className="mt-2 text-sm" data-testid="opening-grade">{grade ? t('Opening grade: {grade}', { grade }) : t('Opening grade needs four credited moves outside the book.')}</p>
      <p className="mt-2 text-xs">{t('Base XP before reward weight, time and result modifiers.')}</p>
      {events.map(event => {
        const e = event.evidence;
        return <div key={event.ply} className="mt-3 border-t border-stone-200 pt-2 text-xs">
          <p>{event.ply} · {t(e.inBook ? 'Book participation' : 'Outside our book')} · {t('{xp} XP', { xp: event.amount })}</p>
          <p>{t('Book participation')}: {number(e.theoryXp)} · {t('Independent play')}: {number(e.performanceXp)} · {t('Conversion bonus')}: {number(e.bonusXp)}</p>
          <p>{t('Reward weight: {percent}%', { percent: number(e.fade * 100) })} · {t('Time ×{time} · result ×{result}', { time: number(e.timeMultiplier), result: number(e.resultMultiplier) })}</p>
          <button className="text-button mt-1" disabled={busy} onClick={() => onOpen(record.pgn, { ply: event.ply })}>{t('Replay from ply {ply}', { ply: event.ply })}</button>
        </div>;
      })}
      <button className="text-button mt-3" disabled={busy} onClick={() => onOpen(record.pgn, { ply: events[0].ply })}>{t('Replay opening')}</button>
    </details>;
  })}</>;
}
