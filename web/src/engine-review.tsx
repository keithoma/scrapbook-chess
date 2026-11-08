import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { makeSan } from 'chessops/san';
import { parseUci } from 'chessops/util';
import { scoreLabel } from './game';
import type { MoveResult } from './storage';
import { translate, type Locale } from './i18n';

export function EngineReview({ result, beforeFen, locale, onAddChoices }: {
  result: MoveResult; beforeFen: string; locale: Locale; onAddChoices: () => void;
}) {
  const t = (key: Parameters<typeof translate>[1]) => translate(locale, key);
  const position = Chess.fromSetup(parseFen(beforeFen).unwrap()).unwrap();
  return <div data-testid="engine-review" className="mt-2 text-sm">
    <p><span className="text-stone-600">{t('Played move evaluation')}: </span><strong data-testid="played-evaluation">{scoreLabel(result.played)}</strong></p>
    <div className="mt-2 flex flex-wrap gap-2">
      {result.annotations?.best && <span className="font-semibold text-emerald-800" data-testid="best-move">{t('Best move')}</span>}
      {result.annotations?.only && <span className="font-semibold text-amber-800" data-testid="only-move">{t('Only move')}</span>}
    </div>
    {result.topMoves?.length ? <div className="mt-3">
      <p className="label mb-1">{t('Top engine choices')}</p>
      <ol aria-label={t('Top engine choices')} data-testid="engine-choices" className="grid gap-1">
        {result.topMoves.map((pick, i) => <li key={pick.uci} className="flex justify-between gap-4" data-uci={pick.uci}>
          <span>{i + 1}. {makeSan(position, parseUci(pick.uci)!)}</span><span>{scoreLabel(pick.score)}</span>
        </li>)}
      </ol>
    </div> : <div className="mt-2 text-stone-600"><p>{t('Add engine choices to show the top moves and identify only moves.')}</p><button className="text-button mt-1" onClick={onAddChoices}>{t('Add engine choices')}</button></div>}
  </div>;
}
