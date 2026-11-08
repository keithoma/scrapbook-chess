import type { Message, Parameters } from './i18n';
import { Chess } from 'chessops/chess';
import { parseFen } from 'chessops/fen';
import { legalMoveCount } from './chess/legal-moves';

export interface Score { type: 'cp' | 'mate'; value: number }
export interface EnginePick { uci: string; score: Score; depth: number }
export interface SearchResult { score: Score; bestMove: string; depth: number; topMoves: EnginePick[] }
export const TOP_MOVE_COUNT = 3;
const CACHE = 'scrapbook-stockfish-19.0.1-full-v1';

export async function prepareEngine(onProgress: (progress: { message: Message; parameters?: Parameters }) => void): Promise<void> {
  if (!('WebAssembly' in window) || !('Worker' in window)) {
    throw new Error('This browser does not support the WebAssembly worker required for analysis.');
  }
  if (!('serviceWorker' in navigator) || !('caches' in window)) {
    onProgress({ message: 'Loading engine without persistent download cache…' });
    return;
  }
  await navigator.serviceWorker.register('/engine-cache.js');
  await navigator.serviceWorker.ready;
  if (!navigator.serviceWorker.controller) {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Engine cache did not become ready. Reload and try again.')), 15000);
      navigator.serviceWorker.addEventListener('controllerchange', () => { clearTimeout(timer); resolve(); }, { once: true });
    });
  }
  const cache = await caches.open(CACHE);
  const url = '/engine/stockfish-19-single.wasm';
  if (await cache.match(url)) { onProgress({ message: 'Engine ready from browser cache.' }); return; }
  onProgress({ message: 'Downloading full Stockfish engine…' });
  const response = await fetch(url, { headers: { 'x-scrapbook-download': '1' } });
  if (!response.ok || !response.body) throw new Error(`Engine download failed (${response.status}).`);
  let received = 0;
  const meter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.byteLength;
      onProgress({ message: 'Downloading engine · {received} MB', parameters: { received: received / 1048576 } });
      controller.enqueue(chunk);
    },
  });
  await cache.put(url, new Response(response.body.pipeThrough(meter), { headers: response.headers }));
}

export function parseScore(line: string, turn: 'white' | 'black'): Score | undefined {
  if (/\b(?:lowerbound|upperbound)\b/.test(line)) return undefined;
  const match = line.match(/\bscore (cp|mate) (-?\d+)/);
  if (!match) return undefined;
  return { type: match[1] as Score['type'], value: Number(match[2]) * (turn === 'white' ? 1 : -1) };
}

export function parseVariation(line: string, turn: 'white' | 'black'): (EnginePick & { rank: number }) | undefined {
  if (!line.startsWith('info ')) return;
  const score = parseScore(line, turn);
  const depth = Number(line.match(/\bdepth (\d+)/)?.[1] ?? 0);
  const rank = Number(line.match(/\bmultipv (\d+)/)?.[1] ?? 1);
  const uci = line.match(/\bpv ([a-h][1-8][a-h][1-8][qrbn]?)(?:\s|$)/)?.[1];
  if (!score || !uci || depth < 1 || rank < 1) return;
  return { uci, score, depth, rank };
}

export class StockfishClient {
  private worker: Worker;
  private listeners = new Set<(line: string) => void>();
  private failures = new Set<(error: Error) => void>();
  private stopped = false;
  constructor() {
    this.worker = new Worker('/engine/stockfish-19-single.js');
    this.worker.onmessage = event => {
      for (const line of String(event.data).split('\n')) for (const listener of [...this.listeners]) listener(line);
    };
    this.worker.onerror = event => {
      const error = new Error(event.message || 'Stockfish worker failed to load.');
      for (const fail of [...this.failures]) fail(error);
    };
  }
  private waitFor(predicate: (line: string) => boolean, command: string, timeout = 300000): Promise<string> {
    if (this.stopped) return Promise.reject(new DOMException('Analysis paused.', 'AbortError'));
    return new Promise((resolve, reject) => {
      const cleanup = () => { clearTimeout(timer); this.listeners.delete(listener); this.failures.delete(fail); };
      const fail = (error: Error) => { cleanup(); reject(error); };
      const listener = (line: string) => { if (predicate(line)) { cleanup(); resolve(line); } };
      const timer = setTimeout(() => fail(new Error('Engine stopped responding. Saved moves are safe; resume to retry.')), timeout);
      this.listeners.add(listener);
      this.failures.add(fail);
      this.worker.postMessage(command);
    });
  }
  async init(): Promise<void> {
    await this.waitFor(line => line === 'uciok', 'uci');
    this.worker.postMessage('setoption name Hash value 32');
    this.worker.postMessage('setoption name Threads value 1');
    this.worker.postMessage('ucinewgame');
    await this.waitFor(line => line === 'readyok', 'isready');
  }
  async search(fen: string, depth: number, turn: 'white' | 'black', rootMove?: string, multiPv = 1): Promise<SearchResult> {
    if (!Number.isInteger(multiPv) || multiPv < 1 || multiPv > TOP_MOVE_COUNT) throw new Error('Invalid engine choice count.');
    const position = Chess.fromSetup(parseFen(fen).unwrap()).unwrap();
    const expected = Math.min(multiPv, rootMove ? new Set(rootMove.split(/\s+/)).size : legalMoveCount(position));
    this.worker.postMessage(`setoption name MultiPV value ${multiPv}`);
    this.worker.postMessage(`position fen ${fen}`);
    const variations = new Map<number, Map<number, EnginePick>>();
    const collect = (line: string) => {
      const parsed = parseVariation(line, turn);
      if (!parsed || parsed.rank > expected) return;
      const atDepth = variations.get(parsed.depth) ?? new Map<number, EnginePick>();
      atDepth.set(parsed.rank, { uci: parsed.uci, score: parsed.score, depth: parsed.depth });
      variations.set(parsed.depth, atDepth);
    };
    this.listeners.add(collect);
    try {
      const done = await this.waitFor(line => line.startsWith('bestmove '),
        `go depth ${depth}${rootMove ? ` searchmoves ${rootMove}` : ''}`);
      const bestMove = done.split(' ')[1];
      const completed = [...variations.entries()].sort(([a], [b]) => b - a).find(([, picks]) =>
        expected > 0 && Array.from({ length: expected }, (_, i) => picks.has(i + 1)).every(Boolean) &&
        new Set([...picks.values()].map(pick => pick.uci)).size === expected);
      const topMoves = completed ? Array.from({ length: expected }, (_, i) => completed[1].get(i + 1)!) : [];
      if (!topMoves.length || topMoves[0].uci !== bestMove || topMoves[0].depth < depth)
        throw new Error('Engine returned no complete evaluated choices at the requested depth.');
      return { score: topMoves[0].score, bestMove, depth: topMoves[0].depth, topMoves };
    } finally { this.listeners.delete(collect); }
  }
  terminate(): void {
    this.stopped = true;
    for (const fail of [...this.failures]) fail(new DOMException('Analysis paused.', 'AbortError'));
    this.worker.terminate();
  }
}
