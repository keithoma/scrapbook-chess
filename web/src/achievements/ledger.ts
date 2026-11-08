import type { Color } from 'chessops/types';
import type { ReplayGame } from '../game';
import type { Checkpoint } from '../storage';
import { contributions, gameIdentity, type GameGrant } from './collection';

const CHANNEL = 'scrapbook-collection-changed';
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('scrapbook-local-collection', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('games', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Close other Scrapbook tabs and try again.'));
  });
}

export async function readCollection(): Promise<GameGrant[]> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction('games');
      const request = tx.objectStore('games').getAll();
      tx.oncomplete = () => resolve(request.result);
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export async function collectGame(game: ReplayGame, color: Color, checkpoint?: Checkpoint) {
  const events = contributions(game, color, checkpoint);
  const id = gameIdentity(game);
  const db = await database();
  try {
    const saved = await new Promise<{ before: GameGrant[]; after: GameGrant[]; grant: GameGrant }>((resolve, reject) => {
      const tx = db.transaction('games', 'readwrite');
      const store = tx.objectStore('games');
      const request = store.getAll();
      let result: { before: GameGrant[]; after: GameGrant[]; grant: GameGrant };
      request.onsuccess = () => {
        const before: GameGrant[] = request.result;
        const previous = before.find(entry => entry.id === id);
        const now = new Date().toISOString();
        const grant: GameGrant = { id, version: 1, pgn: game.pgn, color, events, collectedAt: previous?.collectedAt ?? now, updatedAt: now };
        store.put(grant);
        result = { before, after: [...before.filter(entry => entry.id !== id), grant], grant };
      };
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
    if ('BroadcastChannel' in globalThis) {
      const channel = new BroadcastChannel(CHANNEL); channel.postMessage('changed'); channel.close();
    }
    return saved;
  } finally { db.close(); }
}

export function subscribeCollection(refresh: () => void): () => void {
  if (!('BroadcastChannel' in globalThis)) return () => {};
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = refresh;
  return () => channel.close();
}
