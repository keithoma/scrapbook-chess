import { useEffect, useMemo, useState } from 'react';
import type { Color } from 'chessops/types';
import { parseGame, type ReplayGame } from '../game';
import type { Checkpoint, VirtualMove } from '../storage';
import { translate, type Locale, type Message, type Parameters } from '../i18n';
import { BADGES, progressFor, type Flavor } from './catalog';
import { contributions, gameIdentity, isCompletedGame, newlyUnlocked, projectCollection, retainMastery, type GameGrant } from './collection';
import { collectGame, readCollection, subscribeCollection } from './ledger';

export interface Jump { ply: number; virtualPly?: number; virtual?: VirtualMove[] }
export function useLocalCollection() {
  const [games, setGames] = useState<GameGrant[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    const refresh = () => { void readCollection().then(value => { if (alive) { setGames(value); setError(false); } }).catch(() => { if (alive) setError(true); }); };
    refresh();
    const unsubscribe = subscribeCollection(refresh);
    return () => { alive = false; unsubscribe(); };
  }, []);
  return { games, setGames, error };
}

function FlavorText({ flavor, legacy }: { flavor?: Flavor; legacy?: string }) {
  const text = flavor?.text ?? flavor?.quote ?? flavor?.player_quote ?? legacy;
  if (!text) return null;
  const italic = text.startsWith('*') && text.endsWith('*');
  return <blockquote className="mt-3 whitespace-pre-wrap break-words font-serif text-base italic leading-relaxed text-stone-600">
    {italic ? text.slice(1, -1) : text}
    {flavor?.author && <cite className="mt-1 block text-xs not-italic">— {flavor.author}</cite>}
  </blockquote>;
}

export function GameRewards({ game, checkpoint, color, onColor, games, onSaved, ply, virtualPly, onJump, locale }: {
  game: ReplayGame; checkpoint?: Checkpoint; color: Color | ''; onColor: (color: Color | '') => void;
  games: GameGrant[]; onSaved: (games: GameGrant[]) => void; ply: number; virtualPly: number;
  onJump: (jump: Jump) => void; locale: Locale;
}) {
  const t = (key: Message, parameters?: Parameters) => translate(locale, key, parameters);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  const [reveal, setReveal] = useState<ReturnType<typeof newlyUnlocked>>();
  const [unchanged, setUnchanged] = useState(false);
  const recorded = games.find(entry => entry.id === gameIdentity(game));
  const eligible = isCompletedGame(game);
  let events = color && eligible ? retainMastery(recorded, color, contributions(game, color, checkpoint)) : [];
  const savedVirtual = recorded?.color === color ? recorded.events.filter(event => event.kind === 'scrap' && event.mode === 'virtual') : [];
  if (savedVirtual.length && !events.some(event => event.kind === 'scrap' && event.mode === 'real')) {
    events = [...events.filter(event => !(event.kind === 'scrap' && event.mode === 'virtual')), ...savedVirtual];
  }
  const atMove = events.filter(event => event.kind === 'scrap' && event.virtualPly !== undefined
    ? virtualPly === event.virtualPly
    : !virtualPly && event.ply === ply);
  const soFar = events.filter(event => event.kind === 'badge' && event.ply <= ply);

  const collect = async () => {
    if (!color || saving || !eligible) return;
    setSaving(true); setFailed(false);
    try {
      const result = await collectGame(game, color, checkpoint);
      const previous = result.before.find(entry => entry.id === result.grant.id);
      setUnchanged(previous?.color === color && JSON.stringify(previous.events) === JSON.stringify(result.grant.events));
      setReveal(newlyUnlocked(result.before, result.after));
      onSaved(result.after);
    } catch { setFailed(true); }
    finally { setSaving(false); }
  };

  return <section className="note-card" aria-labelledby="game-rewards-title">
    <p className="label text-emerald-800">{t('YOUR NEXT DISCOVERY')}</p>
    <h2 id="game-rewards-title" className="mt-3 text-2xl">{t('Your game, your rewards.')}</h2>
    <label className="mt-4 block text-sm font-semibold" htmlFor="player-color">{t('I played as')}</label>
    <select id="player-color" className="mt-2 w-full rounded-lg border border-stone-300 bg-white/60 p-3" value={color} onChange={event => { onColor(event.target.value as Color | ''); setReveal(undefined); }} disabled={saving}>
      <option value="">{t('Choose after your game')}</option>
      <option value="white">{t('White')} · {game.white}</option>
      <option value="black">{t('Black')} · {game.black}</option>
    </select>
    {recorded && <p className="mt-2 text-xs text-stone-600">{t('Changing color replaces this game’s rewards; it does not collect both sides.')}</p>}
    {!eligible && <p className="mt-3 text-sm text-stone-600">{t('Load a completed game to collect rewards.')}</p>}
    <button className="primary-button mt-4 w-full" onClick={() => void collect()} disabled={!color || !eligible || saving}>{saving ? t('Saving rewards…') : t('Collect rewards')}</button>
    {failed && <p className="mt-3 text-sm text-red-800" role="alert">{t('Could not save rewards. Please try again.')}</p>}
    {reveal && <div className="reward-reveal mt-4 rounded-xl border border-amber-400 bg-amber-50 p-4" role="status" data-testid="reward-reveal">
      <h3 className="font-serif text-xl">{unchanged ? t('Already in your scrapbook.') : t('A little more remarkable.')}</h3>
      {unchanged ? <p className="mt-2 text-sm">{t('No progress was counted twice.')}</p> : <>
        <p className="mt-2 text-sm">{t('Game rewards saved. Your collection is up to date.')}</p>
        {reveal.masteryXp > 0 && <p className="mt-3 font-semibold">{t('Knight forks +{xp} XP', { xp: reveal.masteryXp })}</p>}
        {reveal.masteryLevels.map(level => <p className="mt-2 font-serif text-xl" key={level}>{t('Knight forks reached level {level}!', { level })}</p>)}
        {reveal.tiers.map(({ badge, tier }) => <div className="mt-4 border-t border-amber-200 pt-3" key={`${badge.id}:${tier.name}`}>
          <p className="font-semibold">✦ {badge.name} · {tier.name}</p>
          <FlavorText flavor={tier.flavor} legacy={tier.flavor_text} />
        </div>)}
        {reveal.scraps.map(scrap => <p className="mt-3 font-serif text-2xl" key={scrap.notation}>✧ {scrap.notation} <span className="font-sans text-xs">{t(scrap.mode === 'real' ? 'Real' : 'Virtual')}</span></p>)}
      </>}
    </div>}
    {color && eligible && <div className="mt-5 border-t border-stone-200 pt-4">
      <h3 className="label">{t('THIS GAME THROUGH THE CURRENT MOVE')}</h3>
      <ul className="mt-3 space-y-1 text-sm">{BADGES.map(badge => <li className="flex justify-between gap-3" key={badge.id}><span>{badge.name}</span><span data-testid={`replay-${badge.id}`}>{soFar.reduce((sum, event) => sum + (event.kind === 'badge' && event.badgeId === badge.id ? event.amount : 0), 0)}</span></li>)}</ul>
      <p className="mt-2 text-sm" data-testid="replay-mastery-xp">{t('Knight forks +{xp} XP', { xp: events.reduce((sum, event) => sum + (event.kind === 'mastery' && event.ply <= ply ? event.amount : 0), 0) })}</p>
      <p className="label mt-4">{t('AT THIS MOMENT')}</p>
      {atMove.length ? <ul className="mt-2 space-y-2 text-sm">{atMove.map((event, index) => <li key={index}>{event.kind === 'mastery' ? t('Knight forks +{xp} XP', { xp: event.amount }) : event.kind === 'badge' ? `${BADGES.find(b => b.id === event.badgeId)!.name} +${event.amount}` : `${event.notation} · ${t(event.mode === 'real' ? 'Real' : 'Virtual')}`}</li>)}</ul> : <p className="mt-2 text-xs text-stone-500">{t('No contribution on this move.')}</p>}
      <details className="mt-4"><summary className="text-button cursor-pointer">{t('Jump to a reward moment')}</summary><div className="mt-2 flex max-h-40 flex-wrap gap-1 overflow-y-auto">{events.map((event, index) => <button className="move-button" key={index} onClick={() => onJump({ ply: event.ply, virtualPly: event.kind === 'scrap' ? event.virtualPly : undefined, virtual: event.kind === 'scrap' && event.mode === 'virtual' ? recorded?.virtual ?? checkpoint?.virtual : undefined })}>{event.kind === 'scrap' ? event.notation : event.kind === 'mastery' ? `${event.ply} · ${t('Knight forks +{xp} XP', { xp: event.amount })}` : `${event.ply} · ${BADGES.find(b => b.id === event.badgeId)!.name}`}</button>)}</div></details>
    </div>}
    {locale === 'de' && <p className="mt-3 text-xs text-stone-500">{t('Badge names and flavor text are the English originals.')}</p>}
  </section>;
}

export function CollectionView({ games, locale, onOpen, failed, busy }: {
  games: GameGrant[]; locale: Locale; onOpen: (pgn: string, jump?: Jump) => void; failed: boolean; busy: boolean;
}) {
  const t = (key: Message, parameters?: Parameters) => translate(locale, key, parameters);
  const collection = useMemo(() => projectCollection(games), [games]);
  const labels = useMemo(() => new Map(games.map(record => {
    const game = parseGame(record.pgn);
    return [record.id, `${game.white} ${translate(locale, 'vs')} ${game.black}`];
  })), [games, locale]);
  return <section className="my-10" aria-labelledby="collection-title">
    <p className="label text-emerald-800">{t('A GROWING COLLECTION')}</p>
    <h1 id="collection-title" className="mt-3 text-4xl">{t('Your scrapbook.')}</h1>
    <p className="mt-3 text-sm leading-6 text-stone-600">{t('Saved only in this browser. Collect completed PGNs to try the reward loop.')}</p>
    {failed && <p className="mt-4 text-sm text-red-800" role="alert">{t('Could not open the local collection. Reload to try again.')}</p>}
    {busy && <p className="mt-3 text-sm text-stone-600">{t('Pause analysis before opening another game.')}</p>}
    <h2 className="my-6 text-2xl">{t('Masteries')}</h2>
    <article className="note-card" aria-label={t('Knight forks')} data-testid="fork-mastery">
      <h3 className="font-serif text-2xl">{t('Knight forks')}</h3>
      <p className="mt-2 text-sm">{t('Level {level}', { level: collection.mastery.level })}</p>
      <progress className="mt-3 h-1.5 w-full" value={collection.mastery.needed === undefined ? 1 : collection.mastery.gained} max={collection.mastery.needed ?? 1} aria-label={t('Mastery level progress')} />
      <p className="mt-2 text-sm" data-testid="mastery-total-xp">{t('{xp} XP', { xp: collection.mastery.xp })}</p>
      <p className="mt-2 text-xs text-stone-600">{collection.mastery.next === undefined ? t('Maximum level reached') : t('{remaining} XP to the next level', { remaining: collection.mastery.next - collection.mastery.xp })}</p>
      <p className="mt-3 text-xs text-stone-500">{t('Better move quality earns more XP. Open a contribution to replay its evidence.')}</p>
      <div className="mt-3 space-y-2">{games.flatMap(record => record.events.filter(event => event.kind === 'mastery').map(event => <details key={`${record.id}:${event.ply}`}>
        <summary className="cursor-pointer text-sm">{labels.get(record.id)} · {t('Knight forks +{xp} XP', { xp: event.amount })}</summary>
        <p className="mt-2 text-xs">{t('Material threat: {gain} pawns after immediate replies and recaptures.', { gain: event.evidence.materialGainCp / 100 })}</p>
        <p className="mt-2 text-xs">{t('Example defense: {reply} → {capture}', { reply: event.evidence.reply, capture: event.evidence.capture })}</p>
        <button className="text-button mt-2" disabled={busy} onClick={() => onOpen(record.pgn, { ply: event.ply })}>{t('Replay fork')}</button>
      </details>))}</div>
    </article>
    <h2 className="my-6 text-2xl">{t('Badges')}</h2>
    {locale === 'de' && <p className="mb-3 text-xs text-stone-500">{t('Badge names and flavor text are the English originals.')}</p>}
    <div className="grid gap-4 md:grid-cols-3">{BADGES.map(badge => {
      const { total, tier, next } = progressFor(badge, collection.totals[badge.id]);
      return <article className="note-card" key={badge.id} aria-label={badge.name}>
        <p className="text-3xl text-emerald-800" aria-hidden="true">{tier ? '✦' : '◇'}</p>
        <h3 className="mt-3 font-serif text-2xl">{badge.name}</h3>
        <p className="mt-2 text-sm text-stone-600">{badge.description}</p>
        <p className="mt-3 text-xs font-semibold">{tier?.name ?? t('Not unlocked yet')}</p>
        <progress className="mt-3 h-1.5 w-full" value={Math.min(total, next?.amount ?? total)} max={next?.amount ?? Math.max(1, total)} aria-label={badge.name} />
        <p className="mt-2 text-sm" data-testid={`total-${badge.id}`}>{total}{next ? ` / ${next.amount}` : ''}</p>
        <FlavorText flavor={tier?.flavor ?? badge.flavor} legacy={tier?.flavor_text || badge.flavor_text} />
      </article>;
    })}</div>
    <h2 className="mb-2 mt-10 text-2xl">{t('Mating scraps')}</h2>
    <p className="mb-4 text-sm text-stone-600">{t('One notation, one collectible. Open a scrap for its real checkmate counts.')}</p>
    {!collection.scraps.length && <p className="note-card text-sm text-stone-600">{t('Your first mating scrap is waiting to be discovered.')}</p>}
    <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">{collection.scraps.map(scrap => <details className={`scrap-card note-card ${scrap.mode === 'real' ? 'scrap-real' : 'scrap-virtual'}`} key={scrap.notation} data-testid={`scrap-${scrap.notation}`}>
      <summary className="cursor-pointer"><span className="block font-serif text-3xl">{scrap.notation}</span><span className="label mt-2 inline-block">{t(scrap.mode === 'real' ? 'Real' : 'Virtual')}</span></summary>
      <p className="mt-4 text-sm" data-testid="real-counts">{t('Real checkmates · White {white} · Black {black}', scrap.realCounts)}</p>
      <div className="mt-3 space-y-2">{scrap.occurrences.map(({ gameId, event }, index) => {
        const record = games.find(game => game.id === gameId)!;
        return <button className="text-button block text-left" disabled={busy} key={`${gameId}:${index}`} onClick={() => onOpen(record.pgn, { ply: event.ply, virtualPly: event.virtualPly, virtual: record.virtual })}>{labels.get(gameId)} · {t(event.mode === 'real' ? 'Real' : 'Virtual')}</button>;
      })}</div>
    </details>)}</div>
    <h2 className="mb-4 mt-10 text-2xl">{t('Collected games')}</h2>
    {!games.length && <p className="text-sm text-stone-600">{t('No games collected yet.')}</p>}
    <ul className="space-y-2">{[...games].sort((a, b) => b.collectedAt.localeCompare(a.collectedAt)).map(record => <li key={record.id} className="note-card flex flex-wrap items-center justify-between gap-3 !p-4">
      <span className="text-sm">{labels.get(record.id)} · {t(record.color === 'white' ? 'White' : 'Black')}</span>
      <button className="text-button" disabled={busy} onClick={() => onOpen(record.pgn)}>{t('Replay game')}</button>
    </li>)}</ul>
  </section>;
}
