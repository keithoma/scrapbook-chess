import { parse } from 'yaml';
import mileage from '../../../data/achievements/badges/veterancy/mileage.yml?raw';
import consolation from '../../../data/achievements/badges/veterancy/consolation-prize.yml?raw';
import position from '../../../data/achievements/badges/position.yml?raw';
import victories from '../../../data/achievements/badges/domination/body-count.yml?raw';

export const BADGE_IDS = ['badge_played_total', 'badge_won_total', 'badge_moves_played', 'badge_total_checks',
  'badge_material_total', 'badge_promotion', 'badge_en_passant', 'badge_played_ultrabullet', 'badge_played_hyperbullet',
  'badge_played_bullet', 'badge_played_blitz', 'badge_played_rapid', 'badge_played_classical'] as const;
export type BadgeId = typeof BADGE_IDS[number];
export interface Flavor { text?: string; quote?: string; player_quote?: string; author?: string }
export interface Tier { name: string; amount: number; flavor?: Flavor; flavor_text?: string }
export interface Badge {
  id: BadgeId;
  name: string;
  description: string;
  flavor?: Flavor;
  flavor_text?: string;
  config: { tiers: Tier[]; is_hidden?: boolean };
}

const raw: Badge[] = [mileage, victories, consolation, position].flatMap(source => parse(source));
export const BADGES = BADGE_IDS.map(id => {
  const matches = raw.filter(badge => badge.id === id);
  if (matches.length !== 1) throw new Error(`Expected exactly one definition for ${id}.`);
  const badge = matches[0];
  if (!badge.name || !badge.config.tiers.length || badge.config.tiers.some(tier => !Number.isFinite(tier.amount) || tier.amount <= 0)) {
    throw new Error(`Invalid local badge definition: ${id}`);
  }
  return badge;
});

export function progressFor(badge: Badge, total: number) {
  const tiers = [...badge.config.tiers].sort((a, b) => a.amount - b.amount);
  return {
    total, tier: tiers.filter(tier => total >= tier.amount).at(-1),
    next: tiers.find(tier => total < tier.amount),
  };
}
