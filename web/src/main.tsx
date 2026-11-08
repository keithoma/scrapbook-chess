import { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { parseGame, SAMPLE_PGN, MATE_PGN, scoreLabel, type Frame } from './game';
import { DEPTH, lastCheckpoint, loadCheckpoint, type Checkpoint } from './storage';
import { prepareEngine, StockfishClient } from './stockfish';
import { analyzeGame } from './analysis';
import './style.css';

const glyphs = {
  white: { king: '♔', queen: '♕', rook: '♖', bishop: '♗', knight: '♘', pawn: '♙' },
  black: { king: '♚', queen: '♛', rook: '♜', bishop: '♝', knight: '♞', pawn: '♟' },
};
type Status = 'loading' | 'ready' | 'downloading' | 'analyzing' | 'virtual' | 'paused' | 'complete' | 'error';

function Board({ frame, flipped }: { frame: Frame; flipped: boolean }) {
  const squares = Array.from({ length: 64 }, (_, i) => flipped ? (i >> 3) * 8 + 7 - i % 8 : (7 - (i >> 3)) * 8 + i % 8);
  return <div className="board" role="img" aria-label={`Chess position, ${frame.turn} to move${frame.checkmate ? ', checkmate' : ''}`} data-testid="board" data-fen={frame.fen}>
    {squares.map((square, index) => {
      const piece = frame.pieces.find(p => p.square === square);
      const rank = square >> 3;
      const file = square % 8;
      return <div key={square} className={`square ${(rank + file) % 2 ? 'light' : 'dark'}`}>
        {index % 8 === 0 && <span className="rank">{rank + 1}</span>}
        {index >= 56 && <span className="file">{'abcdefgh'[file]}</span>}
        {piece && <span className={`piece ${piece.color}`} aria-hidden="true">{glyphs[piece.color][piece.role]}</span>}
      </div>;
    })}
  </div>;
}

function App() {
  const [game, setGame] = useState(() => parseGame(SAMPLE_PGN));
  const [draft, setDraft] = useState(SAMPLE_PGN);
  const [checkpoint, setCheckpoint] = useState<Checkpoint>();
  const [status, setStatus] = useState<Status>('loading');
  const [message, setMessage] = useState('Opening your local notebook…');
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
        const pgn = saved?.pgn ?? SAMPLE_PGN;
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

  const openGame = async (pgn: string) => {
    if (busy) return;
    const ticket = ++revision.current;
    try {
      const parsed = parseGame(pgn);
      setError(''); setStatus('loading');
      const saved = await loadCheckpoint(parsed.pgn);
      if (ticket !== revision.current) return;
      setGame(parsed); setDraft(parsed.pgn); setCheckpoint(saved); setPly(0); setVirtualPly(0);
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
      await prepareEngine(text => { if (ticket === revision.current) setMessage(text); });
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
      });
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
      <a className="brand" href="/">scrapbook<span>;</span> chess</a>
      <span className="label rounded-full border border-stone-300 px-3 py-1.5">FIELD NOTES / 001</span>
    </header>
    <section className="my-8 sm:my-12">
      <p className="label mb-3 text-emerald-800">THE BROWSER EXPERIMENT</p>
      <h1 className="max-w-3xl text-4xl leading-tight sm:text-6xl">Your games.<br /><em>A little more remarkable.</em></h1>
      <p className="mt-4 max-w-xl text-sm leading-7 text-stone-600">A real game from the original notebook. A chess engine running right here.
        Let’s see what your browser can do.</p>
    </section>

    <div className="grid items-start gap-7 lg:grid-cols-[1.1fr_1fr]">
      <section aria-label="Game replay" className="min-w-0">
        <div className="mb-3 flex items-center justify-between gap-2 text-sm">
          <div><strong>{game.white}</strong><span className="mx-2 text-stone-400">vs</span><strong>{game.black}</strong></div>
          <button className="text-button shrink-0" onClick={() => setFlipped(!flipped)}>Flip board</button>
        </div>
        <div className="board-frame"><Board frame={frame} flipped={flipped} /></div>
        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex gap-1">
            <button className="nav-button" aria-label="First position" onClick={() => go(0)}>↤</button>
            <button className="nav-button" aria-label="Previous move" onClick={() => go(ply - 1)}>←</button>
            <button className="nav-button" aria-label="Next move" onClick={() => go(ply + 1)}>→</button>
            <button className="nav-button" aria-label="Last position" onClick={() => go(game.moves.length)}>↦</button>
          </div>
          <span className="text-xs text-stone-600" data-testid="replay-position">{virtualPly ? `Virtual ply ${virtualPly}` : `Ply ${ply} / ${game.moves.length}`}</span>
        </div>
        <input aria-label="Replay position" className="mt-3 w-full accent-emerald-800" type="range" min={0} max={game.moves.length} value={ply} onChange={event => go(Number(event.target.value))} />
        <div className="mt-4 rounded-xl border border-stone-300 bg-white/40 p-4">
          <div className="label mb-2">{virtualPly ? 'ENGINE CONTINUATION · NOT PLAYED' : ply ? `PLAYED · ${game.moves[ply - 1].san}` : 'STARTING POSITION'}</div>
          <p className="text-sm text-stone-600">{virtualPly ? 'A separate simulated finish. Your original game is unchanged.' : result ? `Evaluation ${scoreLabel(result.played)} · best alternative ${result.bestMove} · ${(result.ms / 1000).toFixed(2)}s` : 'Move through the game. Analysis will appear here as it is saved.'}</p>
          <p className="mt-1 text-xs text-stone-500">Scores are from White’s perspective.</p>
        </div>
      </section>

      <section className="min-w-0 space-y-5">
        <div className="note-card">
          <div className="flex items-center justify-between gap-3"><span className="label text-emerald-800">ON YOUR DEVICE</span><span className={`status-dot ${busy ? 'working' : ''}`} /></div>
          <h2 className="mt-4 text-2xl">A moment of reflection.</h2>
          <p className="mt-2 min-h-12 text-sm leading-6 text-stone-600" role="status" data-testid="status" data-state={status}>{message}</p>
          <div className="mt-5 flex justify-between text-xs"><span>Moves saved</span><span data-testid="progress">{completed} / {game.moves.length}</span></div>
          <progress className="mt-2 h-1.5 w-full" value={completed} max={game.moves.length} aria-label="Analysis progress">{progress}%</progress>
          <div className="my-4 grid grid-cols-3 gap-2 border-y border-stone-200 py-4 text-center">
            <div><strong className="metric">{DEPTH}</strong><span className="metric-label">search depth</span></div>
            <div><strong className="metric">{(totalMs / 1000).toFixed(1)}s</strong><span className="metric-label">move analysis</span></div>
            <div><strong className="metric">{completed ? (totalMs / completed).toFixed(0) : '—'}</strong><span className="metric-label">ms / ply</span></div>
          </div>
          <button className="primary-button w-full" onClick={() => void start()} disabled={busy || !checkpoint || status === 'complete'}>
            {status === 'complete' ? 'Analysis complete ✓' : busy ? 'Working in your browser…' : completed ? 'Resume analysis' : 'Analyze this game'}
          </button>
          {['analyzing', 'virtual'].includes(status) && <button className="text-button mt-3 w-full" onClick={pause}>Pause analysis</button>}
          {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-900" role="alert">{error}</p>}
          <p className="mt-3 text-xs leading-5 text-stone-500">Full Stockfish 19 · one worker · 32 MB hash. First use downloads a large engine; later visits use its cache. Completed moves survive a reload.</p>
        </div>

        <div className="note-card !bg-[#e8ede3]">
          <div className="label text-emerald-900">A POSSIBLE ENDING</div>
          <h2 className="mt-3 text-xl">What if they’d played on?</h2>
          <p className="mt-2 text-sm leading-6 text-stone-600" data-testid="virtual-status">{checkpoint?.virtualStatus === 'mate' ? `${checkpoint.virtualWinner === 'white' ? 'White' : 'Black'} mates with ${checkpoint.virtual.at(-1)?.san} after ${checkpoint.virtual.length} simulated plies.` : checkpoint?.virtualStatus === 'limit' ? 'No checkmate within the 20-ply continuation.' : checkpoint?.virtualStatus === 'terminal' ? 'The position is terminal; no further finish to explore.' : 'After analysis, explore up to 20 additional engine plies. This proof does not grant scraps.'}</p>
          {!!checkpoint?.virtual.length && <div className="mt-3 flex flex-wrap gap-1" aria-label="Virtual continuation">
            {checkpoint.virtual.map((move, i) => <button key={i} className={`move-button ${virtualPly === i + 1 ? 'selected' : ''}`} onClick={() => { setPly(game.moves.length); setVirtualPly(i + 1); }}>{move.san}</button>)}
          </div>}
        </div>

        <details className="note-card">
          <summary className="cursor-pointer text-sm font-semibold">Open another page of the notebook</summary>
          <div className="my-4 flex flex-wrap gap-2">
            <button className="secondary-button" disabled={busy} onClick={() => void openGame(SAMPLE_PGN)}>Original rapid game</button>
            <button className="secondary-button" disabled={busy} onClick={() => void openGame(MATE_PGN)}>Mate example</button>
          </div>
          <label htmlFor="pgn" className="label">PASTE ONE PGN</label>
          <textarea id="pgn" className="mt-2 h-36 w-full resize-y rounded-lg border border-stone-300 bg-white/60 p-3 font-mono text-xs" value={draft} onChange={event => setDraft(event.target.value)} disabled={busy} spellCheck={false} />
          <button className="secondary-button mt-2" disabled={busy} onClick={() => void openGame(draft)}>Load PGN</button>
          <button className="text-button ml-4" disabled={!checkpoint} onClick={exportResults}>Export analysis JSON</button>
        </details>
      </section>
    </div>

    <section className="note-card mt-7">
      <div className="mb-4 flex items-center justify-between"><h2 className="text-xl">The game, move by move.</h2><span className="label">{game.result}</span></div>
      <div className="flex max-h-60 flex-wrap gap-1 overflow-y-auto" aria-label="Played moves" data-testid="played-moves">
        {game.moves.map(move => <button key={move.ply} onClick={() => go(move.ply)} className={`move-button ${ply === move.ply && !virtualPly ? 'selected' : ''}`} aria-label={`Ply ${move.ply}: ${move.san}`}>
          {move.ply % 2 === 1 && <span className="mr-1 text-stone-400">{Math.ceil(move.ply / 2)}.</span>}{move.san}
          {checkpoint?.results[move.ply - 1] && <span className="ml-1 text-emerald-700" aria-label="analyzed">·</span>}
        </button>)}
      </div>
    </section>
    <footer className="mt-9 flex flex-wrap justify-between gap-3 border-t border-stone-300 pt-5 text-xs leading-5 text-stone-500">
      <span>Local browser proof · analysis stays on this device · no account or game imports yet.</span>
      <span><a href="/engine/COPYING.txt">Stockfish GPLv3</a> · <a href="https://github.com/nmrugg/stockfish.js/tree/v19.0.1">Engine source</a></span>
    </footer>
  </main>;
}

createRoot(document.getElementById('root')!).render(<App />);
