import type { Message, Parameters } from './i18n';

export interface Score { type: 'cp' | 'mate'; value: number }
interface SearchResult { score: Score; bestMove: string; depth: number }
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
  async search(fen: string, depth: number, turn: 'white' | 'black', rootMove?: string): Promise<SearchResult> {
    this.worker.postMessage(`position fen ${fen}`);
    let score: Score | undefined;
    let reachedDepth = 0;
    const collect = (line: string) => {
      const parsed = parseScore(line, turn);
      if (parsed) {
        score = parsed;
        reachedDepth = Number(line.match(/\bdepth (\d+)/)?.[1] ?? 0);
      }
    };
    this.listeners.add(collect);
    try {
      const done = await this.waitFor(line => line.startsWith('bestmove '),
        `go depth ${depth}${rootMove ? ` searchmoves ${rootMove}` : ''}`);
      const bestMove = done.split(' ')[1];
      if (!score || !bestMove || bestMove === '(none)' || bestMove === '0000') {
        throw new Error('Engine returned no evaluated legal move.');
      }
      return { score, bestMove, depth: reachedDepth };
    } finally { this.listeners.delete(collect); }
  }
  terminate(): void {
    this.stopped = true;
    for (const fail of [...this.failures]) fail(new DOMException('Analysis paused.', 'AbortError'));
    this.worker.terminate();
  }
}
