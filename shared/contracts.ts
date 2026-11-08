export type Platform = 'lichess' | 'chesscom';
export interface LinkedAccount {
  id: string; platform: Platform; username: string;
  verified: boolean; development: boolean;
}
export interface ImportedGame {
  id: string; platform: Platform; sourceId: string; username: string;
  white: string; black: string; color: 'white' | 'black'; pgn: string;
  startedAt: number; finishedAt: number; speed: string; timeControl: string;
  collected?: boolean; analyzed?: boolean;
}
export interface ProfileState {
  user: { id: string; name: string; createdAt: number } | null;
  accounts: LinkedAccount[]; games: ImportedGame[];
  localAccountTesting: boolean; mockLogin: boolean; multipleAccounts: boolean;
}
export interface ImportReport {
  accountId: string; platform: Platform; username: string;
  imported: number; skipped: number; error?: string;
}
