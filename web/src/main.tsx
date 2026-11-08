import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseGame, SAMPLE_PGN, MATE_PGN, scoreLabel, type Frame } from './game';
import { RECENT_GAME_PGN } from './fixtures';
import { DEPTH, lastCheckpoint, loadCheckpoint, saveCheckpoint, type Checkpoint } from './storage';
import { prepareEngine, StockfishClient } from './stockfish';
import { analyzeGame } from './analysis';
import { useLocale, translate, type Locale, type Message, type Parameters } from './i18n';
import { FeedbackBox } from './support';
import { CollectionView, GameRewards, useLocalCollection, type Jump } from './achievements/collection-ui';
import { gameIdentity, projectCollection, virtualMate } from './achievements/collection';
import type { Color } from 'chessops/types';
import { knightForkCandidates, type KnightForkCandidate } from './tactics/knight-forks';
import { ForkInspector } from './tactics/fork-inspector';
import './style.css';

const glyphs = {
  white: { king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙' },
  black: { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' },
};
const recentGameId = gameIdentity(parseGame(RECENT_GAME_PGN));
type Status = 'loading' | 'ready' | 'downloading' | 'analyzing' | 'virtual' | 'paused' | 'complete' | 'error';

function Board({ frame, flipped, locale, fork }: { frame: Frame; flipped: boolean; locale: Locale; fork?: KnightForkCandidate }) {
  const t = (key: Message, parameters?: Parameters) => translate(locale, key, parameters);
  const squares = Array.from({ length: 64 }, (_, i) => flipped ? (i >> 3) * 8 + 7 - i % 8 : (7 - (i >> 3)) * 8 + i % 8);
  return <div className="board" role="img" aria-label={`${t('Chess position, {color} to move', { color: t(frame.turn === 'white' ? 'White' : 'Black') })}${frame.checkmate ? `, ${t('checkmate')}` : ''}`} data-testid="board" data-fen={frame.fen}>
    {squares.map((square, index) => {
      const piece = frame.pieces.find(p => p.square === square);
      const rank = square >> 3;
      const file = square % 8;
      const source = fork?.square === square;
      const target = fork?.targets.some(piece => piece.square === square);
      return <div key={square} className={`square ${(rank + file) % 2 ? 'light' : 'dark'} ${source ? 'fork-source' : target ? 'fork-target' : ''}`} data-fork-source={source || undefined} data-fork-target={target || undefined}>
        {index % 8 === 0 && <span className="rank">{rank + 1}</span>}
        {index >= 56 && <span className="file">{'abcdefgh'[file]}</span>}
        {piece && <span className={`piece ${piece.color}`} aria-hidden="true">{glyphs[piece.color][piece.role]}</span>}
      </div>;
    })}
  </div>;
}

function pageFor(path: string) { return path === '/help' ? 'help' : path === '/feedback' ? 'feedback' : path === '/collection' ? 'collection' : 'notebook'; }

function App() {
  const { locale, setLocale, t, number } = useLocale();
  const [page, setPage] = useState(() => pageFor(location.pathname));
  const navigate = (event: React.MouseEvent<HTMLAnchorElement>, destination: string) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); history.pushState(null, '', destination);
    setPage(pageFor(destination));
  };
  useEffect(() => {
    const pop = () => setPage(pageFor(location.pathname));
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  const [game, setGame] = useState(() => parseGame(RECENT_GAME_PGN));
  const forks = useMemo(() => knightForkCandidates(game), [game]);
  const collection = useLocalCollection();
  const [choice, setChoice] = useState<{ id: string; color: Color | '' }>();
  const gameId = gameIdentity(game);
  const savedGame = collection.games.find(record => record.id === gameId);
  const playerColor = choice?.id === gameId ? choice.color : savedGame?.color ?? (gameId === recentGameId ? 'black' : '');
  const ownedElsewhere = new Set(projectCollection(collection.games.filter(record => record.id !== gameId)).scraps.map(scrap => scrap.notation));
  const savedVirtual = savedGame?.color === playerColor && savedGame.events.some(event => event.kind === 'scrap' && event.mode === 'virtual');
  const [draft, setDraft] = useState(RECENT_GAME_PGN);
  const [checkpoint, setCheckpoint] = useState<Checkpoint>();
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState<Message>('Opening your local notebook…');
  const [messageParameters, setMessageParameters] = useState<Parameters>({});
  const [error, setError] = useState('');
  const [ply, setPly] = useState(0);
  const [virtualPly, setVirtualPly] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const runner = useRef<{ controller: AbortController; engine?: StockfishClient } | undefined>(undefined);
  const revision = useRef(0);
  const busy = ['loading', 'downloading', 'analyzing', 'virtual'].includes(status);

  useEffect(() => {
    let alive = true;
    const restore = async () => {
      try {
        const saved = await lastCheckpoint();
        const pgn = saved?.pgn ?? RECENT_GAME_PGN;
        const restored = saved ?? await loadCheckpoint(pgn);
        if (!alive) return;
        setGame(parseGame(pgn)); setDraft(pgn); setCheckpoint(restored);
        setStatus(restored.virtualStatus === 'pending' ? (restored.results.length ? 'paused' : 'ready') : 'complete');
        setMessage(restored.results.length ? 'Saved analysis restored. Pick up where you left off.' : 'Your browser is the analysis engine.');
      } catch (cause) {
        if (alive) { setStatus('error'); setError(`Could not open local checkpoints: ${String(cause)}`); }
      }
    };
    void restore();
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

  const openGame = async (pgn: string, jump?: Jump) => {
    if (busy) return;
    const ticket = ++revision.current;
    try {
      const parsed = parseGame(pgn);
      setError(''); setStatus('loading');
      const saved = await loadCheckpoint(parsed.pgn);
      await saveCheckpoint(saved);
      if (ticket !== revision.current) return;
      const replay = jump?.virtual ? { ...saved, virtual: jump.virtual, virtualStatus: 'mate' as const, virtualWinner: parseFen(jump.virtual.at(-1)!.fen).unwrap().turn === 'white' ? 'black' as const : 'white' as const } : saved;
      setGame(parsed); setDraft(parsed.pgn); setCheckpoint(replay); setPly(jump?.ply ?? 0); setVirtualPly(jump?.virtualPly ?? 0);
      setStatus(saved.virtualStatus === 'pending' ? (saved.results.length ? 'paused' : 'ready') : 'complete');
      setMessage(saved.results.length ? 'Saved analysis restored.' : 'Ready when you are.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus(checkpoint?.results.length ? 'paused' : 'ready');
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
      await analyzeGame(game, checkpoint, engine, active.controller.signal, (saved, stage) => {
        if (ticket !== revision.current) return;
        setCheckpoint(saved);
        setStatus(stage === 'virtual' ? 'virtual' : 'analyzing');
        setMessage(stage === 'virtual' ? 'Exploring a separate engine finish…' : 'Reading the game, one move at a time.');
      }, playerColor && !savedVirtual ? { color: playerColor, owned: ownedElsewhere } : undefined);
      active.controller.signal.throwIfAborted();
      setStatus('complete'); setMessage('Analysis complete. Every played move is preserved.');
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
    setPly(jump.ply); setVirtualPly(jump.virtualPly ?? 0);
  };
  const completed = checkpoint?.results.length ?? 0;
  const progress = Math.round(completed / game.moves.length * 100);
  const result = checkpoint?.results[ply - 1];
  let frame = game.frames[ply];
  if (virtualPly && checkpoint?.virtual[virtualPly - 1]) {
    const pos = Chess.fromSetup(parseFen(checkpoint.virtual[virtualPly - 1].fen).unwrap()).unwrap();
    frame = { fen: checkpoint.virtual[virtualPly - 1].fen, turn: pos.turn, checkmate: pos.isCheckmate(), pieces: [...pos.board].map(([square, piece]) => ({ square, ...piece })) };
  }
  const go = (target: number) => { setVirtualPly(0); setPly(Math.min(game.moves.length, Math.max(0, target))); };
  const totalMs = checkpoint?.results.reduce((sum, move) => sum + move.ms, 0) ?? 0;
  const exportResults = () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(checkpoint, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'scrapbook-analysis.json'; link.click(); URL.revokeObjectURL(url);
  };

  return <main className="mx-auto max-w-6xl px-4 py-7 sm:px-8 sm:py-12">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-300 pb-6">
      <a className="brand" href="/" onClick={event => navigate(event, '/')}>scrapbook<span>;</span> chess</a>
      <div className="flex flex-wrap items-center gap-3">
      <label className="text-xs">{t('Language')} <select aria-label={t('Language')} className="ml-1 rounded border border-stone-300 bg-transparent px-2 py-2" value={locale} onChange={event => setLocale(event.target.value as Locale)}><option value="en">English</option><option value="de">Deutsch</option></select></label>
      <span className="label rounded-full border border-stone-300 px-3 py-1.5">{t('FIELD NOTES / 001')}</span></div>
    </header>
    <nav aria-label={t('Main navigation')} className="mt-4 flex gap-5 text-sm">
      {([['/', 'Notebook'], ['/collection', 'Collection'], ['/help', 'Help'], ['/feedback', 'Feedback']] as const).map(([path, label]) => <a key={path} href={path} onClick={event => navigate(event, path)} aria-current={page === (path === '/' ? 'notebook' : path.slice(1)) ? 'page' : undefined} className="text-button">{t(label)}</a>)}
    </nav>
    <div hidden={page !== 'notebook'}>
    <section className="my-8 sm:my-12">
      <p className="label mb-3 text-emerald-800">{t('THE BROWSER EXPERIMENT')}</p>
      <h1 className="max-w-3xl text-4xl leading-tight sm:text-6xl">{t('Your games.')}<br /><em>{t('A little more remarkable.')}</em></h1>
      <p className="mt-4 max-w-xl text-sm leading-7 text-stone-600">{t('A real game from the original notebook. A chess engine running right here. Let’s see what your browser can do.')}</p>
    </section>

    <div className="grid items-start gap-7 lg:grid-cols-[1.1fr_1fr]">
      <section aria-label={t('Game replay')} className="min-w-0">
        <div className="mb-3 flex items-center justify-between gap-2 text-sm">
          <div><strong>{game.white}</strong><span className="mx-2 text-stone-400">{t('vs')}</span><strong>{game.black}</strong></div>
          <button className="text-button shrink-0" onClick={() => setFlipped(!flipped)}>{t('Flip board')}</button>
        </div>
        <div className="board-frame"><Board frame={frame} flipped={flipped} locale={locale} fork={virtualPly ? undefined : forks.find(fork => fork.ply === ply && fork.color === playerColor)} /></div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex gap-1">
            <button className="nav-button" aria-label={t('First position')} onClick={() => go(0)}>↤</button>
            <button className="nav-button" aria-label={t('Previous move')} onClick={() => go(ply - 1)}>←</button>
            <button className="nav-button" aria-label={t('Next move')} onClick={() => go(ply + 1)}>→</button>
            <button className="nav-button" aria-label={t('Last position')} onClick={() => go(game.moves.length)}>↦</button>
          </div>
          <span className="text-xs text-stone-600" data-testid="replay-position">{virtualPly ? t('Virtual ply {ply}', { ply: virtualPly }) : t('Ply {ply} / {total}', { ply, total: game.moves.length })}</span>
        </div>
        <input aria-label={t('Replay position')} className="mt-3 w-full accent-emerald-800" type="range" min={0} max={game.moves.length} value={ply} onChange={event => go(Number(event.target.value))} />
        <div className="mt-4 rounded-xl border border-stone-300 bg-white/40 p-4">
          <div className="label mb-2">{virtualPly ? t('ENGINE CONTINUATION · NOT PLAYED') : ply ? t('PLAYED · {move}', { move: game.moves[ply - 1].san }) : t('STARTING POSITION')}</div>
          <p className="text-sm text-stone-600">{virtualPly ? t('A separate simulated finish. Your original game is unchanged.') : result ? t('Evaluation {score} · best alternative {move} · {seconds}s', { score: scoreLabel(result.played), move: result.bestMove, seconds: number(result.ms / 1000, 2) }) : t('Move through the game. Analysis will appear here as it is saved.')}</p>
          <p className="mt-1 text-xs text-stone-500">{t('Scores are from White’s perspective.')}</p>
        </div>
      </section>

      <section className="min-w-0 space-y-5">
        <GameRewards key={gameId} game={game} checkpoint={checkpoint} color={playerColor} onColor={color => setChoice({ id: gameId, color })} games={collection.games} onSaved={collection.setGames} ply={ply} virtualPly={virtualPly} onJump={jumpTo} locale={locale} />
        <ForkInspector candidates={forks} color={playerColor} checkpoint={checkpoint} ply={ply} virtual={!!virtualPly} onJump={go} locale={locale} />
        <div className="note-card">
          <div className="flex items-center justify-between gap-3"><span className="label text-emerald-800">{t('ON YOUR DEVICE')}</span><span className={`status-dot ${busy ? 'working' : ''}`} /></div>
          <h2 className="mt-4 text-2xl">{t('A moment of reflection.')}</h2>
          <p className="mt-2 min-h-12 text-sm leading-6 text-stone-600" role="status" data-testid="status" data-state={status}>{t(message, messageParameters)}</p>
          <div className="mt-5 flex justify-between text-xs"><span>{t('Moves saved')}</span><span data-testid="progress">{completed} / {game.moves.length}</span></div>
          <progress className="mt-2 h-1.5 w-full" value={completed} max={game.moves.length} aria-label={t('Analysis progress')}>{progress}%</progress>
          <div className="my-4 grid grid-cols-3 gap-2 border-y border-stone-200 py-4 text-center">
            <div><strong className="metric">{DEPTH}</strong><span className="metric-label">{t('search depth')}</span></div>
            <div><strong className="metric">{number(totalMs / 1000, 1)}s</strong><span className="metric-label">{t('move analysis')}</span></div>
            <div><strong className="metric">{completed ? number(totalMs / completed) : '—'}</strong><span className="metric-label">{t('ms / ply')}</span></div>
          </div>
          <button className="primary-button w-full" onClick={() => void start()} disabled={busy || !checkpoint || status === 'complete'}>
            {status === 'complete' ? t('Analysis complete ✓') : busy ? t('Working in your browser…') : completed ? t('Resume analysis') : t('Analyze this game')}
          </button>
          {['analyzing', 'virtual'].includes(status) && <button className="text-button mt-3 w-full" onClick={pause}>{t('Pause analysis')}</button>}
          {error && <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-900" role="alert">{t('An error occurred.')}<details className="mt-2"><summary>{t('Technical details')}</summary>{error}</details></div>}
          <p className="mt-3 text-xs leading-5 text-stone-500">{t('Full Stockfish 19 · one worker · 32 MB hash. First use downloads a large engine; later visits use its cache. Completed moves survive a reload.')}</p>
        </div>

        <div className="note-card !bg-[#e8ede3]">
          <div className="label text-emerald-900">{t('A POSSIBLE ENDING')}</div>
          <h2 className="mt-3 text-xl">{t('What if they’d played on?')}</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600" data-testid="virtual-status">{checkpoint?.virtualStatus === 'mate' ? t('{color} mates with {move} after {plies} simulated plies.', { color: t(checkpoint.virtualWinner === 'white' ? 'White' : 'Black'), move: checkpoint.virtual.at(-1)?.san ?? '', plies: checkpoint.virtual.length }) : checkpoint?.virtualStatus === 'limit' ? t('No checkmate within the 20-ply continuation.') : checkpoint?.virtualStatus === 'terminal' ? t('The position is terminal; no further finish to explore.') : t('After analysis, collect a virtual scrap if your side delivers mate.')}</p>
          {canRefine && <button className="secondary-button mt-3" disabled={busy} onClick={() => void start()}>{t('Look for another virtual finish')}</button>}
          {!!checkpoint?.virtual.length && <div className="mt-3 flex flex-wrap gap-1" aria-label={t('Virtual continuation')}>
            {checkpoint.virtual.map((move, i) => <button key={i} className={`move-button ${virtualPly === i + 1 ? 'selected' : ''}`} onClick={() => { setPly(game.moves.length); setVirtualPly(i + 1); }}>{move.san}</button>)}
          </div>}
        </div>

        <details className="note-card">
          <summary className="cursor-pointer text-sm font-semibold">{t('Open another page of the notebook')}</summary>
          <div className="my-4 flex flex-wrap gap-2">
            <button className="secondary-button" disabled={busy} onClick={() => void openGame(RECENT_GAME_PGN)}>{t('Your recent game (Black)')}</button>
            <button className="secondary-button" disabled={busy} onClick={() => void openGame(SAMPLE_PGN)}>{t('Original rapid game')}</button>
            <button className="secondary-button" disabled={busy} onClick={() => void openGame(MATE_PGN)}>{t('Mate example')}</button>
          </div>
          <label htmlFor="pgn" className="label">{t('PASTE ONE PGN')}</label>
          <textarea id="pgn" className="mt-2 h-36 w-full resize-y rounded-lg border border-stone-300 bg-white/60 p-3 font-mono text-xs" value={draft} onChange={event => setDraft(event.target.value)} disabled={busy} spellCheck={false} />
          <button className="secondary-button mt-2" disabled={busy} onClick={() => void openGame(draft)}>{t('Load PGN')}</button>
          <button className="text-button ml-4" disabled={!checkpoint} onClick={exportResults}>{t('Export analysis JSON')}</button>
        </details>
      </section>
    </div>

    <section className="note-card mt-7">
      <div className="mb-4 flex items-center justify-between"><h2 className="text-xl">{t('The game, move by move.')}</h2><span className="label">{game.result}</span></div>
      <div className="flex max-h-60 flex-wrap gap-1 overflow-y-auto" aria-label={t('Played moves')} data-testid="played-moves">
        {game.moves.map(move => <button key={move.ply} onClick={() => go(move.ply)} className={`move-button ${ply === move.ply && !virtualPly ? 'selected' : ''}`} aria-label={t('Ply {ply}: {move}', { ply: move.ply, move: move.san })}>
          {move.ply % 2 === 1 && <span className="mr-1 text-stone-400">{Math.ceil(move.ply / 2)}.</span>}{move.san}
          {checkpoint?.results[move.ply - 1] && <span className="ml-1 text-emerald-700" aria-label={t('analyzed')}>·</span>}
        </button>)}
      </div>
    </section>
    </div>
    <div hidden={page !== 'collection'}><CollectionView games={collection.games} locale={locale} failed={collection.error} busy={busy} onOpen={(pgn, jump) => { void openGame(pgn, jump); history.pushState(null, '', '/'); setPage('notebook'); }} /></div>
    <section hidden={page !== 'help'} className="note-card my-10" aria-labelledby="help-title">
      <h1 id="help-title" className="text-3xl">{t('Help')}</h1>
      <p className="mt-4 text-stone-600">{t('There are no help articles yet.')}</p>
    </section>
    <section hidden={page !== 'feedback'} className="my-10"><FeedbackBox locale={locale} /></section>
    <footer className="mt-9 flex flex-wrap justify-between gap-3 border-t border-stone-300 pt-5 text-xs leading-5 text-stone-500">
      <span>{t('Local browser proof · analysis stays on this device · no account or game imports yet.')}</span>
      <span><a href="/engine/COPYING.txt">Stockfish GPLv3</a> · <a href="https://github.com/nmrugg/stockfish.js/tree/v19.0.1">{t('Engine source')}</a></span>
    </footer>
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
