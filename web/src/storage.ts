import type { EnginePick, Score } from './stockfish';
import type { CleanGainEvidence } from './chess/clean-gain';
import type { MoveAnnotations } from './chess/annotations';
import { annotateMoves } from './chess/annotations';
import { parseGame } from './game';

export const ANALYSIS_VERSION = 'stockfish-19.0.1-full-single-depth6-hash32-proof-v1';
export const DEPTH = 6;
export interface MoveResult {
  ply: number;
  best: Score;
  played: Score;
  bestMove: string;
  ms: number;
  annotations?: MoveAnnotations;
  topMoves?: EnginePick[]; // Absent in older checkpoints, enriched on request.
}
export interface VirtualMove { san: string; uci: string; fen: string }
export interface Checkpoint {
  key: string;
  version: string;
  pgn: string;
  results: MoveResult[];
  cleanGains?: CleanGainEvidence[];
  virtual: VirtualMove[];
  virtualStatus: 'pending' | 'mate' | 'limit' | 'terminal';
  virtualWinner?: 'white' | 'black';
  updatedAt: string;
}

async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('scrapbook-browser-proof', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('checkpoints', { keyPath: 'key' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
async function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction('checkpoints', mode);
      const request = action(tx.objectStore('checkpoints'));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error ?? new Error('Checkpoint transaction aborted.'));
    });
  } finally { db.close(); }
}
export async function checkpointKey(pgn: string): Promise<string> {
  const data = new TextEncoder().encode(`${ANALYSIS_VERSION}\n${pgn.trim()}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, '0')).join('');
}
export async function loadCheckpoint(pgn: string): Promise<Checkpoint> {
  const key = await checkpointKey(pgn);
  const saved = await transact<Checkpoint | undefined>('readonly', store => store.get(key));
  if (saved) return { ...saved, results: annotateMoves(parseGame(saved.pgn), saved.results) };
  return {
    key, pgn: pgn.trim(), version: ANALYSIS_VERSION, results: [], virtual: [],
    virtualStatus: 'pending', updatedAt: new Date().toISOString(),
  };
}
export async function saveCheckpoint(value: Checkpoint): Promise<void> {
  await transact('readwrite', store => store.put({ ...value, updatedAt: new Date().toISOString() }));
}
export async function listCheckpoints(): Promise<Checkpoint[]> {
  const all = await transact<Checkpoint[]>('readonly', store => store.getAll());
  return all.filter(c => c.version === ANALYSIS_VERSION)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
export async function lastCheckpoint(): Promise<Checkpoint | undefined> {
  return (await listCheckpoints())[0];
}
