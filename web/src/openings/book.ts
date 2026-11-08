import type { Chess } from 'chessops/chess';
import type { Move } from 'chessops/types';
import source from '../../../data/openings/lichess_2100_rapid_2026-05.bin?base64';
import manifest from '../../../data/openings/book.json';
import { POLYGLOT_KEYS } from './polyglot-keys';

export const BOOK_VERSION = manifest.id;
const roles = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];

// Independent implementation of https://hgm.nubati.net/book_format.html.
// Polyglot hashes pseudo-capturable EP, even when the pawn is pinned.
export function polyglotKey(pos: Chess): bigint {
  let hash = 0n;
  for (const [square, piece] of pos.board) {
    const index = 2 * roles.indexOf(piece.role) + (piece.color === 'white' ? 1 : 0);
    hash ^= POLYGLOT_KEYS[64 * index + square];
  }
  for (const [color, base] of [['white', 768], ['black', 770]] as const) {
    if (pos.castles.rook[color].h !== undefined) hash ^= POLYGLOT_KEYS[base];
    if (pos.castles.rook[color].a !== undefined) hash ^= POLYGLOT_KEYS[base + 1];
  }
  if (pos.epSquare !== undefined) {
    const file = pos.epSquare % 8;
    const rank = (pos.epSquare >> 3) + (pos.turn === 'white' ? -1 : 1);
    if ([file - 1, file + 1].some(f => f >= 0 && f < 8 &&
      pos.board.get(f + 8 * rank)?.color === pos.turn && pos.board.getRole(f + 8 * rank) === 'pawn'))
      hash ^= POLYGLOT_KEYS[772 + file];
  }
  if (pos.turn === 'white') hash ^= POLYGLOT_KEYS[780];
  return hash;
}

export class PolyglotBook {
  private data: DataView;
  constructor(bytes: Uint8Array) {
    if (bytes.byteLength % 16) throw new Error('Invalid Polyglot book length.');
    this.data = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  has(pos: Chess, move: Move): boolean {
    if (!('from' in move)) return false;
    const key = polyglotKey(pos);
    // chessops and Polyglot both encode castling as king-to-rook.
    const promotion = move.promotion ? ['knight', 'bishop', 'rook', 'queen'].indexOf(move.promotion) + 1 : 0;
    const encoded = move.to | (move.from << 6) | (promotion << 12);
    let low = 0; let high = this.data.byteLength / 16;
    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.data.getBigUint64(mid * 16) < key) low = mid + 1;
      else high = mid;
    }
    for (let offset = low * 16; offset < this.data.byteLength && this.data.getBigUint64(offset) === key; offset += 16)
      if (this.data.getUint16(offset + 8) === encoded) return true;
    return false;
  }
}

// Embedded once by both bundlers. No live book requests during collection.
export const openingBook = new PolyglotBook(Uint8Array.from(atob(source), c => c.charCodeAt(0)));
