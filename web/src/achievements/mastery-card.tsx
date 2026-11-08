import { translate, type Locale, type Message, type Parameters } from '../i18n';
import { gradeForContribution, type MasteryDefinition, type masteryProgress } from './mastery';
import type { GameGrant } from './collection';
import { OpeningHistory } from '../openings/history';
import type { Jump } from './collection-ui';
import { EndgameEvidence } from '../endgames/evidence';
import { OPENINGS } from '../openings/recognition';

export function MasteryCard({
  definition,
  progress,
  games,
  labels,
  locale,
  busy,
  onOpen,
}: {
  definition: MasteryDefinition;
  progress: ReturnType<typeof masteryProgress>;
  games: GameGrant[];
  labels: Map<string, string>;
  locale: Locale;
  busy: boolean;
  onOpen: (pgn: string, jump?: Jump) => void;
}) {
  const t = (key: Message, parameters?: Parameters) => translate(locale, key, parameters);
  const fork = definition.id === 'mastery_knight_forks';
  const opening = definition.family === 'opening';
  const openingDefinition = OPENINGS.find(opening => opening.id === definition.opening_id);
  const openingName = openingDefinition?.name;
  const openingRole = definition.color === 'white'
    ? openingDefinition?.playedBy === 'black' ? 'Facing {opening} as White' : 'Playing {opening} as White'
    : openingDefinition?.playedBy === 'black' ? 'Playing {opening} as Black' : 'Facing {opening} as Black';
  const endgame = definition.family === 'endgame';
  const skewer = definition.id === 'mastery_skewers';
  const prefix = fork ? 'mastery' : skewer ? 'skewer' : definition.id;
  return (
    <article
      className="note-card"
      aria-label={t(definition.name)}
      data-testid={fork ? 'fork-mastery' : skewer ? 'skewer-mastery' : definition.id}
    >
      <p className="achievement-category">{definition.category} · {definition.subcategory}</p>
      <h3 className="font-serif text-2xl">{t(definition.name)}</h3>
      {definition.description && <p className="mt-2 text-sm text-stone-600">{definition.description}</p>}
      {opening && openingName && <p className="mt-2 text-sm font-semibold">{t(openingRole, { opening: t(openingName as Message) })}</p>}
      <p className="mt-2 text-sm">{t('Level {level}', { level: progress.level })}</p>
      <progress
        className="mt-3 h-1.5 w-full"
        value={progress.needed === undefined ? 1 : progress.gained}
        max={progress.needed ?? 1}
        aria-label={t('Mastery level progress')}
      />
      <p className="mt-2 text-sm" data-testid={`${prefix}-total-xp`}>
        {t('{xp} XP', { xp: progress.xp })}
      </p>
      <p className="mt-2 text-xs text-stone-600" data-testid={`${prefix}-xp-requirement`}>
        {progress.next === undefined
          ? t('Maximum level reached')
          : progress.gradeLocked
            ? t('XP requirement met. Extra XP is saved.')
            : t('{remaining} XP to the next level', { remaining: progress.remainingXp })}
      </p>
      <p className="mt-2 text-sm" data-testid={`${prefix}-high-grades`}>
        {t(endgame ? 'Endgames rated S- or better: {count}' : opening ? 'Opening games rated S- or better: {count}' : fork ? 'Forks rated S- or better: {count}' : 'Skewers rated S- or better: {count}', {
          count: progress.highGrades,
        })}
      </p>
      {progress.requiredHighGrades > 0 && (
        <>
          <p className="mt-2 text-sm" data-testid={`${prefix}-grade-requirement`}>
            {t(
              endgame ? '{earned} / {required} endgames rated S- or better for level {level}' : opening ? '{earned} / {required} opening games rated S- or better for level {level}' : fork
                ? '{earned} / {required} forks rated S- or better for level {level}'
                : '{earned} / {required} skewers rated S- or better for level {level}',
              {
                earned: Math.min(progress.availableHighGrades, progress.requiredHighGrades),
                required: progress.requiredHighGrades,
                level: progress.level + 1,
              },
            )}
          </p>
          <p className="mt-2 text-xs text-stone-500">
            {t(
              opening || endgame ? 'Each level’s grade requirement uses a separate batch of games.' : fork
                ? 'Each level’s grade requirement uses a separate batch of forks.'
                : 'Each level’s grade requirement uses a separate batch of skewers.',
            )}
          </p>
        </>
      )}
      <p className="mt-3 text-xs text-stone-500">
        {t(endgame ? 'Winning from equality matters most. Comebacks earn more; routine conversions earn less.' : 'Better move quality earns more XP. Open a contribution to replay its evidence.')}
      </p>
      <div className="mt-3 space-y-2">
        {opening && <OpeningHistory definition={definition} games={games} labels={labels} locale={locale} busy={busy} onOpen={onOpen}/>}
        {games.flatMap((record) =>
          record.events
            .filter((event) => event.kind === 'mastery' && event.masteryId === definition.id)
            .map((event) => {
              if (event.kind !== 'mastery' || event.family === 'opening') return null;
              if (event.family === 'endgame') return <details key={`${record.id}:${event.ply}`}>
                <summary className="cursor-pointer text-sm">{labels.get(record.id)} · {t('{mastery} +{xp} XP', { mastery: t(definition.name), xp: event.amount })}</summary>
                <EndgameEvidence event={event} locale={locale} />
                <button className="text-button mt-2" disabled={busy} onClick={() => onOpen(record.pgn, { ply: event.evidence.startPly })}>{t('Replay endgame')}</button>
              </details>;
              const grade = gradeForContribution(event);
              return (
                <details key={`${record.id}:${event.ply}`}>
                  <summary className="cursor-pointer text-sm">
                    {labels.get(record.id)} ·{' '}
                    {t('{mastery} +{xp} XP', { mastery: t(definition.name), xp: event.amount })}
                  </summary>
                  <p
                    className="mt-2 text-sm"
                    data-testid={fork ? 'collected-fork-grade' : 'collected-skewer-grade'}
                  >
                    {grade
                      ? t(fork ? 'Fork grade: {grade}' : 'Skewer grade: {grade}', { grade })
                      : t('Tactic grade unavailable')}
                  </p>
                  {event.evidence.skewer && (
                    <p className="mt-2 text-xs">
                      {t('Skewer: {attacker} → {front} → {rear}', event.evidence.skewer)}
                    </p>
                  )}
                  <p className="mt-2 text-xs">
                    {t('Material threat: {gain} pawns after immediate replies and recaptures.', {
                      gain: event.evidence.materialGainCp / 100,
                    })}
                  </p>
                  <p className="mt-2 text-xs">
                    {t('Example defense: {reply} → {capture}', {
                      reply: event.evidence.reply,
                      capture: event.evidence.capture,
                    })}
                  </p>
                  <button
                    className="text-button mt-2"
                    disabled={busy}
                    onClick={() => onOpen(record.pgn, { ply: event.ply })}
                  >
                    {t(fork ? 'Replay fork' : 'Replay skewer')}
                  </button>
                </details>
              );
            }),
        )}
      </div>
    </article>
  );
}
