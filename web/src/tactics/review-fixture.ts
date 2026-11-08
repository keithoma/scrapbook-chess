import type { MoveResult } from '../storage';

export const TACTICAL_REVIEW_URL = '/__dev/tactical-reviews';
export type ExpectedXp = 'positive' | 'zero';
export interface TacticalReviewIdentity {
  masteryId: string;
  pgn: string;
  ply: number;
}
export interface TacticalReviewFixture extends TacticalReviewIdentity {
  schemaVersion: 1;
  expectedXp: ExpectedXp;
  analysis: {
    version: string;
    result: Pick<MoveResult, 'ply' | 'best' | 'played' | 'bestMove'>;
  };
  observed: { status: 'qualified' | 'pending' | 'rejected'; xp: number };
}

// Neither the label nor the current rules participate in identity: revising a
// judgment replaces the same fixture, while tactics on the same ply stay separate.
export async function tacticalReviewFilename(identity: TacticalReviewIdentity): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([
    identity.masteryId, identity.pgn.trim(), identity.ply,
  ]));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const hash = [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
  return `${identity.masteryId}-${identity.ply}-${hash}.json`;
}
