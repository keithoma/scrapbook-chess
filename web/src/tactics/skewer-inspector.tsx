import { scoreLabel, type ReplayGame } from '../game';
import { ANALYSIS_VERSION, type Checkpoint } from '../storage';
import {
  assessSkewer,
  gradeForContribution,
  type MasteryContribution,
} from '../achievements/mastery';
import { translate, type Locale, type Message, type Parameters } from '../i18n';
import { tacticEngineEvidence } from './engine-evidence';
import type { SkewerCandidate } from './skewers';
import type { Color } from 'chessops/types';
import { TacticalReview } from './tactical-review';
import { SKEWER_MASTERY } from '../achievements/mastery-policy';

export function SkewerInspector({
  game,
  saved,
  candidates,
  color,
  checkpoint,
  ply,
  virtual,
  onJump,
  locale,
}: {
  game: ReplayGame;
  saved?: MasteryContribution[];
  candidates: SkewerCandidate[];
  color: Color | '';
  checkpoint?: Checkpoint;
  ply: number;
  virtual: boolean;
  onJump: (ply: number) => void;
  locale: Locale;
}) {
  const t = (key: Message, parameters?: Parameters) => translate(locale, key, parameters);
  const own = candidates.filter((c) => c.color === color);
  const selected = virtual ? undefined : own.find((c) => c.ply === ply);
  const collected = saved?.find((e) => e.masteryId === 'mastery_skewers' && e.ply === ply);
  const assessment = selected && assessSkewer(game, selected, checkpoint);
  const grade = collected
    ? gradeForContribution(collected)
    : assessment?.status === 'qualified'
      ? assessment.event.grade
      : undefined;
  const evidence =
    collected?.evidence ??
    (selected && checkpoint?.pgn === game.pgn && checkpoint.version === ANALYSIS_VERSION
      ? tacticEngineEvidence(
          selected,
          checkpoint.results.find((r) => r.ply === ply),
        )
      : undefined);
  const material =
    collected?.evidence ??
    (assessment?.material.status === 'qualified'
      ? { materialGainCp: assessment.material.gainCp, ...assessment.material }
      : undefined);
  return (
    <section className="note-card" aria-labelledby="skewer-title" data-testid="skewer-inspector">
      <p className="label text-emerald-800">{t('TACTICAL DISCOVERIES')}</p>
      <h2 className="mt-3 text-xl" id="skewer-title">
        {t('Skewer candidates')}
      </h2>
      <p className="mt-2 text-sm leading-6 text-stone-600">
        {t('Qualifying skewers earn quality-based XP when you collect rewards.')}
      </p>
      {!color ? (
        <p className="mt-3 text-sm">{t('Choose your side above to inspect your moves.')}</p>
      ) : !own.length ? (
        <p className="mt-3 text-sm">{t('No skewer candidates in your played moves.')}</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap gap-1" aria-label={t('Jump to a skewer candidate')}>
            {own.map((candidate) => (
              <button
                key={candidate.ply}
                className={`move-button ${selected === candidate ? 'selected' : ''}`}
                aria-pressed={selected === candidate}
                onClick={() => onJump(candidate.ply)}
              >
                {candidate.ply} · {candidate.san}
              </button>
            ))}
          </div>
          {!selected && (
            <p className="mt-3 text-sm">
              {t('Select a candidate to inspect its targets and engine evidence.')}
            </p>
          )}
        </>
      )}
      {selected && (
        <div
          className="mt-4 space-y-3 border-t border-stone-200 pt-4"
          data-testid="skewer-evidence"
        >
          <ul className="space-y-2 text-sm">
            {selected.lines.map((line) => (
              <li key={`${line.attacker}:${line.front.square}:${line.rear.square}`}>
                {t('Skewer: {attacker} → {front} → {rear}', {
                  attacker: line.attackerName,
                  front: line.front.name,
                  rear: line.rear.name,
                })}
              </li>
            ))}
          </ul>
          <p className="text-xs text-stone-600">
            {t(
              'The attacker is outlined in gold; the front and rear targets are outlined in orange.',
            )}
          </p>
          {evidence ? (
            <div className="text-sm" data-testid="skewer-engine">
              {t('Best move {move}: {best} · played {played}', {
                move: evidence.bestMove,
                best: scoreLabel(evidence.best),
                played: scoreLabel(evidence.played),
              })}
            </div>
          ) : (
            <p className="text-sm">
              {t(
                'Engine evidence pending. Analyze this game to compare the played move with the best move.',
              )}
            </p>
          )}
          <div className="space-y-2 text-sm" data-testid="skewer-award">
            {grade && (
              <p className="font-semibold" data-testid="skewer-grade">
                {t('Skewer grade: {grade}', { grade })}
              </p>
            )}
            {collected ? (
              <p>{t('Collected +{xp} XP', { xp: collected.amount })}</p>
            ) : assessment?.status === 'qualified' ? (
              <p>{t('Qualified skewer · +{xp} XP', { xp: assessment.event.amount })}</p>
            ) : assessment?.status === 'pending' ? (
              <p>
                {t('Skewer XP pending: finish analysis or review unresolved material evidence.')}
              </p>
            ) : (
              <p>
                {t(
                  'No mastery XP: the skewer does not prove a material gain with acceptable move quality.',
                )}
              </p>
            )}
            {material && (
              <details>
                <summary className="text-button cursor-pointer">{t('Material evidence')}</summary>
                <p className="mt-2">
                  {t('Material threat: {gain} pawns after immediate replies and recaptures.', {
                    gain: material.materialGainCp / 100,
                  })}
                </p>
                <p className="mt-2">
                  {t('Example defense: {reply} → {capture}', {
                    reply: material.reply,
                    capture: material.capture,
                  })}
                </p>
                <p className="mt-2 text-xs text-stone-500">
                  {t(
                    'This is an illustrative continuation, not played moves. Longer tactics may change the material result.',
                  )}
                </p>
              </details>
            )}
          </div>
          {assessment && <TacticalReview game={game} masteryId={SKEWER_MASTERY.id} ply={selected.ply}
            checkpoint={checkpoint} assessment={assessment} locale={locale} />}
        </div>
      )}
    </section>
  );
}
