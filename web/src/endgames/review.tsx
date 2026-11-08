import type { Color } from 'chessops/types';
import type { ReplayGame } from '../game';
import type { Checkpoint } from '../storage';
import type { EndgameMasteryContribution } from '../achievements/mastery-policy';
import { translate, type Locale, type Message, type Parameters } from '../i18n';
import { pawnEndgameAssessment } from './mastery';
import { EndgameEvidence } from './evidence';

export function PawnEndgameReview({ game, color, checkpoint, saved, locale, locked, onJump }: {
  game: ReplayGame; color: Color; checkpoint?: Checkpoint; saved?: EndgameMasteryContribution;
  locale: Locale; locked: boolean; onJump: (ply: number) => void;
}) {
  const t = (key: Message, parameters?: Parameters) => translate(locale, key, parameters);
  const state = pawnEndgameAssessment(game, color, checkpoint);
  if (state.status === 'unrecognized' && !saved) return null;
  const event = saved ?? (state.status === 'ready' ? state.event : undefined);
  return <div className="mt-4 border-t border-stone-200 pt-3" data-testid="pawn-endgame-review">
    <h3 className="font-semibold">{t('Pawn vs Pawn')}</h3>
    <p className="mt-2 text-sm text-stone-600">{t('Kings and pawns only, with pawns on both sides. From an even start, winning matters most.')}</p>
    {event ? <>
      <EndgameEvidence event={event} locale={locale} />
      <p className="mt-2 text-sm font-semibold" data-testid="endgame-award">{t(saved ? 'Collected +{xp} XP' : 'Endgame · +{xp} XP', { xp: event.amount })}</p>
      <button className="text-button mt-2" disabled={locked} onClick={() => onJump(event.evidence.startPly)}>{t('Replay endgame')}</button>
    </> : <p className="mt-2 text-sm">{t(state.status === 'unfinished'
      ? 'Endgame XP pending: finish this game.' : state.status === 'no-play'
        ? 'No endgame XP: you played no moves after the pawn ending began.'
        : 'Endgame XP pending: analyze the complete game.')}</p>}
  </div>;
}
