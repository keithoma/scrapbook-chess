import { DatabaseSync } from 'node:sqlite';
export function openDatabase(path: string) {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, name TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS mock_sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS linked_accounts (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, platform TEXT NOT NULL,
      username TEXT NOT NULL, verified_at INTEGER, development INTEGER NOT NULL DEFAULT 0,
      UNIQUE(user_id, platform, username)
    );
    CREATE TABLE IF NOT EXISTS imported_games (
      user_id TEXT NOT NULL, game_id TEXT NOT NULL, account_id TEXT NOT NULL,
      game_json TEXT NOT NULL, raw_json TEXT NOT NULL, imported_at INTEGER NOT NULL,
      PRIMARY KEY(user_id, game_id)
    );
    CREATE TABLE IF NOT EXISTS collections (
      user_id TEXT NOT NULL, game_id TEXT NOT NULL, grant_json TEXT NOT NULL,
      PRIMARY KEY(user_id, game_id)
    );
    CREATE TABLE IF NOT EXISTS analyses (
      user_id TEXT NOT NULL, game_id TEXT NOT NULL, checkpoint_json TEXT NOT NULL,
      PRIMARY KEY(user_id, game_id)
    );`);
  return db;
}
export function atomic<T>(db: DatabaseSync, operation: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try { const value = operation(); db.exec('COMMIT'); return value; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
