import type { Color } from 'chessops/types';
import { translate, type Locale, type Message, type Parameters } from '../i18n';
import type { GameGrant } from './collection';
import { MASTERIES, gradeForContribution, type AnyMasteryContribution, type TacticalGrade } from './mastery-policy';

export function CollectedMasteries({ game, color, locale }: {
  game?: GameGrant; color: Color | ''; locale: Locale;
}) {
  if (!game || game.color !== color) return null;
  const t = (key: Message, parameters?: Parameters) => translate(locale, key, parameters);
  const earned = MASTERIES.flatMap(definition => {
    const events = game.events.filter((event): event is AnyMasteryContribution =>
      event.kind === 'mastery' && event.masteryId === definition.id);
    const xp = events.reduce((total, event) => total + event.amount, 0);
    if (xp <= 0) return [];
    const grades = events.map(gradeForContribution).filter((grade): grade is TacticalGrade => !!grade);
    return [{ definition, xp, grades }];
  });
  if (!earned.length) return null;

  return <section className="collected-masteries" aria-label={t('Masteries earned this game')} data-testid="collected-masteries">
    <h2 className="text-sm font-semibold">{t('Masteries earned this game')}</h2>
    <ul className="mt-2 space-y-2">
      {earned.map(({ definition, xp, grades }) => <li key={definition.id} data-testid={`collected-${definition.id}`}>
        <span className="min-w-0 font-medium">{t('{mastery} +{xp} XP', { mastery: t(definition.name), xp })}</span>
        <span className="mastery-grade">{grades.length
          ? grades.length === 1 ? t('Grade: {grade}', { grade: grades[0] }) : t('Grades: {grades}', { grades: grades.join(', ') })
          : t('Grade unavailable')}</span>
      </li>)}
    </ul>
  </section>;
}
