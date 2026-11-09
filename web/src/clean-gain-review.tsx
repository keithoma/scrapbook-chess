import { useEffect, useRef, useState } from 'react';
import { Chess } from 'chessops/chess';
import { parseFen, makeFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';
import { makeSanAndPlay } from 'chessops/san';
import { Board } from './board';
import { parseGame, type Frame } from './game';
import { prepareEngine, StockfishClient } from './stockfish';
import { ANALYSIS_VERSION } from './storage';
import { analyzeCleanGain } from './clean-gain-analysis';
import { assessCleanGain, assessCleanGainAttempt, CLEAN_GAIN_RULE, materialLine, type CleanGainEvidence, type CleanGainSample } from './chess/clean-gain';
import { CLEAN_REVIEW_URL, cleanReviewFilename, parseCleanGainReview, snapshotCleanBook, type CleanGainReview } from './chess/clean-gain-review';
import { openingBook } from './openings/book';
import { CLEAN_GAIN_EXAMPLES } from './fixtures/clean-gain-examples';
import type { Locale } from './i18n';

const lookup = openingBook.lookup.bind(openingBook);
const score = (value?: number) => value === undefined ? '—' : `${value >= 0 ? '+' : ''}${(value / 100).toFixed(2)}`;
const reason: Record<string, string> = {
  settled: 'The evaluation and retained material agree across consecutive search depths.',
  book: 'Book line excluded. The opponent’s losing move needs at least 25 games and below 30% wins to qualify as a trap.',
  compensation: 'The evaluation gain is below the required value.',
  'capture-quality': 'The capture gives up too much of the available advantage.',
  'material-returned': 'The continuation returns too much material.',
  'unsettled-line': 'A continuation still ends in tactical activity.',
  'search-disagreement': 'The search depths do not yet agree.',
  'analysis-budget': 'The processing budget ended before this capture could be confirmed. Continue material analysis or run this capture here.',
  'no-concession-baseline': 'No preceding opponent move establishes a new net material gain. Material already hanging in the starting position cannot prove an evaluation gain.',
};

function continuation(fen: string, line: string[]) {
  const position = Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
  const frames: Frame[] = [];
  const moves: string[] = [];
  const snapshot = () => frames.push({ fen: makeFen(position.toSetup()), turn: position.turn,
    checkmate: position.isCheckmate(), pieces: [...position.board].map(([square, piece]) => ({ square, ...piece })) });
  snapshot();
  for (const uci of line) {
    const move = parseUci(uci);
    if (!move || !position.isLegal(move)) break;
    moves.push(makeSanAndPlay(position, move)); snapshot();
  }
  return { frames, moves };
}

export function CleanGainReviewBoard({ locale, currentPgn }: { locale: Locale; currentPgn: string }) {
  const [draft, setDraft] = useState<string>(CLEAN_GAIN_EXAMPLES[0].pgn);
  const [game, setGame] = useState(() => parseGame(CLEAN_GAIN_EXAMPLES[0].pgn));
  const [capturePly, setCapturePly] = useState(2);
  const [evidence, setEvidence] = useState<CleanGainEvidence>();
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('Choose a capture, then run the detector.');
  const [error, setError] = useState('');
  const [expected, setExpected] = useState<CleanGainReview['expected']>();
  const [note, setNote] = useState('');
  const [attemptIndex, setAttemptIndex] = useState(0);
  const [sampleIndex, setSampleIndex] = useState(0);
  const [lineKind, setLineKind] = useState<keyof Pick<CleanGainSample, 'before' | 'conceded' | 'captureBest' | 'after'>>('after');
  const [engineLine, setEngineLine] = useState(false);
  const [boardPly, setBoardPly] = useState(2);
  const [flipped, setFlipped] = useState(false);
  const active = useRef<{ controller: AbortController; engine?: StockfishClient }>(undefined);
  const restoreId = useRef(0);
  useEffect(() => () => { active.current?.controller.abort(); active.current?.engine?.terminate(); }, []);

  function load(pgn: string) {
    try {
      const parsed = parseGame(pgn);
      const first = parsed.moves.find(move => move.captured);
      setGame(parsed); setDraft(pgn); setCapturePly(first?.ply ?? 0); setBoardPly(first?.ply ?? 0);
      setEvidence(undefined); setExpected(undefined); setNote(''); setError(''); setEngineLine(false);
    } catch (cause) { setError(String(cause)); }
  }
  useEffect(() => {
    setEvidence(undefined); setExpected(undefined); setNote(''); setEngineLine(false); setBoardPly(capturePly);
    if (!import.meta.env.DEV || !capturePly) return;
    const controller = new AbortController();
    const id = ++restoreId.current;
    void (async () => {
      try {
        const filename = await cleanReviewFilename({ pgn: game.pgn, capturePly });
        const response = await fetch(`${CLEAN_REVIEW_URL}/${filename}`, { signal: controller.signal });
        if (response.status === 404) return;
        if (!response.ok) throw new Error('Could not load the saved judgment.');
        const review = parseCleanGainReview(await response.json());
        if (id !== restoreId.current || controller.signal.aborted) return;
        setExpected(review.expected); setNote(review.note); setEvidence(review.evidence);
        setMessage('Saved judgment and engine evidence restored.');
      } catch (cause) { if (!controller.signal.aborted) setError(String(cause)); }
    })();
    return () => controller.abort();
  }, [game, capturePly]);

  async function run() {
    const run = { controller: new AbortController(), engine: undefined as StockfishClient | undefined };
    active.current = run;
    ++restoreId.current;
    setBusy(true); setError(''); setEvidence(undefined); setAttemptIndex(0); setSampleIndex(0);
    try {
      await prepareEngine(() => setMessage('Preparing Stockfish…'));
      run.controller.signal.throwIfAborted();
      run.engine = new StockfishClient(); await run.engine.init();
      const result = await analyzeCleanGain(game, capturePly, run.engine, run.controller.signal, {
        onProgress: next => {
          setEvidence(next); setAttemptIndex(next.attempts.length - 1);
          setSampleIndex(Math.max(0, (next.attempts.at(-1)?.samples.length ?? 1) - 1));
          setMessage(`Checking baseline at ply ${next.attempts.at(-1)?.concessionPly}; depth ${next.attempts.at(-1)?.samples.at(-1)?.depth ?? 'book gate'}.`);
        },
      });
      setEvidence(result); setMessage('Detector complete. Inspect the lines and save your independent judgment.');
    } catch (cause) {
      if (run.controller.signal.aborted) setMessage('Stopped. Run again to complete the evidence.');
      else setError(String(cause));
    } finally {
      run.engine?.terminate(); if (active.current === run) active.current = undefined; setBusy(false);
    }
  }
  function fixture(choice: CleanGainReview['expected']): CleanGainReview {
    return { schemaVersion: 1, pgn: game.pgn, capturePly, expected: choice, note, analysisVersion: ANALYSIS_VERSION,
      evidence: evidence!, book: snapshotCleanBook(game, capturePly, lookup) };
  }
  async function save(choice: CleanGainReview['expected']) {
    setSaving(true); setError('');
    try {
      const response = await fetch(CLEAN_REVIEW_URL, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(fixture(choice)) });
      if (!response.ok) throw new Error('Could not save the judgment. Try again.');
      setExpected(choice); setMessage(`Saved: ${choice === 'clean' ? 'should count' : 'should not count'}. This judgment will run as a regression test.`);
    } catch (cause) { setError(String(cause)); }
    finally { setSaving(false); }
  }
  const assessment = assessCleanGain(game, evidence, lookup);
  const attempt = evidence?.attempts[Math.min(attemptIndex, evidence.attempts.length - 1)];
  const sample = attempt?.samples[Math.min(sampleIndex, attempt.samples.length - 1)];
  const board = lineKind === 'before' ? (attempt?.concessionPly ?? 1) - 1 : lineKind === 'conceded' ? attempt?.concessionPly ?? 0
    : lineKind === 'captureBest' ? capturePly - 1 : capturePly;
  const projected = sample ? continuation(game.frames[board].fen, sample[lineKind].pv ?? []) : undefined;
  const frames = engineLine && projected ? projected.frames : game.frames;
  const position = Math.max(0, Math.min(boardPly, frames.length - 1));
  const details = attempt ? assessCleanGainAttempt(game, attempt, lookup) : assessment;

  return <section className="page-section" data-testid="clean-gain-lab">
    <div className="page-heading"><div><p className="eyebrow">Rule review</p><h1>Clean material testing</h1>
      <p>Inspect actual captures and the engine evidence. Your judgment is independent of the detector.</p></div></div>
    <section className="note-card mt-4">
      <label>Example <select aria-label="Material example" disabled={busy || saving} defaultValue="Loose pawn"
        onChange={event => load(CLEAN_GAIN_EXAMPLES.find(example => example.name === event.target.value)!.pgn)}>
        {CLEAN_GAIN_EXAMPLES.map(example => <option key={example.name}>{example.name}</option>)}
      </select></label>
      <details className="mt-3"><summary>Test your own PGN</summary>
        <textarea className="mt-2 w-full" aria-label="Material test PGN" rows={6} value={draft} disabled={busy || saving} onChange={event => setDraft(event.target.value)} />
        <div className="button-row"><button className="secondary-button" disabled={busy || saving} onClick={() => load(draft)}>Load PGN</button>
          <button className="secondary-button" disabled={busy || saving} onClick={() => load(currentPgn)}>Use current review game</button></div>
      </details>
      <div className="button-row mt-3"><label>Capture <select aria-label="Material capture" value={capturePly} disabled={busy || saving} onChange={event => setCapturePly(Number(event.target.value))}>
        {!game.moves.some(move => move.captured) && <option value={0}>No captures</option>}
        {game.moves.filter(move => move.captured).map(move => <option key={move.ply} value={move.ply}>Ply {move.ply}: {move.color} {move.san} ({move.captured})</option>)}
      </select></label><button className="primary-button" disabled={busy || saving || !capturePly} onClick={() => void run()}>Run detector</button>
        {busy && <button className="secondary-button" onClick={() => { active.current?.controller.abort(); active.current?.engine?.terminate(); }}>Stop detector</button>}</div>
      <p role="status" className="mt-3" data-testid="material-status" data-busy={busy}>{message}</p>
      {error && <p role="alert">{error}</p>}
    </section>
    <div className="review-grid mt-4">
      <section className="board-column">
        <div className="button-row mb-3"><button className="secondary-button" onClick={() => { setEngineLine(false); setBoardPly(capturePly); }}>Actual game</button>
          <button className="secondary-button" disabled={!sample} onClick={() => { setEngineLine(true); setBoardPly(0); }}>Engine continuation</button>
          <button className="text-button" onClick={() => setFlipped(value => !value)}>Flip board</button></div>
        <p className="label mb-2">{engineLine ? 'ENGINE CONTINUATION · NOT PLAYED' : 'ACTUAL GAME'}</p>
        <div className="board-frame"><Board frame={frames[position]} flipped={flipped} locale={locale} /></div>
        <div className="button-row mt-3"><button className="nav-button" aria-label="Material first position" onClick={() => setBoardPly(0)}>↤</button>
          <button className="nav-button" aria-label="Material previous move" disabled={!position} onClick={() => setBoardPly(position - 1)}>←</button>
          <button className="nav-button" aria-label="Material next move" disabled={position === frames.length - 1} onClick={() => setBoardPly(position + 1)}>→</button>
          <button className="nav-button" aria-label="Material last position" onClick={() => setBoardPly(frames.length - 1)}>↦</button>
          <span data-testid="material-board-position">{position} / {frames.length - 1}</span></div>
        <input className="mt-3 w-full" aria-label="Material replay position" type="range" min={0} max={frames.length - 1} value={position} onChange={event => setBoardPly(Number(event.target.value))} />
        <div className="flex flex-wrap gap-1 mt-3" data-testid="material-line-moves">
          <button className="text-button" onClick={() => setBoardPly(0)}>Start</button>
          {(engineLine && projected ? projected.moves : game.moves.map(move => move.san)).map((san, i) =>
            <button key={i} className="secondary-button" aria-current={position === i + 1 ? 'step' : undefined} onClick={() => setBoardPly(i + 1)}>{i + 1}. {san}</button>)}
        </div>
      </section>
      <div className="review-side">
        <section className="note-card" data-testid="material-verdict" data-status={assessment.status}>
          <h2>{assessment.status === 'qualified' ? 'Counts as clean material' : assessment.status === 'rejected' ? 'Does not count' : 'Unconfirmed'}</h2>
          <p className="mt-2">{reason[assessment.reason] ?? assessment.reason}</p>
          <p className="mt-2">Required evaluation gain: {score(assessment.requiredCp ?? (game.moves[capturePly - 1]?.captured ? undefined : 80))}.</p>
          <p>Minimum evaluation gain: {score(assessment.evaluationGainCp)} · retained material: {score(assessment.materialGainCp)}.</p>
          <p className="mt-2 text-sm">Rule: {CLEAN_GAIN_RULE.version}. Later played blunders do not revoke a confirmed gain.</p>
        </section>
        {!!evidence?.attempts.length && <section className="note-card">
          <h2>Inspect the evidence</h2>
          <label>Opponent move <select aria-label="Material baseline" value={attemptIndex} onChange={event => { setAttemptIndex(Number(event.target.value)); setSampleIndex(0); }}>
            {evidence.attempts.map((attempt, i) => <option key={i} value={i}>Ply {attempt.concessionPly}: {game.moves[attempt.concessionPly - 1].san}</option>)}
          </select></label>
          <p className="mt-2">{reason[details.reason] ?? details.reason}</p>
          {!!attempt?.samples.length && <>
            <label>Search depth <select aria-label="Material search depth" value={sampleIndex} onChange={event => { setSampleIndex(Number(event.target.value)); setBoardPly(0); }}>
              {attempt.samples.map((sample, i) => <option key={i} value={i}>{sample.depth}</option>)}
            </select></label>
            {sample && <p className="mt-2 text-sm">Selected line evaluation: {sample[lineKind].score.type === 'cp'
              ? score(sample[lineKind].score.value * (game.moves[capturePly - 1].color === 'white' ? 1 : -1)) : 'Mate score'}.</p>}
            <label className="block mt-2">Continuation <select aria-label="Material engine line" value={lineKind} onChange={event => { setLineKind(event.target.value as typeof lineKind); setEngineLine(true); setBoardPly(0); }}>
              <option value="before">Before opponent’s move</option><option value="conceded">After opponent’s move</option>
              <option value="captureBest">Before capture</option><option value="after">After capture</option>
            </select></label>
            <table className="mt-3 w-full text-sm"><thead><tr><th>Depth</th><th>Gain after capture</th><th>Quiet tail</th></tr></thead><tbody>
              {attempt.samples.map(sample => <tr key={sample.depth}><td>{sample.depth}</td>
                <td>{score((game.moves[capturePly - 1].color === 'white' ? 1 : -1) * (sample.after.score.value - sample.before.score.value))}</td>
                <td>{materialLine(game.frames[capturePly].fen, sample.after, game.moves[capturePly - 1].color, 0)?.quietPlies ?? '—'} plies</td></tr>)}
            </tbody></table>
            <p className="mt-2 text-sm">Scores are from the capturing player’s perspective. Quiet tails and matching depths are evidence, not proof.</p>
          </>}
        </section>}
        <section className="note-card" data-testid="material-judgment"><h2>Your judgment</h2>
          <label className="block mt-2">Review note<textarea aria-label="Material review note" className="w-full mt-1" value={note} onChange={event => setNote(event.target.value)} maxLength={2000} /></label>
          {import.meta.env.DEV ? <div className="button-row mt-2">
            <button className="secondary-button" disabled={busy || saving || !evidence} aria-pressed={expected === 'clean'} onClick={() => void save('clean')}>Should count</button>
            <button className="secondary-button" disabled={busy || saving || !evidence} aria-pressed={expected === 'not-clean'} onClick={() => void save('not-clean')}>Should not count</button>
          </div> : <p>Run the development server to save judgments as regression tests.</p>}
          {expected && <p className="mt-2">Saved judgment: {expected === 'clean' ? 'should count' : 'should not count'}.</p>}
          <p className="mt-2 text-sm">Saving records your expectation, PGN, book evidence, and engine lines. A disagreement will fail the regression test.</p>
        </section>
      </div>
    </div>
  </section>;
}
