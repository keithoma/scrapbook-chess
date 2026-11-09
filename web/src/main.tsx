import { OPENING_POLICY } from './achievements/mastery-policy';
import { CARO_KANN_PGN } from './fixtures';
import { skewerCandidates } from './tactics/skewers';
import { SkewerInspector } from './tactics/skewer-inspector';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseGame, withGameClocks, SAMPLE_PGN, MATE_PGN } from './game';
import { RECENT_GAME_PGN, FORK_PGN, SKEWER_PGN, JOBAVA_PGN, PAWN_ENDGAME_PGN } from './fixtures';
import { DEPTH, listCheckpoints, loadCheckpoint, saveCheckpoint, type Checkpoint } from './storage';
import { prepareEngine, StockfishClient } from './stockfish';
import { analyzeGame } from './analysis';
import { annotateMoves } from './chess/annotations';
import { useLocale, type Locale, type Message, type Parameters } from './i18n';
import { FeedbackBox } from './support';
import { CollectionView, GameRewards, useLocalCollection, type Jump } from './achievements/collection-ui';
import { contributions, gameIdentity, isCompletedGame, projectCollection, retainCollectedEvidence, virtualMate } from './achievements/collection';
import type { Color } from 'chessops/types';
import { knightForkCandidates } from './tactics/knight-forks';
import { ForkInspector } from './tactics/fork-inspector';
import { Board } from './board';
import './style.css';
import { ProfileView, useProfile } from './profile';
import { profileApi } from './profile-api';
import { ANALYSIS_VERSION } from './storage';
import { SettingsView } from './settings';
import { initialTimeZone, saveTimeZone } from './preferences';
import { gameLibrary, gameDate, HomeView, HistoryView } from './game-library';
import { hasCompleteAnalysis, hasEngineChoices } from './review-state';
import { EngineReview } from './engine-review';
import { reviewHighlights } from './review-highlights';

const recentGameId = gameIdentity(parseGame(RECENT_GAME_PGN));
type Status = 'loading' | 'ready' | 'downloading' | 'analyzing' | 'virtual' | 'paused' | 'complete' | 'error';

function pageFor(path: string) {
  const pathname = path.split('?')[0];
  if (pathname === '/collection') return 'achievements';
  return ({ '/': 'home', '/achievements': 'achievements', '/history': 'history', '/review': 'review', '/profile': 'profile', '/settings': 'settings', '/help': 'help', '/feedback': 'feedback' } as Record<string, string>)[pathname] ?? 'missing';
}

function App() {
  const { locale, setLocale, t, number } = useLocale();
  const [route, setRoute] = useState(() => location.pathname + location.search);
  const page = pageFor(route);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1000);
  const moveList = useRef<HTMLDivElement>(null);
  const goTo = (destination: string) => {
    setPlaying(false);
    history.pushState(null, '', destination); setRoute(destination);
    window.scrollTo(0, 0);
  };
  const navigate = (event: React.MouseEvent<HTMLAnchorElement>, destination: string) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); goTo(destination);
  };
  useEffect(() => {
    const pop = () => { setPlaying(false); setRoute(location.pathname + location.search); };
    const visibility = () => { if (document.hidden) setPlaying(false); };
    window.addEventListener('popstate', pop); document.addEventListener('visibilitychange', visibility);
    return () => { window.removeEventListener('popstate', pop); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  const [game, setGame] = useState(() => parseGame(RECENT_GAME_PGN));
  const forks = useMemo(() => knightForkCandidates(game), [game]);
  const skewers = useMemo(() => skewerCandidates(game), [game.frames]);
  const profile = useProfile();
  const [guestZone, setGuestZone] = useState(initialTimeZone);
  const collection = useLocalCollection(profile.user?.id, profile.loading);
  const [choice, setChoice] = useState<{ id: string; color: Color | '' }>();
  const gameId = gameIdentity(game);
  const savedGame = collection.games.find(record => record.id === gameId);
  const importedGame = profile.games.find(record => record.id === gameId);
  const playerColor = importedGame?.color ?? (choice?.id === gameId ? choice.color : savedGame?.color ?? (gameId === recentGameId ? 'black' : ''));
  const ownedElsewhere = new Set(projectCollection(collection.games.filter(record => record.id !== gameId)).scraps.map(scrap => scrap.notation));
  const savedVirtual = savedGame?.color === playerColor && savedGame.events.some(event => event.kind === 'scrap' && event.mode === 'virtual');
  const [draft, setDraft] = useState(RECENT_GAME_PGN);
  const [checkpoint, setCheckpoint] = useState<Checkpoint>();
  const annotatedResults = useMemo(() => checkpoint?.pgn === game.pgn ? annotateMoves(game, checkpoint.results) : [], [game, checkpoint]);
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState<Message>('Opening your local notebook…');
  const [messageParameters, setMessageParameters] = useState<Parameters>({});
  const [error, setError] = useState('');
  const [ply, setPly] = useState(0);
  const [virtualPly, setVirtualPly] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const orientedGame = useRef<string>(undefined);
  useEffect(() => {
    if (playerColor && orientedGame.current !== gameId) { setFlipped(playerColor === 'black'); orientedGame.current = gameId; }
  }, [gameId, playerColor]);
  const runner = useRef<{ controller: AbortController; engine?: StockfishClient } | undefined>(undefined);
  const revision = useRef(0);
  const [localCheckpoints, setLocalCheckpoints] = useState<Checkpoint[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyFailed, setHistoryFailed] = useState(false);
  const remember = (saved: Checkpoint) => setLocalCheckpoints(previous => [saved, ...previous.filter(entry => entry.key !== saved.key)]);
  const busy = ['loading', 'downloading', 'analyzing', 'virtual'].includes(status);

  useEffect(() => {
    let alive = true;
    const restore = async () => {
      try {
        const all = await listCheckpoints();
        const saved = all[0];
        const pgn = saved?.pgn ?? RECENT_GAME_PGN;
        const restored = saved ?? await loadCheckpoint(pgn);
        if (!alive) return;
        const parsed = parseGame(pgn);
        setLocalCheckpoints(all); setGame(parsed); setDraft(pgn); setCheckpoint(restored); setFlipped(gameIdentity(parsed) === recentGameId);
        setStatus(hasCompleteAnalysis(parsed, restored) ? 'complete' : restored.results.length ? 'paused' : 'ready');
        setMessage(restored.results.length ? 'Saved analysis restored. Pick up where you left off.' : 'Your browser is the analysis engine.');
      } catch (cause) {
        if (alive) { setHistoryFailed(true); setStatus('error'); setError(`Could not open local checkpoints: ${String(cause)}`); }
      }
    };
    void restore().finally(() => { if (alive) setHistoryLoading(false); });
    const leave = () => { runner.current?.controller.abort(); runner.current?.engine?.terminate(); };
    const returnToPage = () => {
      if (runner.current?.controller.signal.aborted) {
        setStatus('paused'); setMessage('Analysis was interrupted. Resume from the saved moves.');
      }
    };
    window.addEventListener('pagehide', leave);
    window.addEventListener('pageshow', returnToPage);
    return () => { alive = false; leave(); window.removeEventListener('pagehide', leave); window.removeEventListener('pageshow', returnToPage); };
  }, []);

  const openGame = async (pgn: string, jump?: Jump, navigateToReview = true) => {
    if (busy) return;
    const ticket = ++revision.current;
    try {
      const parsed = parseGame(pgn);
      setPlaying(false); setError(''); setStatus('loading');
      let saved = await loadCheckpoint(parsed.pgn);
      const imported = profile.games.find(record => record.id === gameIdentity(parsed));
      if (profile.user && imported) {
        try {
          const remote = await profileApi.analysis(imported.id);
          if (remote?.pgn === parsed.pgn && remote.version === ANALYSIS_VERSION && remote.results.length >= saved.results.length
            && (!hasCompleteAnalysis(parsed, saved) || hasCompleteAnalysis(parsed, remote))
            && (remote.results.length > saved.results.length || remote.results.filter(result => result.topMoves?.length).length >= saved.results.filter(result => result.topMoves?.length).length)) saved = { ...remote, key: saved.key };
        } catch { setError(t('Server analysis could not be loaded. The local checkpoint is still available.')); }
      }
      await saveCheckpoint(saved); remember(saved);
      if (ticket !== revision.current) return;
      const replay = jump?.virtual ? { ...saved, virtual: jump.virtual, virtualStatus: 'mate' as const, virtualWinner: parseFen(jump.virtual.at(-1)!.fen).unwrap().turn === 'white' ? 'black' as const : 'white' as const } : saved;
      setGame(parsed); setDraft(parsed.pgn); setCheckpoint(replay); setPly(jump?.ply ?? 0); setVirtualPly(jump?.virtualPly ?? 0);
      setFlipped((imported?.color ?? collection.games.find(record => record.id === gameIdentity(parsed))?.color ?? (gameIdentity(parsed) === recentGameId ? 'black' : '')) === 'black');
      setStatus(hasCompleteAnalysis(parsed, saved) ? 'complete' : saved.results.length ? 'paused' : 'ready');
      if (navigateToReview) goTo(`/review?game=${encodeURIComponent(gameIdentity(parsed))}`);
      setMessage(saved.results.length ? 'Saved analysis restored.' : 'Ready when you are.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus(hasCompleteAnalysis(game, checkpoint) ? 'complete' : checkpoint?.results.length ? 'paused' : 'ready');
    }
  };

  const pause = () => {
    runner.current?.controller.abort(); runner.current?.engine?.terminate();
    setStatus('paused'); setMessage('Paused. Completed moves are saved on this device.');
  };
  const start = async () => {
    if (busy || !checkpoint) return;
    const ticket = ++revision.current;
    const active = { controller: new AbortController(), engine: undefined as StockfishClient | undefined };
    runner.current = active;
    setError(''); setStatus('downloading');
    try {
      await prepareEngine(progress => { if (ticket === revision.current) { setMessage(progress.message); setMessageParameters(progress.parameters ?? {}); } });
      active.controller.signal.throwIfAborted();
      setMessage('Starting Stockfish…');
      const engine = new StockfishClient(); active.engine = engine;
      await engine.init();
      setStatus('analyzing'); setMessage('Reading the game, one move at a time.');
      let latest = checkpoint;
      await analyzeGame(game, checkpoint, engine, active.controller.signal, (saved, stage) => {
        if (ticket !== revision.current) return;
        setCheckpoint(saved); remember(saved);
        latest = saved;
        setStatus(stage === 'virtual' ? 'virtual' : 'analyzing');
        setMessage(stage === 'virtual' ? 'Exploring a separate engine finish…' : 'Reading the game, one move at a time.');
      }, playerColor && !savedVirtual ? { color: playerColor, owned: ownedElsewhere } : undefined);
      active.controller.signal.throwIfAborted();
      setStatus('complete'); setMessage('Analysis complete. Every played move is preserved.');
      if (profile.user && importedGame) {
        try { await profileApi.saveAnalysis(importedGame.id, latest); void profile.refresh(); }
        catch { setError(t('Analysis is saved on this device. Collect rewards to retry saving it to your profile.')); }
      }
    } catch (cause) {
      if (!active.controller.signal.aborted && ticket === revision.current) {
        setStatus('error'); setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      active.engine?.terminate();
      if (runner.current === active) runner.current = undefined;
    }
  };

  const candidate = virtualMate(game, checkpoint);
  const canRefine = candidate && candidate.color === playerColor && ownedElsewhere.has(candidate.notation) && !savedVirtual;
  const jumpTo = (jump: Jump) => {
    if (jump.virtual && checkpoint) setCheckpoint({ ...checkpoint, virtual: jump.virtual, virtualStatus: 'mate', virtualWinner: playerColor || undefined });
    setPlaying(false); setPly(jump.ply); setVirtualPly(jump.virtualPly ?? 0);
  };
  const completed = checkpoint?.results.length ?? 0;
  const progress = Math.round(completed / game.moves.length * 100);
  const result = annotatedResults[ply - 1];
  const choicesComplete = hasEngineChoices(game, checkpoint);
  let frame = game.frames[ply];
  if (virtualPly && checkpoint?.virtual[virtualPly - 1]) {
    const pos = Chess.fromSetup(parseFen(checkpoint.virtual[virtualPly - 1].fen).unwrap()).unwrap();
    frame = { fen: checkpoint.virtual[virtualPly - 1].fen, turn: pos.turn, checkmate: pos.isCheckmate(), pieces: [...pos.board].map(([square, piece]) => ({ square, ...piece })) };
  }
  const currentMove = virtualPly ? checkpoint?.virtual[virtualPly - 1] : game.moves[ply - 1];
  const beforeFen = virtualPly ? (virtualPly === 1 ? game.frames.at(-1)!.fen : checkpoint?.virtual[virtualPly - 2]?.fen) : game.frames[ply - 1]?.fen;
  const lastMove = currentMove && beforeFen ? { uci: currentMove.uci, beforeFen } : undefined;
  const go = (target: number) => { setPlaying(false); setVirtualPly(0); setPly(Math.min(game.moves.length, Math.max(0, target))); };
  const totalMs = checkpoint?.results.reduce((sum, move) => sum + move.ms, 0) ?? 0;
  const exportResults = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify({ ...checkpoint, results: annotatedResults }, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'scrapbook-analysis.json'; link.click(); URL.revokeObjectURL(url);
  };

  const library = useMemo(() => gameLibrary(localCheckpoints, collection.games, profile.games), [localCheckpoints, collection.games, profile.games]);
  const rewardGame = useMemo(() => ({ ...withGameClocks(game, importedGame?.clocks), timeControl: importedGame?.timeControl ?? game.timeControl,
    ratings: importedGame ? importedGame.ratings ?? {} : game.ratings, startedAt: importedGame?.startedAt ?? game.startedAt,
    drawReason: importedGame?.drawReason ?? game.drawReason, timeZone: profile.user?.timeZone ?? guestZone }), [game, importedGame, profile.user?.timeZone, guestZone]);
  const analysisComplete = hasCompleteAnalysis(game, checkpoint);
  const prepared = useMemo(() => {
    if (!hasCompleteAnalysis(rewardGame, checkpoint) || !playerColor) return { events: [], error: '' };
    try { return { events: isCompletedGame(rewardGame) ? retainCollectedEvidence(savedGame, playerColor, contributions({ ...rewardGame, timeZone: savedGame?.timeZone ?? rewardGame.timeZone }, playerColor, checkpoint)) : [], error: '' }; }
    catch (cause) { return { events: [], error: String(cause) }; }
  }, [rewardGame, checkpoint, playerColor, savedGame]);
  const reviewReady = analysisComplete && !!playerColor && !prepared.error && !busy && !collection.loading && !collection.error;
  const highlights = useMemo(() => reviewHighlights({ events: prepared.events, forks, skewers, results: annotatedResults, color: playerColor, locale }), [prepared.events, forks, skewers, playerColor, annotatedResults, locale]);
  const currentHighlight = !virtualPly && highlights.find(highlight => highlight.ply === ply);
  const previousHighlight = highlights.filter(highlight => highlight.ply < ply).at(-1)?.ply;
  const nextHighlight = highlights.find(highlight => highlight.ply > ply)?.ply;
  const nextGame = library.entries[library.entries.findIndex(entry => entry.id === gameId) + 1];
  const requestedId = page === 'review' ? new URLSearchParams(route.split('?')[1]).get('game') : null;
  const requested = library.entries.find(entry => entry.id === requestedId);
  useEffect(() => {
    if (requested && requested.id !== gameId && !busy) void openGame(requested.game.pgn, undefined, false);
  }, [requested?.id, requestedId, gameId, busy]);
  useEffect(() => {
    if (!playing) return;
    if (page !== 'review' || !reviewReady || virtualPly || ply >= game.moves.length) { setPlaying(false); return; }
    const timer = window.setTimeout(() => setPly(value => Math.min(game.moves.length, value + 1)), speed);
    return () => window.clearTimeout(timer);
  }, [playing, speed, ply, page, reviewReady, virtualPly, game.moves.length]);
  useEffect(() => {
    const list = moveList.current;
    const selected = list?.querySelector<HTMLElement>('[aria-current="step"]');
    if (!list || !selected) return;
    if (selected.offsetTop < list.scrollTop) list.scrollTop = selected.offsetTop;
    else if (selected.offsetTop + selected.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = selected.offsetTop + selected.offsetHeight - list.clientHeight;
  }, [ply, virtualPly, page, reviewReady]);
  const open = (pgn: string, jump?: Jump) => { void openGame(pgn, jump); };
  const reviewPath = `/review?game=${encodeURIComponent(gameId)}`;
  const libraryLoading = historyLoading || profile.loading || collection.loading;
  const routePending = !!requestedId && requestedId !== gameId;

  return <main className="app-shell">
    <header className="app-header">
      <a className="brand" href="/" onClick={event => navigate(event, '/')}>scrapbook<span>;</span> chess</a>
      <div className="header-tools"><label>{t('Language')} <select aria-label={t('Language')} value={locale} onChange={event => setLocale(event.target.value as Locale)}><option value="en">English</option><option value="de">Deutsch</option></select></label><span className="prototype-badge">{t('Local prototype')}</span></div>
    </header>
    <nav aria-label={t('Main navigation')} className="main-nav">
      {([['/', 'Home'], ['/achievements', 'Achievements'], ['/history', 'History']] as const).map(([path, label]) => <a key={path} href={path} onClick={event => navigate(event, path)} aria-current={page === pageFor(path) ? 'page' : undefined}>{t(label)}</a>)}
    </nav>
    <nav aria-label={t('More navigation')} className="secondary-nav">
      {([[reviewPath, 'Game review'], ['/profile', 'Profile'], ['/settings', 'Settings'], ['/help', 'Help'], ['/feedback', 'Feedback']] as const).map(([path, label]) => <a key={label} href={path} onClick={event => navigate(event, path)} aria-current={page === pageFor(path) ? 'page' : undefined}>{t(label)}</a>)}
    </nav>
    {busy && status !== 'loading' && page !== 'review' && <div className="activity-banner" role="status"><span className="spinner" aria-hidden="true" />{t('Analysis continues in this browser.')}<button className="text-button" onClick={() => goTo(reviewPath)}>{t('View analysis')}</button><button className="text-button" onClick={pause}>{t('Pause analysis')}</button></div>}
    {page === 'home' && <HomeView profile={profile} entries={library.entries} invalid={library.invalid} locale={locale} busy={busy} activeId={gameId} working={busy && status !== 'loading'} loading={libraryLoading} failed={historyFailed} onOpen={open} onNavigate={goTo} />}
    {page === 'history' && <HistoryView entries={library.entries} invalid={library.invalid} locale={locale} busy={busy} activeId={gameId} working={busy && status !== 'loading'} loading={libraryLoading} failed={historyFailed} onOpen={open} />}
    {page === 'review' && <section className="page-section" aria-labelledby="review-title">
      <div className="page-heading"><div><p className="eyebrow">{t('One move at a time')}</p><h1 id="review-title">{t('Game review')}</h1>{!routePending && <><p className="game-heading">{game.white} <span>{t('vs')}</span> {game.black}</p><p>{gameDate(rewardGame, locale)} · {rewardGame.timeControl || '—'} · {game.result}</p></>}</div><button className="secondary-button" onClick={() => goTo('/history')}>{t('Back to history')}</button></div>
          {error && <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-900" role="alert">{t('An error occurred.')}<details className="mt-2"><summary>{t('Technical details')}</summary>{error}</details></div>}
      {routePending ? <div className="empty-state" role="status">{t(libraryLoading || requested ? 'Opening game…' : 'This game is not available in your history.')}{busy && <button className="text-button" onClick={pause}>{t('Pause analysis')}</button>}</div> : <>
        {!reviewReady && <div className="preparation-state" data-testid="review-gate"><div><h2>{t('Prepare this game')}</h2><p>{t('Review unlocks when Stockfish analysis and achievement preparation are complete.')}</p></div>
          <ol><li><span className={`status-dot ${busy ? 'working' : ''}`} />{t('Stockfish analysis')}<strong>{t(analysisComplete ? 'Complete' : busy ? 'In progress' : 'Not complete')}</strong></li><li><span className="status-dot" />{t('Achievements')}<strong>{t(collection.error ? 'Could not prepare rewards' : collection.loading ? 'Loading…' : !analysisComplete ? 'Waiting for analysis' : !playerColor ? 'Choose your side below' : prepared.error ? 'Could not prepare rewards' : 'Complete')}</strong></li></ol>
          {collection.error && <p className="error-state" role="alert">{t('Could not open the local collection. Reload to try again.')}</p>}
          {prepared.error && <p className="error-state" role="alert">{t('Could not prepare rewards. Reload to try again.')}<details><summary>{t('Technical details')}</summary>{prepared.error}</details></p>}
        </div>}
        <div className={`review-grid ${reviewReady ? '' : 'review-preparing'}`}>
          {reviewReady && <section aria-label={t('Game replay')} className="board-column">
        <div className="mb-3 flex items-center justify-between gap-2 text-sm">
          <div><strong>{game.white}</strong><span className="mx-2 text-stone-400">{t('vs')}</span><strong>{game.black}</strong></div>
          <button className="text-button shrink-0" onClick={() => setFlipped(!flipped)}>{t('Flip board')}</button>
        </div>
        <div className="board-frame"><Board lastMove={lastMove} frame={frame} flipped={flipped} locale={locale} fork={virtualPly ? undefined : forks.find(fork => fork.ply === ply && fork.color === playerColor)} skewer={virtualPly ? undefined : skewers.find(candidate => candidate.ply === ply && candidate.color === playerColor)} /></div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex gap-1">
            <button className="nav-button" aria-label={t('First position')} onClick={() => go(0)}>↤</button>
            <button className="nav-button" aria-label={t('Previous move')} disabled={ply === 0 && !virtualPly} onClick={() => go(ply - 1)}>←</button>
            <button className="nav-button" aria-label={t('Next move')} disabled={ply === game.moves.length && !virtualPly} onClick={() => go(ply + 1)}>→</button>
            <button className="nav-button" aria-label={t('Last position')} onClick={() => go(game.moves.length)}>↦</button>
          </div>
          <span className="text-xs text-stone-600" data-testid="replay-position">{virtualPly ? t('Virtual ply {ply}', { ply: virtualPly }) : t('Ply {ply} / {total}', { ply, total: game.moves.length })}</span>
        </div>
        <div className="playback-bar">
          <button className="secondary-button" aria-pressed={playing} disabled={!!virtualPly || ply === game.moves.length} onClick={() => setPlaying(value => !value)}>{t(playing ? 'Pause autoplay' : 'Autoplay')}</button>
          <label>{t('Autoplay speed')}<select aria-label={t('Autoplay speed')} value={speed} onChange={event => setSpeed(Number(event.target.value))}><option value={2000}>{t('Slow')}</option><option value={1000}>{t('Normal')}</option><option value={500}>{t('Fast')}</option></select></label>
        </div>
        <input aria-label={t('Replay position')} className="mt-3 w-full accent-emerald-800" type="range" min={0} max={game.moves.length} value={ply} onChange={event => go(Number(event.target.value))} />
        <div className="mt-4 rounded-xl border border-stone-300 bg-white/40 p-4">
          <div className="label mb-2">{virtualPly ? t('ENGINE CONTINUATION · NOT PLAYED') : ply ? t('PLAYED · {move}', { move: game.moves[ply - 1].san }) : t('STARTING POSITION')}</div>
          {(!!virtualPly || !result) && <p className="text-sm text-stone-600">{virtualPly ? t('A separate simulated finish. Your original game is unchanged.') : t('Select a move to see its evaluation.')}</p>}
          <p className="mt-1 text-xs text-stone-500">{t('Scores are from White’s perspective.')}</p>
          {!virtualPly && result && <EngineReview result={result} beforeFen={game.frames[ply - 1].fen} locale={locale} onAddChoices={() => void start()} />}
          {!virtualPly && result?.annotations && result.annotations.book.status !== 'outside' && <p className="mt-2 text-sm text-emerald-800">{t(result.annotations.book.status === 'book' ? 'Book move' : 'Book candidate · frequency or loss statistics unavailable')}</p>}
        </div>
      </section>}
          <div className="review-side">
            {reviewReady &&     <section className="note-card move-card">
      <div className="mb-4 flex items-center justify-between"><h2 className="text-xl">{t('Move list')}</h2><span className="label">{game.result}</span></div>
      <div ref={moveList} className="move-list" aria-label={t('Played moves')} data-testid="played-moves">
        {game.moves.map(move => <button key={move.ply} aria-current={ply === move.ply && !virtualPly ? 'step' : undefined} onClick={() => go(move.ply)} className={`move-button ${ply === move.ply && !virtualPly ? 'selected' : ''}`} aria-label={t('Ply {ply}: {move}', { ply: move.ply, move: move.san })}>
          {move.ply % 2 === 1 && <span className="mr-1 text-stone-400">{Math.ceil(move.ply / 2)}.</span>}{move.san}
          {checkpoint?.results[move.ply - 1] && <span className="ml-1 text-emerald-700" aria-label={t('analyzed')}>·</span>}
          {annotatedResults[move.ply - 1]?.annotations?.book.status === 'book' && <span className="ml-1 text-emerald-800" aria-label={t('Book move')} title={t('Book move')}>▤</span>}
          {annotatedResults[move.ply - 1]?.annotations?.book.status === 'candidate' && <span className="ml-1 text-stone-500" aria-label={t('Unverified book candidate')} title={t('Book candidate · frequency or loss statistics unavailable')}>▤?</span>}
          {annotatedResults[move.ply - 1]?.annotations?.best && <span className="ml-1 text-emerald-800" aria-label={t('Best move')} title={t('Best move')}>★</span>}
          {annotatedResults[move.ply - 1]?.annotations?.only && <span className="ml-1 font-bold text-amber-800" aria-label={t('Only move')} title={t('Only move')}>!</span>}
        </button>)}
      </div>
    </section>}
            {reviewReady && <div className="review-actions note-card">
              <h2>{t('Highlights and rewards')}</h2>
              <div className="button-row">
                <button className="secondary-button" disabled={previousHighlight === undefined} onClick={() => go(previousHighlight!)}>{t('Previous highlight')}</button>
                <button className="secondary-button" disabled={nextHighlight === undefined} onClick={() => go(nextHighlight!)}>{t('Next highlight')}</button>
              </div>
              {currentHighlight && <section className="mt-4 text-sm" aria-label={t('What triggered this highlight')} data-testid="highlight-reasons" aria-live="polite">
                <h3 className="font-semibold">{t('What triggered this highlight')}</h3>
                <ul className="mt-2 list-disc space-y-2 pl-5">{currentHighlight.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul>
              </section>}
              {!highlights.length && <p>{t('No tactical or reward highlights in this game.')}</p>}
              <div className="button-row">
                <button className="secondary-button" onClick={() => { go(game.moves.length); const target = document.getElementById('review-rewards'); target?.focus({ preventScroll: true }); target?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' }); }}>{t('Skip to rewards')}</button>
                <button className="secondary-button" disabled={busy || !nextGame} onClick={() => nextGame && open(nextGame.game.pgn)}>{t('Next game')}</button>
              </div>
            </div>}
            <details className="analysis-details" open={!reviewReady}><summary>{t('Analysis status')} · {t(status === 'complete' ? 'Complete' : busy ? 'In progress' : status === 'error' ? 'Error' : 'Not complete')}</summary><div className="note-card">
          <div className="flex items-center justify-between gap-3"><span className="label text-emerald-800">{t('ON YOUR DEVICE')}</span><span className={`status-dot ${busy ? 'working' : ''}`} /></div>
          <h2 className="mt-4 text-2xl">{t('Game analysis')}</h2>
          <p className="mt-2 min-h-12 text-sm leading-6 text-stone-600" role="status" data-testid="status" data-state={status}>{t(message, messageParameters)}</p>
          <div className="mt-5 flex justify-between text-xs"><span>{t('Moves saved')}</span><span data-testid="progress">{completed} / {game.moves.length}</span></div>
          <progress className="mt-2 h-1.5 w-full" value={completed} max={game.moves.length} aria-label={t('Analysis progress')}>{progress}%</progress>
          <div className="my-4 grid grid-cols-3 gap-2 border-y border-stone-200 py-4 text-center">
            <div><strong className="metric">{DEPTH}</strong><span className="metric-label">{t('search depth')}</span></div>
            <div><strong className="metric">{number(totalMs / 1000, 1)}s</strong><span className="metric-label">{t('move analysis')}</span></div>
            <div><strong className="metric">{completed ? number(totalMs / completed) : '—'}</strong><span className="metric-label">{t('ms / ply')}</span></div>
          </div>
          <button className="primary-button w-full" onClick={() => void start()} disabled={busy || !checkpoint || (status === 'complete' && choicesComplete)}>
            {busy ? t('Working in your browser…') : status === 'complete' ? t(choicesComplete ? 'Analysis complete ✓' : 'Add engine choices') : completed ? t('Resume analysis') : t('Analyze this game')}
          </button>
          {['downloading', 'analyzing', 'virtual'].includes(status) && <button className="text-button mt-3 w-full" onClick={pause}>{t('Pause analysis')}</button>}
          <button className="text-button mt-3" disabled={!checkpoint} onClick={exportResults}>{t('Export analysis JSON')}</button>

          <p className="mt-3 text-xs leading-5 text-stone-500">{t('Full Stockfish 19 · one worker · 32 MB hash. First use downloads a large engine; later visits use its cache. Completed moves survive a reload.')}</p>
        </div></details>
            <div id="review-rewards" tabIndex={-1}><GameRewards key={`${profile.user?.id ?? 'guest'}:${gameId}`} profileMode={!!profile.user} imported={!!importedGame} locked={!reviewReady} preparedEvents={prepared.events} game={rewardGame} checkpoint={checkpoint} color={playerColor} onColor={color => { setPlaying(false); setChoice({ id: gameId, color }); setFlipped(color === 'black'); }} games={collection.games} onSaved={collection.setGames} ply={ply} virtualPly={virtualPly} onJump={jumpTo} locale={locale} /></div>
          </div>
        </div>
        {reviewReady && <div className="review-evidence"><ForkInspector game={game} saved={savedGame?.color === playerColor ? savedGame.events.filter(event => event.kind === 'mastery' && event.family !== 'opening' && event.family !== 'endgame') : undefined} candidates={forks} color={playerColor} checkpoint={checkpoint} ply={ply} virtual={!!virtualPly} onJump={go} locale={locale} />
        <SkewerInspector game={game} saved={savedGame?.color === playerColor ? savedGame.events.filter(event => event.kind === 'mastery' && event.family !== 'opening' && event.family !== 'endgame') : undefined} candidates={skewers} color={playerColor} checkpoint={checkpoint} ply={ply} virtual={!!virtualPly} onJump={go} locale={locale}/> <div className="note-card">
          <div className="label text-emerald-900">{t('A POSSIBLE ENDING')}</div>
          <h2 className="mt-3 text-xl">{t('What if they’d played on?')}</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600" data-testid="virtual-status">{checkpoint?.virtualStatus === 'mate' ? t('{color} mates with {move} after {plies} simulated plies.', { color: t(checkpoint.virtualWinner === 'white' ? 'White' : 'Black'), move: checkpoint.virtual.at(-1)?.san ?? '', plies: checkpoint.virtual.length }) : checkpoint?.virtualStatus === 'limit' ? t('No checkmate within the 20-ply continuation.') : checkpoint?.virtualStatus === 'terminal' ? t('The position is terminal; no further finish to explore.') : t('After analysis, collect a virtual scrap if your side delivers mate.')}</p>
          {canRefine && <button className="secondary-button mt-3" disabled={busy} onClick={() => void start()}>{t('Look for another virtual finish')}</button>}
          {!!checkpoint?.virtual.length && <div className="mt-3 flex flex-wrap gap-1" aria-label={t('Virtual continuation')}>
            {checkpoint.virtual.map((move, i) => <button key={i} className={`move-button ${virtualPly === i + 1 ? 'selected' : ''}`} onClick={() => { setPlaying(false); setPly(game.moves.length); setVirtualPly(i + 1); }}>{move.san}</button>)}
          </div>}
        </div></div>}
      </>}
    </section>}
    {page === 'achievements' && <CollectionView profileMode={!!profile.user} games={collection.games} locale={locale} failed={collection.error} loading={collection.loading} busy={busy} onOpen={open} />}
    {page === 'profile' && <ProfileView profile={profile} locale={locale} busy={busy} onOpen={entry => open(entry.pgn)} />}
    {page === 'settings' && <SettingsView profile={profile} locale={locale} guestZone={guestZone} onGuestZone={zone => { saveTimeZone(zone); setGuestZone(zone); }} />}
    {page === 'help' &&     <section className="note-card my-10" aria-labelledby="help-title">
      <h1 id="help-title" className="text-3xl">{t('Help')}</h1>
      <h2 className="mt-6 text-xl">{t('Opening mastery')} · {t('Jobava London')} · {t("Queen's Pawn Game")}</h2>
      <p className="mt-3">{t('Each opening has separate White and Black masteries.')}</p>
      <p className="mt-3">{t('Named Caro-Kann branches have separate White and Black tracks. Every recognized branch earns independent progress.')}</p>
      <p className="mt-3">{t("Queen's Pawn Game covers every game starting with 1.d4. A game can progress both this mastery and Jobava London.")}</p>
      <p className="mt-3">{t("Queen's Pawn Game requires {multiplier}× the XP for each level.", { multiplier: OPENING_POLICY.level_threshold_multipliers['queens-pawn-game'] / OPENING_POLICY.level_threshold_multipliers['rapport-jobava'] })}</p>
      <p className="mt-3">{t('Precise early conversion earns a bonus. Rewards fade permanently as a large advantage is converted; swings do not reset them.')}</p>
      <p className="mt-3">{t('Longer time controls and your recorded thinking time increase opening XP. Wins double XP; losses halve it.')}</p>
      <p className="mt-3">{t('Grades require independent play. Each game can provide one S- or better mark, separately for White and Black.')}</p>
      <p className="mt-3">{t('Outside the book means outside our reference, not a claim that your move is new theory.')}</p>
      <p className="mt-4 text-stone-600">{t('Theory gives some XP; precise play outside the book earns more.')}</p>
      <h2 className="mt-6 text-xl">{t('Pawn vs Pawn')}</h2>
      <p className="mt-3">{t('Kings and pawns only, with pawns on both sides. From an even start, winning matters most.')}</p>
      <p className="mt-3">{t('Winning from equality matters most. Comebacks earn more; routine conversions earn less.')}</p>
      <p className="mt-3">{t('The endgame is scored once, from its first pawn-only position through the actual result, including promotions.')}</p>
    </section>
}
    {page === 'feedback' && <section className="page-section"><FeedbackBox locale={locale} /></section>}
    {page === 'missing' && <section className="empty-state page-section"><h1>{t('Page not found')}</h1><p>{t('Use the navigation to return to your games.')}</p></section>}
    {(page === 'home' || page === 'review') && <section className="import-section"><details className="note-card">
          <summary className="cursor-pointer text-sm font-semibold">{t('Import a PGN or try an example')}</summary>
          <div className="my-4 flex flex-wrap gap-2">
            <button className="secondary-button" disabled={busy} onClick={() => open(RECENT_GAME_PGN)}>{t('Your recent game (Black)')}</button>
            <button className="secondary-button" disabled={busy} onClick={() => open(SAMPLE_PGN)}>{t('Original rapid game')}</button>
            <button className="secondary-button" disabled={busy} onClick={() => open(MATE_PGN)}>{t('Mate example')}</button>
            <button className="secondary-button" disabled={busy} onClick={() => open(FORK_PGN)}>{t('Fork example')}</button>
            <button className="secondary-button" disabled={busy} onClick={() => open(SKEWER_PGN)}>{t('Skewer example')}</button>
            <button className="secondary-button" disabled={busy} onClick={() => open(JOBAVA_PGN)}>{t('Jobava example')}</button>
            <button className="secondary-button" disabled={busy} onClick={() => open(CARO_KANN_PGN)}>{t('Caro-Kann example')}</button>
            <button className="secondary-button" disabled={busy} onClick={() => open(PAWN_ENDGAME_PGN)}>{t('Pawn endgame example')}</button>
          </div>
          <label htmlFor="pgn" className="label">{t('PASTE ONE PGN')}</label>
          <textarea id="pgn" className="mt-2 h-36 w-full resize-y rounded-lg border border-stone-300 bg-white/60 p-3 font-mono text-xs" value={draft} onChange={event => setDraft(event.target.value)} disabled={busy} spellCheck={false} />
          <button className="secondary-button mt-2" disabled={busy} onClick={() => open(draft)}>{t('Load PGN')}</button>

        </details> {error && page === 'home' && <p className="error-state" role="alert">{error}</p>}</section>}
    <footer className="mt-9 flex flex-wrap justify-between gap-3 border-t border-stone-300 pt-5 text-xs leading-5 text-stone-500">
      <span>{t('Local prototype · Stockfish runs in your browser · mock profiles and imports use the local server.')}</span>
      <span><a href="/pieces/cburnett/NOTICE.txt">Colin M.L. Burnett · GPLv2+</a> · <a href="/engine/COPYING.txt">Stockfish GPLv3</a> · <a href="https://github.com/nmrugg/stockfish.js/tree/v19.0.1">{t('Engine source')}</a></span>
    </footer>

  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
