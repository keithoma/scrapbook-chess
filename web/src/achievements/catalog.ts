import { parse } from 'yaml';
import mileage from '../../../data/achievements/badges/veterancy/mileage.yml?raw';
import consolation from '../../../data/achievements/badges/veterancy/consolation-prize.yml?raw';
import captures from '../../../data/achievements/badges/material/captures.yml?raw';
import specialMoves from '../../../data/achievements/badges/variety/special-moves.yml?raw';
import promotions from '../../../data/achievements/badges/material/promotions.yml?raw';
import checks from '../../../data/achievements/badges/skill/king-pressure.yml?raw';
import odds from '../../../data/achievements/badges/resilience/against-the-odds.yml?raw';
import victories from '../../../data/achievements/badges/domination/body-count.yml?raw';
import castling from '../../../data/achievements/badges/skill/castling.yml?raw';
import weekdays from '../../../data/achievements/badges/veterancy/dailyscape.yml?raw';
import hours from '../../../data/achievements/badges/veterancy/chronotype.yml?raw';
import workLife from '../../../data/achievements/badges/domination/work-life-balance.yml?raw';
import phases from '../../../data/achievements/badges/domination/phasewise.yml?raw';
import development from '../../../data/achievements/badges/skill/development.yml?raw';
import clockBadges from '../../../data/achievements/badges/domination/chessdom.yml?raw';
import precision from '../../../data/achievements/badges/skill/precision.yml?raw';

export const BADGE_IDS = ['badge_played_total', 'badge_won_total', 'badge_moves_played', 'badge_total_checks',
  'badge_material_total', 'badge_promotion', 'badge_en_passant', 'badge_played_ultrabullet', 'badge_played_hyperbullet',
  'badge_played_bullet', 'badge_played_blitz', 'badge_played_rapid', 'badge_played_classical', 'badge_upset', 'hold_your_own',
  'badge_opposite_side_casteling', 'badge_won_ultrabullet', 'badge_won_hyperbullet', 'badge_won_bullet', 'badge_won_blitz', 'badge_won_rapid', 'badge_won_classical', 'badge_played_monday', 'badge_played_tuesday', 'badge_played_wednesday', 'badge_played_thursday', 'badge_played_friday', 'badge_played_saturday', 'badge_played_sunday', 'badge_played_time_00_04', 'badge_played_time_04_08', 'badge_played_time_08_12', 'badge_played_time_12_16', 'badge_played_time_16_20', 'badge_played_time_20_24', 'badge_won_weekday', 'badge_won_weekend', 'badge_won_opening', 'badge_won_middlegame', 'badge_won_endgame', 'badge_fianchetto_total', 'badge_time_advantage', 'badge_time_scramble', 'badge_no_blunders'] as const;
export type BadgeId = typeof BADGE_IDS[number];
export interface Flavor { text?: string; quote?: string; player_quote?: string; author?: string }
export interface Tier { name: string; amount: number; flavor?: Flavor; flavor_text?: string }
export interface Badge {
  id: BadgeId;
  name: string;
  description: string;
  category: string;
  subcategory: string;
  flavor?: Flavor;
  flavor_text?: string;
  config: { tiers: Tier[]; is_hidden?: boolean; metric_key?: string | null; required_value?: number | string | boolean | null; max_seconds?: number; analysis_required?: boolean; survival_plies?: number; lost_cp?: number; retention_chance_slack?: number };
}

const raw: Badge[] = [mileage, victories, consolation, captures, specialMoves, promotions, checks, odds, castling, weekdays, hours, workLife, phases, development, clockBadges, precision].flatMap(source => parse(source));
export const BADGES = BADGE_IDS.map(id => {
  const matches = raw.filter(badge => badge.id === id);
  if (matches.length !== 1) throw new Error(`Expected exactly one definition for ${id}.`);
  const badge = matches[0];
  if (!badge.name || !badge.config.tiers.length || badge.config.tiers.some(tier => !Number.isFinite(tier.amount) || tier.amount <= 0)) {
    throw new Error(`Invalid local badge definition: ${id}`);
  }
  return badge;
});

function ratingGap(id: 'badge_upset' | 'hold_your_own') {
  const gap = BADGES.find(badge => badge.id === id)!.config.required_value;
  if (typeof gap !== 'number' || !Number.isSafeInteger(gap) || gap <= 0) throw new Error(`Invalid rating gap for ${id}.`);
  return gap;
}
export const RATING_GAPS = { win: ratingGap('badge_upset'), draw: ratingGap('hold_your_own') };

export function progressFor(badge: Badge, total: number) {
  const tiers = [...badge.config.tiers].sort((a, b) => a.amount - b.amount);
  return {
    total, tier: tiers.filter(tier => total >= tier.amount).at(-1),
    next: tiers.find(tier => total < tier.amount),
  };
}
