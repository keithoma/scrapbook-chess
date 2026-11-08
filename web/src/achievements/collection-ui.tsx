import { useEffect, useMemo, useRef, useState } from 'react';
import { profileApi, announceProfileChange } from '../profile-api';
import type { Color } from 'chessops/types';
import { parseGame, type ReplayGame } from '../game';
import { ANALYSIS_VERSION, type Checkpoint, type VirtualMove } from '../storage';
import { translate, type Locale, type Message, type Parameters } from '../i18n';
import { BADGES, progressFor, type Flavor } from './catalog';
import { contributions, gameIdentity, isCompletedGame, newlyUnlocked, projectCollection, retainCollectedEvidence, type Contribution, type GameGrant } from './collection';
import { collectGame, readCollection, subscribeCollection } from './ledger';
import { MASTERIES, type EndgameMasteryContribution } from './mastery';
import { OpeningStatus } from '../openings/status';
import { MasteryCard } from './mastery-card';
import { PawnEndgameReview } from '../endgames/review';

export interface Jump { ply: number; virtualPly?: number; virtual?: VirtualMove[] }
export function useLocalCollection(profileId?: string, loading = false) {
  const [saved, setSaved] = useState<{ scope?: string; games: GameGrant[] }>({ games: [] });
  const [loaded, setLoaded] = useState(false);
  const currentScope = useRef(profileId); currentScope.current = profileId;
  const setGames = (games: GameGrant[]) => { if (currentScope.current === profileId) setSaved({ scope: profileId, games }); };
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    if (loading) return;
    setLoaded(false); setError(false);
    const refresh = () => { void (profileId ? profileApi.collection() : readCollection()).then(value => { if (alive) { setGames(value); setError(false); setLoaded(true); } }).catch(() => { if (alive) { setError(true); setLoaded(true); } }); };
    refresh();
    const unsubscribe = subscribeCollection(refresh);
    window.addEventListener('scrapbook-profile-changed', refresh); window.addEventListener('focus', refresh);
    let channel: BroadcastChannel | undefined;
    try { channel = new BroadcastChannel('scrapbook-profile'); channel.onmessage = refresh; } catch {}
    return () => { alive = false; unsubscribe(); window.removeEventListener('scrapbook-profile-changed', refresh); window.removeEventListener('focus', refresh); channel?.close(); };
  }, [profileId, loading]);
  return { games: loading || saved.scope !== profileId ? [] : saved.games, setGames, error, loading: loading || (!error && (!loaded || saved.scope !== profileId)) };
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

export function GameRewards({ game, checkpoint, color, onColor, games, onSaved, ply, virtualPly, onJump, locale, profileMode = false, imported = false, locked = false, preparedEvents }: {
  profileMode?: boolean; imported?: boolean; locked?: boolean; preparedEvents?: Contribution[];
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
  const eligible = isCompletedGame(game) && (!profileMode || imported);
  let events = preparedEvents ?? (color && eligible ? retainCollectedEvidence(recorded, color, contributions({ ...game, timeZone: recorded?.timeZone ?? game.timeZone }, color, checkpoint)) : []);
  const savedVirtual = recorded?.color === color ? recorded.events.filter(event => event.kind === 'scrap' && event.mode === 'virtual') : [];
  if (savedVirtual.length && !events.some(event => event.kind === 'scrap' && event.mode === 'real')) {
    events = [...events.filter(event => !(event.kind === 'scrap' && event.mode === 'virtual')), ...savedVirtual];
  }
  const atMove = events.filter(event => event.kind === 'scrap' && event.virtualPly !== undefined
    ? virtualPly === event.virtualPly
    : !virtualPly && event.ply === ply);
  const soFar = events.filter(event => event.kind === 'badge' && event.ply <= ply);
  const totals = projectCollection(games).totals;

  const collect = async () => {
    if (locked || !color || saving || !eligible) return;
    setSaving(true); setFailed(false);
    try {
      const result = profileMode ? await profileApi.collect(gameIdentity(game), checkpoint) : await collectGame(game, color, checkpoint);
      const previous = result.before.find(entry => entry.id === result.grant.id);
      setUnchanged(previous?.color === color && JSON.stringify(previous.events) === JSON.stringify(result.grant.events));
      setReveal(newlyUnlocked(result.before, result.after));
      onSaved(result.after);
      if (profileMode) announceProfileChange();
    } catch { setFailed(true); }
    finally { setSaving(false); }
  };

  return <section className="note-card" aria-labelledby="game-rewards-title">
    <p className="label text-emerald-800">{t('YOUR NEXT DISCOVERY')}</p>
    <h2 id="game-rewards-title" className="mt-3 text-2xl">{t('Your game, your rewards.')}</h2>
    <label className="mt-4 block text-sm font-semibold" htmlFor="player-color">{t('I played as')}</label>
    <select id="player-color" className="mt-2 w-full rounded-lg border border-stone-300 bg-white/60 p-3" value={color} onChange={event => { onColor(event.target.value as Color | ''); setReveal(undefined); }} disabled={saving || (profileMode && imported)}>
      <option value="">{t('Choose after your game')}</option>
      <option value="white">{t('White')} · {game.white}</option>
      <option value="black">{t('Black')} · {game.black}</option>
    </select>
    {recorded && !profileMode && <p className="mt-2 text-xs text-stone-600">{t('Changing color replaces this game’s rewards; it does not collect both sides.')}</p>}
    {profileMode && imported && <p className="mt-2 text-xs text-stone-600">{t('Your player color comes from the imported account.')}</p>}
    {!eligible && <p className="mt-3 text-sm text-stone-600">{t(profileMode ? 'Open an imported game from Profile to collect profile rewards.' : 'Load a completed game to collect rewards.')}</p>}
    <button className="primary-button mt-4 w-full" onClick={() => void collect()} disabled={locked || !color || !eligible || saving}>{saving ? t('Saving rewards…') : t('Collect rewards')}</button>
    {color && eligible && (!checkpoint || checkpoint.version !== ANALYSIS_VERSION || checkpoint.results.length !== game.moves.length) && <p className="mt-3 text-sm text-stone-600">{t('Analyze the complete game and collect again for evaluation-based badges.')}</p>}
    {color && eligible && <OpeningStatus game={game} color={color} checkpoint={checkpoint} saved={recorded?.color === color && recorded.events.some(e => e.kind === 'mastery' && e.family === 'opening')} locale={locale}/>}
    {color && <PawnEndgameReview game={game} color={color} checkpoint={checkpoint} locale={locale} locked={locked}
      saved={recorded?.color === color ? recorded.events.find((event): event is EndgameMasteryContribution => event.kind === 'mastery' && event.family === 'endgame' && event.masteryId === 'mastery_pawn_vs_pawn') : undefined}
      onJump={ply => onJump({ ply })} />}
    {failed && <p className="mt-3 text-sm text-red-800" role="alert">{t('Could not save rewards. Please try again.')}</p>}
    {!locked && reveal && <div className="reward-reveal mt-4 rounded-xl border border-amber-400 bg-amber-50 p-4" role="status" data-testid="reward-reveal">
      <h3 className="font-serif text-xl">{unchanged ? t('Already in your scrapbook.') : t('A little more remarkable.')}</h3>
      {unchanged ? <p className="mt-2 text-sm">{t('No progress was counted twice.')}</p> : <>
        <p className="mt-2 text-sm">{t('Game rewards saved. Your collection is up to date.')}</p>
        {reveal.masteries.map(({definition,xp,levels})=><div key={definition.id}>{xp>0&&<p className="mt-3 font-semibold">{t('{mastery} +{xp} XP',{mastery:t(definition.name),xp})}</p>}{levels.map(level=><p className="mt-2 font-serif text-xl" key={level}>{t('{mastery} reached level {level}!',{mastery:t(definition.name),level})}</p>)}</div>)}
        {reveal.tiers.map(({ badge, tier }) => <div className="mt-4 border-t border-amber-200 pt-3" key={`${badge.id}:${tier.name}`}>
          <p className="font-semibold">✦ {badge.name} · {tier.name}</p>
          <FlavorText flavor={tier.flavor} legacy={tier.flavor_text} />
        </div>)}
        {reveal.scraps.map(scrap => <p className="mt-3 font-serif text-2xl" key={scrap.notation}>✧ {scrap.notation} <span className="font-sans text-xs">{t(scrap.mode === 'real' ? 'Real' : 'Virtual')}</span></p>)}
      </>}
    </div>}
    {!locked && color && eligible && <details className="mt-5 border-t border-stone-200 pt-4"><summary className="text-button">{t('Game contributions')}</summary>
      <h3 className="label">{t('THIS GAME THROUGH THE CURRENT MOVE')}</h3>
      <ul className="mt-3 space-y-1 text-sm">{BADGES.filter(badge => !badge.config.is_hidden || progressFor(badge, totals[badge.id]).tier).map(badge => <li className="flex justify-between gap-3" key={badge.id}><span>{badge.name}</span><span data-testid={`replay-${badge.id}`}>{soFar.reduce((sum, event) => sum + (event.kind === 'badge' && event.badgeId === badge.id ? event.amount : 0), 0)}</span></li>)}</ul>
      {MASTERIES.map(definition=><p key={definition.id} className="mt-2 text-sm" data-testid={definition.id==='mastery_knight_forks'?'replay-mastery-xp':definition.id==='mastery_skewers'?'replay-skewer-xp':`replay-${definition.id}`}>{t('{mastery} +{xp} XP',{mastery:t(definition.name),xp:events.reduce((sum,event)=>sum+(event.kind==='mastery'&&event.masteryId===definition.id&&event.ply<=ply?event.amount:0),0)})}</p>)}
      <p className="label mt-4">{t('AT THIS MOMENT')}</p>
      {atMove.length ? <ul className="mt-2 space-y-2 text-sm">{atMove.map((event, index) => <li key={index}>{event.kind === 'mastery' ? t('{mastery} +{xp} XP', {mastery:t(MASTERIES.find(definition=>definition.id===event.masteryId)!.name),xp:event.amount}) : event.kind === 'badge' ? `${BADGES.find(b => b.id === event.badgeId)!.name} +${event.amount}` : `${event.notation} · ${t(event.mode === 'real' ? 'Real' : 'Virtual')}`}{event.kind === 'badge' && event.originPly !== undefined && <button className="text-button ml-2" onClick={() => onJump({ ply: event.originPly! })}>{t('Replay from ply {ply}', { ply: event.originPly })}</button>}</li>)}</ul> : <p className="mt-2 text-xs text-stone-500">{t('No contribution on this move.')}</p>}
      <details className="mt-4"><summary className="text-button cursor-pointer">{t('Jump to a reward moment')}</summary><div className="mt-2 flex max-h-40 flex-wrap gap-1 overflow-y-auto">{events.map((event, index) => <button className="move-button" key={index} onClick={() => onJump({ ply: event.ply, virtualPly: event.kind === 'scrap' ? event.virtualPly : undefined, virtual: event.kind === 'scrap' && event.mode === 'virtual' ? recorded?.virtual ?? checkpoint?.virtual : undefined })}>{event.kind === 'scrap' ? event.notation : event.kind === 'mastery' ? `${event.ply} · ${t('{mastery} +{xp} XP', {mastery:t(MASTERIES.find(definition=>definition.id===event.masteryId)!.name),xp:event.amount})}` : `${event.ply} · ${BADGES.find(b => b.id === event.badgeId)!.name}`}</button>)}</div></details>
    </details>}
    {locale === 'de' && <p className="mt-3 text-xs text-stone-500">{t('Badge names and flavor text are the English originals.')}</p>}
  </section>;
}

export function CollectionView({ games, locale, onOpen, failed, busy, loading = false, profileMode = false }: {
  profileMode?: boolean; loading?: boolean;
  games: GameGrant[]; locale: Locale; onOpen: (pgn: string, jump?: Jump) => void; failed: boolean; busy: boolean;
}) {
  const t = (key: Message, parameters?: Parameters) => translate(locale, key, parameters);
  const collection = useMemo(() => projectCollection(games), [games]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [subcategory, setSubcategory] = useState('all');
  const [unlock, setUnlock] = useState('all');
  const categories = [...new Set(BADGES.map(badge => badge.category))].sort();
  const subcategories = [...new Set(BADGES.filter(badge => category === 'all' || badge.category === category).map(badge => badge.subcategory))].sort();
  const byColor = useMemo(() => ({ white: projectCollection(games.filter(game => game.color === 'white')).totals, black: projectCollection(games.filter(game => game.color === 'black')).totals }), [games]);
  const badges = BADGES.filter(badge => {
    const unlocked = !!progressFor(badge, collection.totals[badge.id]).tier;
    return (!badge.config.is_hidden || unlocked) && (category === 'all' || badge.category === category)
      && (subcategory === 'all' || badge.subcategory === subcategory)
      && (unlock === 'all' || (unlock === 'unlocked') === unlocked)
      && `${badge.name} ${badge.description}`.toLocaleLowerCase(locale).includes(query.trim().toLocaleLowerCase(locale));
  });
  const labels = useMemo(() => new Map(games.map(record => {
    const game = parseGame(record.pgn);
    return [record.id, `${game.white} ${translate(locale, 'vs')} ${game.black}`];
  })), [games, locale]);
  if (loading) return <section className="page-section"><h1>{t('Achievements')}</h1><p className="empty-state" role="status"><span className="spinner" aria-hidden="true" />{t('Loading your achievements…')}</p></section>;
  if (failed) return <section className="page-section"><h1>{t('Achievements')}</h1><p className="error-state" role="alert">{t('Could not open the local collection. Reload to try again.')}</p></section>;
  return <section className="page-section" aria-labelledby="collection-title">
    <p className="label text-emerald-800">{t('Your progress, collected')}</p>
    <h1 id="collection-title" className="mt-3 text-4xl">{t('Achievements')}</h1>
    <p className="mt-3 text-sm leading-6 text-stone-600">{t(profileMode ? 'Saved with your profile on the local server.' : 'Saved only in this browser. Collect completed PGNs to try the reward loop.')}</p>
    {busy && <p className="mt-3 text-sm text-stone-600">{t('Pause analysis before opening another game.')}</p>}
    <h2 className="my-6 text-2xl">{t('Masteries')}</h2>
    <div className="mastery-grid">{MASTERIES.map(definition=><MasteryCard key={definition.id} definition={definition} progress={collection.masteries[definition.id]} games={games} labels={labels} locale={locale} busy={busy} onOpen={onOpen}/>)}</div>
    <h2 className="my-6 text-2xl">{t('Badges')}</h2>
    {locale === 'de' && <p className="mb-3 text-xs text-stone-500">{t('Badge names and flavor text are the English originals.')}</p>}
    <div className="tier-legend"><span>{t('Standard badge tiers')}</span><ol>{['Stone', 'Pawn', 'Knight', 'Bishop', 'Rook', 'Queen', 'King', 'Immortal', 'Legend'].map(tier => <li key={tier}>{tier}</li>)}</ol><p>{t('Some badges use their authored tier names. Thresholds follow each badge’s definition.')}</p></div>
    <div className="filter-bar">
      <label>{t('Search badges')}<input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label>
      <label>{t('Category')}<select aria-label={t('Category')} value={category} onChange={event => { setCategory(event.target.value); setSubcategory('all'); }}><option value="all">{t('All categories')}</option>{categories.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>{t('Subcategory')}<select aria-label={t('Subcategory')} value={subcategory} onChange={event => setSubcategory(event.target.value)}><option value="all">{t('All subcategories')}</option>{subcategories.map(value => <option key={value}>{value}</option>)}</select></label>
      <label>{t('Unlock status')}<select aria-label={t('Unlock status')} value={unlock} onChange={event => setUnlock(event.target.value)}><option value="all">{t('All badges')}</option><option value="locked">{t('Locked')}</option><option value="unlocked">{t('Unlocked')}</option></select></label>
    </div>
    {!badges.length && <p className="empty-state">{t('No badges match these filters.')}</p>}
    <div className="achievement-grid">{badges.map(badge => {
      const { total, tier, next } = progressFor(badge, collection.totals[badge.id]);
      return <article className="note-card badge-card" key={badge.id} aria-label={badge.name}>
        <p className="achievement-category">{badge.category} · {badge.subcategory}</p>
        <span className={`status-badge ${tier ? 'status-ready' : ''}`}>{t(tier ? 'Unlocked' : 'Locked')}</span>
        <p className="text-3xl text-emerald-800" aria-hidden="true">{tier ? '✦' : '◇'}</p>
        <h3 className="mt-3 font-serif text-2xl">{badge.name}</h3>
        <p className="mt-2 text-sm text-stone-600">{badge.description}</p>
        <p className="mt-3 text-xs font-semibold tier-name">{tier?.name ?? t('Not unlocked yet')}</p>
        <progress className="mt-3 h-1.5 w-full" value={Math.min(total, next?.amount ?? total)} max={next?.amount ?? Math.max(1, total)} aria-label={badge.name} />
        <p className="mt-2 text-sm" data-testid={`total-${badge.id}`}>{total}{next ? ` / ${next.amount}` : ''}</p>
        {next && <p className="mt-2 text-xs text-stone-600">{t('Next tier')}: <span className="tier-name">{next.name}</span> · {next.amount}</p>}
        <details className="mt-3"><summary className="text-button">{t('Contributions by played color')}</summary><p className="mt-2 text-xs">{t('White')} {byColor.white[badge.id]} · {t('Black')} {byColor.black[badge.id]} · {t('Both')} {total}</p><p className="mt-1 text-xs text-stone-500">{t('Both is combined progress, not a separate unlock.')}</p></details>
        <details className="mt-3"><summary className="text-button">{t('Flavor text')}</summary><FlavorText flavor={tier?.flavor ?? badge.flavor} legacy={tier?.flavor_text || badge.flavor_text} /></details>
      </article>;
    })}</div>
    <h2 className="mb-2 mt-10 text-2xl">{t('Mating scraps')}</h2>
    <p className="mb-4 text-sm text-stone-600">{t('One notation, one collectible. Open a scrap for its real checkmate counts.')}</p>
    {!collection.scraps.length && <p className="note-card text-sm text-stone-600">{t('Your first mating scrap is waiting to be discovered.')}</p>}
    <div className="grid items-start gap-4 sm:grid-cols-2 lg:grid-cols-3">{collection.scraps.map(scrap => <details className={`scrap-card note-card ${scrap.mode === 'real' ? 'scrap-real' : 'scrap-virtual'}`} key={scrap.notation} data-testid={`scrap-${scrap.notation}`}>
      <summary className="cursor-pointer"><span className="block font-serif text-3xl">{scrap.notation}</span><span className="label mt-2 inline-block">{t(scrap.mode === 'real' ? 'Real' : 'Virtual')}</span></summary>
      <p className="mt-4 text-sm" data-testid="real-counts">{t('Real checkmates · White {white} · Black {black}', scrap.realCounts)}</p><div className="completion-states"><span className={scrap.realCounts.white ? 'complete' : ''}>{t('White')} · {t(scrap.realCounts.white ? 'Unlocked' : 'Locked')}</span><span className={scrap.realCounts.black ? 'complete' : ''}>{t('Black')} · {t(scrap.realCounts.black ? 'Unlocked' : 'Locked')}</span><span className={scrap.realCounts.white && scrap.realCounts.black ? 'complete' : ''}>{t('Both')} · {t(scrap.realCounts.white && scrap.realCounts.black ? 'Unlocked' : 'Locked')}</span></div>
      <div className="mt-3 space-y-2">{scrap.occurrences.map(({ gameId, event }, index) => {
        const record = games.find(game => game.id === gameId)!;
        return <button className="text-button block text-left" disabled={busy} key={`${gameId}:${index}`} onClick={() => onOpen(record.pgn, { ply: event.ply, virtualPly: event.virtualPly, virtual: record.virtual })}>{labels.get(gameId)} · {t(event.mode === 'real' ? 'Real' : 'Virtual')}</button>;
      })}</div>
    </details>)}</div>
    <h2 className="mb-4 mt-10 text-2xl">{t('Collected games')}</h2>
    {!games.length && <p className="text-sm text-stone-600">{t('No games collected yet.')}</p>}
    <ul className="space-y-2">{[...games].sort((a, b) => b.collectedAt.localeCompare(a.collectedAt)).map(record => <li key={record.id} className="note-card flex flex-wrap items-center justify-between gap-3 !p-4">
      <span className="text-sm">{labels.get(record.id)} · {t(record.color === 'white' ? 'White' : 'Black')}
        {(record.source || record.id.startsWith('lichess:') || record.id.startsWith('chesscom:')) && <span className="mt-1 block text-xs text-stone-600">{(record.source?.platform ?? record.id.split(':')[0]) === 'lichess' ? 'Lichess' : 'chess.com'}{record.source ? ` · ${record.source.username}` : ''}</span>}
      </span>
      <button className="text-button" disabled={busy} onClick={() => onOpen(record.pgn)}>{t('Replay game')}</button>
    </li>)}</ul>
  </section>;
}
