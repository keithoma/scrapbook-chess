import type { ReplayGame } from '../game';
import type { Checkpoint } from '../storage';
import type { Color } from 'chessops/types';
import { translate, type Locale } from '../i18n';
import { openingAssessment } from './mastery';

export function OpeningStatus({ game, color, checkpoint, saved, locale }: {
  game: ReplayGame; color: Color; checkpoint?: Checkpoint; saved?: boolean; locale: Locale;
}) {
  const state = openingAssessment(game, color, checkpoint);
  if (state.status === 'unrecognized') return null;
  const text = saved || state.status === 'ready' ? 'Jobava recognized. Each side has its own mastery.'
    : state.status === 'clocks' ? 'Opening XP pending: usable move clocks are required. Check for games again, or paste a PGN with clocks.'
    : 'Opening XP pending: analyze the complete game.';
  return <p className="mt-3 text-sm" data-testid="opening-status">{translate(locale, text)}</p>;
}
