import { makeSquare } from 'chessops/util';
import type { Color, Role } from 'chessops/types';
import { scoreLabel } from '../game';
import { translate, type Locale, type Message, type Parameters } from '../i18n';
import { DEPTH, type Checkpoint } from '../storage';
import { forkEngineEvidence, type KnightForkCandidate } from './knight-forks';

const roles: Record<Role, Message> = {
  king: 'King', queen: 'Queen', rook: 'Rook', bishop: 'Bishop', knight: 'Knight', pawn: 'Pawn',
};

export function ForkInspector({ candidates, color, checkpoint, ply, virtual, onJump, locale }: {
  candidates: KnightForkCandidate[];
  color: Color | '';
  checkpoint?: Checkpoint;
  ply: number;
  virtual: boolean;
  onJump: (ply: number) => void;
  locale: Locale;
}) {
  const t = (key: Message, parameters?: Parameters) => translate(locale, key, parameters);
  const own = candidates.filter(candidate => candidate.color === color);
  const selected = virtual ? undefined : own.find(candidate => candidate.ply === ply);
  const evidence = selected && forkEngineEvidence(selected, checkpoint?.results.find(result => result.ply === ply));
  return <section className="note-card" aria-labelledby="fork-title" data-testid="fork-inspector">
    <p className="label text-emerald-800">{t('TACTICAL DISCOVERIES')}</p>
    <h2 id="fork-title" className="mt-3 text-xl">{t('Knight-fork candidates')}</h2>
    <p className="mt-2 text-sm leading-6 text-stone-600">{t('Review possible forks from played moves. These candidates do not award mastery or XP.')}</p>
    {!color ? <p className="mt-3 text-sm">{t('Choose your side above to inspect your moves.')}</p>
      : !own.length ? <p className="mt-3 text-sm">{t('No knight-fork candidates in your played moves.')}</p>
      : <>
        <div className="mt-3 flex flex-wrap gap-1" aria-label={t('Jump to a fork candidate')}>
          {own.map(candidate => <button key={candidate.ply} className={`move-button ${selected === candidate ? 'selected' : ''}`}
            aria-pressed={selected === candidate} onClick={() => onJump(candidate.ply)}>
            {candidate.ply % 2 ? `${Math.ceil(candidate.ply / 2)}.` : `${Math.ceil(candidate.ply / 2)}…`} {candidate.san}
          </button>)}
        </div>
        {!selected && <p className="mt-3 text-sm text-stone-600">{t('Select a candidate to inspect its targets and engine evidence.')}</p>}
      </>}
    {selected && <div className="mt-4 space-y-3 border-t border-stone-200 pt-4" data-testid="fork-evidence">
      <p className="text-sm font-semibold">{t('Knight on {square}', { square: makeSquare(selected.square) })}</p>
      <p className="text-xs text-stone-600">{t('The knight is outlined in gold; attacked pieces are outlined in orange.')}</p>
      <ul className="list-disc space-y-1 pl-5 text-sm" aria-label={t('Attacked pieces')}>
        {selected.targets.map(target => <li key={target.square}>{t('{piece} on {square}', { piece: t(roles[target.role]), square: makeSquare(target.square) })}</li>)}
      </ul>
      {selected.pinned && <p className="text-sm text-amber-900">{t('Pinned knight: moving it would expose your king. Geometric attacks alone do not establish a usable fork.')}</p>}
      {selected.capturable && <p className="text-sm text-amber-900">{t('Your opponent can legally capture the knight immediately. Review the continuation before treating this as a successful fork.')}</p>}
      {selected.targets.every(target => ['pawn', 'knight', 'bishop'].includes(target.role)) && <p className="text-sm text-stone-600">{t('Only pawns or minor pieces are attacked. Review whether these threats matter.')}</p>}
      {!evidence ? <p className="text-sm" data-testid="fork-engine">{t('Engine evidence pending. Analyze this game to compare the played move with the best move.')}</p>
        : <div className="space-y-2 text-sm" data-testid="fork-engine">
          <p>{t('Best move {move}: {best} · played {played}', { move: evidence.bestMove, best: scoreLabel(evidence.best), played: scoreLabel(evidence.played) })}</p>
          {evidence.lossCp !== undefined ? <p>{t('Evaluation loss: {loss} centipawns', { loss: evidence.lossCp })}</p>
            : <p>{t('Mate scores are shown separately; they are not converted to centipawn loss.')}</p>}
          <p className="text-xs text-stone-500">{t('Requested search depth: {depth}. Scores are from the moving player’s perspective.', { depth: DEPTH })}</p>
        </div>}
      <p className="text-xs leading-5 text-stone-500">{t('Fork qualification and XP rules are still being reviewed. No quality label is assigned here.')}</p>
    </div>}
  </section>;
}
