import { expect, it } from 'vitest';
import { BADGES } from './catalog';

it('badge_fianchetto_total has a complete name, taxonomy, base flavor, and every tier flavor', () => {
 const badge=BADGES.find(badge=>badge.id==='badge_fianchetto_total')!; expect(badge.name.trim()).not.toBe(''); expect(badge.category).toBeTruthy();expect(badge.subcategory).toBeTruthy();expect(badge.flavor?.text||badge.flavor?.quote||badge.flavor?.player_quote||badge.flavor_text).toBeTruthy(); for(const tier of badge.config.tiers) expect(tier.flavor?.text||tier.flavor?.quote||tier.flavor?.player_quote||tier.flavor_text).toBeTruthy();
});

it('badge_time_advantage has a complete name, taxonomy, base flavor, and every tier flavor', () => {
 const badge=BADGES.find(badge=>badge.id==='badge_time_advantage')!; expect(badge.name.trim()).not.toBe(''); expect(badge.category).toBeTruthy();expect(badge.subcategory).toBeTruthy();expect(badge.flavor?.text||badge.flavor?.quote||badge.flavor?.player_quote||badge.flavor_text).toBeTruthy(); for(const tier of badge.config.tiers) expect(tier.flavor?.text||tier.flavor?.quote||tier.flavor?.player_quote||tier.flavor_text).toBeTruthy();
});

it('badge_time_scramble has a complete name, taxonomy, base flavor, and every tier flavor', () => {
 const badge=BADGES.find(badge=>badge.id==='badge_time_scramble')!; expect(badge.name.trim()).not.toBe(''); expect(badge.category).toBeTruthy();expect(badge.subcategory).toBeTruthy();expect(badge.flavor?.text||badge.flavor?.quote||badge.flavor?.player_quote||badge.flavor_text).toBeTruthy(); for(const tier of badge.config.tiers) expect(tier.flavor?.text||tier.flavor?.quote||tier.flavor?.player_quote||tier.flavor_text).toBeTruthy();
});

it('badge_no_blunders has a complete name, taxonomy, base flavor, and every tier flavor', () => {
 const badge=BADGES.find(badge=>badge.id==='badge_no_blunders')!; expect(badge.name.trim()).not.toBe(''); expect(badge.category).toBeTruthy();expect(badge.subcategory).toBeTruthy();expect(badge.flavor?.text||badge.flavor?.quote||badge.flavor?.player_quote||badge.flavor_text).toBeTruthy(); for(const tier of badge.config.tiers) expect(tier.flavor?.text||tier.flavor?.quote||tier.flavor?.player_quote||tier.flavor_text).toBeTruthy();
});

it('badge_no_mistakes_blunders has a complete name, taxonomy, base flavor, and every tier flavor', () => {
 const badge=BADGES.find(badge=>badge.id==='badge_no_mistakes_blunders')!; expect(badge.name.trim()).not.toBe(''); expect(badge.category).toBeTruthy();expect(badge.subcategory).toBeTruthy();expect(badge.flavor?.text||badge.flavor?.quote||badge.flavor?.player_quote||badge.flavor_text).toBeTruthy(); for(const tier of badge.config.tiers) expect(tier.flavor?.text||tier.flavor?.quote||tier.flavor?.player_quote||tier.flavor_text).toBeTruthy();
});

it('badge_perfect_eval has a complete name, taxonomy, base flavor, and every tier flavor', () => {
 const badge=BADGES.find(badge=>badge.id==='badge_perfect_eval')!; expect(badge.name.trim()).not.toBe(''); expect(badge.category).toBeTruthy();expect(badge.subcategory).toBeTruthy();expect(badge.flavor?.text||badge.flavor?.quote||badge.flavor?.player_quote||badge.flavor_text).toBeTruthy(); for(const tier of badge.config.tiers) expect(tier.flavor?.text||tier.flavor?.quote||tier.flavor?.player_quote||tier.flavor_text).toBeTruthy();
});

it('badge_clean_pawns has a complete name, taxonomy, base flavor, and every tier flavor', () => {
 const badge=BADGES.find(badge=>badge.id==='badge_clean_pawns')!; expect(badge.name.trim()).not.toBe(''); expect(badge.category).toBeTruthy();expect(badge.subcategory).toBeTruthy();expect(badge.flavor?.text||badge.flavor?.quote||badge.flavor?.player_quote||badge.flavor_text).toBeTruthy(); for(const tier of badge.config.tiers) expect(tier.flavor?.text||tier.flavor?.quote||tier.flavor?.player_quote||tier.flavor_text).toBeTruthy();
});

it('badge_clean_knight has a complete name, taxonomy, base flavor, and every tier flavor', () => {
 const badge=BADGES.find(badge=>badge.id==='badge_clean_knight')!; expect(badge.name.trim()).not.toBe(''); expect(badge.category).toBeTruthy();expect(badge.subcategory).toBeTruthy();expect(badge.flavor?.text||badge.flavor?.quote||badge.flavor?.player_quote||badge.flavor_text).toBeTruthy(); for(const tier of badge.config.tiers) expect(tier.flavor?.text||tier.flavor?.quote||tier.flavor?.player_quote||tier.flavor_text).toBeTruthy();
});

it('badge_clean_bishop has a complete name, taxonomy, base flavor, and every tier flavor', () => {
 const badge=BADGES.find(badge=>badge.id==='badge_clean_bishop')!; expect(badge.name.trim()).not.toBe(''); expect(badge.category).toBeTruthy();expect(badge.subcategory).toBeTruthy();expect(badge.flavor?.text||badge.flavor?.quote||badge.flavor?.player_quote||badge.flavor_text).toBeTruthy(); for(const tier of badge.config.tiers) expect(tier.flavor?.text||tier.flavor?.quote||tier.flavor?.player_quote||tier.flavor_text).toBeTruthy();
});

it('badge_clean_rook has a complete name, taxonomy, base flavor, and every tier flavor', () => {
 const badge=BADGES.find(badge=>badge.id==='badge_clean_rook')!; expect(badge.name.trim()).not.toBe(''); expect(badge.category).toBeTruthy();expect(badge.subcategory).toBeTruthy();expect(badge.flavor?.text||badge.flavor?.quote||badge.flavor?.player_quote||badge.flavor_text).toBeTruthy(); for(const tier of badge.config.tiers) expect(tier.flavor?.text||tier.flavor?.quote||tier.flavor?.player_quote||tier.flavor_text).toBeTruthy();
});

it('badge_clean_queen has a complete name, taxonomy, base flavor, and every tier flavor', () => {
 const badge=BADGES.find(badge=>badge.id==='badge_clean_queen')!; expect(badge.name.trim()).not.toBe(''); expect(badge.category).toBeTruthy();expect(badge.subcategory).toBeTruthy();expect(badge.flavor?.text||badge.flavor?.quote||badge.flavor?.player_quote||badge.flavor_text).toBeTruthy(); for(const tier of badge.config.tiers) expect(tier.flavor?.text||tier.flavor?.quote||tier.flavor?.player_quote||tier.flavor_text).toBeTruthy();
});

it('badge_comeback_1_5_late has a complete name, taxonomy, base flavor, and every tier flavor', () => {
 const badge=BADGES.find(badge=>badge.id==='badge_comeback_1_5_late')!; expect(badge.name.trim()).not.toBe(''); expect(badge.category).toBeTruthy();expect(badge.subcategory).toBeTruthy();expect(badge.flavor?.text||badge.flavor?.quote||badge.flavor?.player_quote||badge.flavor_text).toBeTruthy(); for(const tier of badge.config.tiers) expect(tier.flavor?.text||tier.flavor?.quote||tier.flavor?.player_quote||tier.flavor_text).toBeTruthy();
});

it('badge_comeback_2_0_fast has a complete name, taxonomy, base flavor, and every tier flavor', () => {
 const badge=BADGES.find(badge=>badge.id==='badge_comeback_2_0_fast')!; expect(badge.name.trim()).not.toBe(''); expect(badge.category).toBeTruthy();expect(badge.subcategory).toBeTruthy();expect(badge.flavor?.text||badge.flavor?.quote||badge.flavor?.player_quote||badge.flavor_text).toBeTruthy(); for(const tier of badge.config.tiers) expect(tier.flavor?.text||tier.flavor?.quote||tier.flavor?.player_quote||tier.flavor_text).toBeTruthy();
});

it('badge_comeback_3_0_mid has a complete name, taxonomy, base flavor, and every tier flavor', () => {
 const badge=BADGES.find(badge=>badge.id==='badge_comeback_3_0_mid')!; expect(badge.name.trim()).not.toBe(''); expect(badge.category).toBeTruthy();expect(badge.subcategory).toBeTruthy();expect(badge.flavor?.text||badge.flavor?.quote||badge.flavor?.player_quote||badge.flavor_text).toBeTruthy(); for(const tier of badge.config.tiers) expect(tier.flavor?.text||tier.flavor?.quote||tier.flavor?.player_quote||tier.flavor_text).toBeTruthy();
});

it('badge_comeback_endgame_2_0 has a complete name, taxonomy, base flavor, and every tier flavor', () => {
 const badge=BADGES.find(badge=>badge.id==='badge_comeback_endgame_2_0')!; expect(badge.name.trim()).not.toBe(''); expect(badge.category).toBeTruthy();expect(badge.subcategory).toBeTruthy();expect(badge.flavor?.text||badge.flavor?.quote||badge.flavor?.player_quote||badge.flavor_text).toBeTruthy(); for(const tier of badge.config.tiers) expect(tier.flavor?.text||tier.flavor?.quote||tier.flavor?.player_quote||tier.flavor_text).toBeTruthy();
});

it('badge_draw_lost_threefold has a complete name, taxonomy, base flavor, and every tier flavor', () => {
 const badge=BADGES.find(badge=>badge.id==='badge_draw_lost_threefold')!; expect(badge.name.trim()).not.toBe(''); expect(badge.category).toBeTruthy();expect(badge.subcategory).toBeTruthy();expect(badge.flavor?.text||badge.flavor?.quote||badge.flavor?.player_quote||badge.flavor_text).toBeTruthy(); for(const tier of badge.config.tiers) expect(tier.flavor?.text||tier.flavor?.quote||tier.flavor?.player_quote||tier.flavor_text).toBeTruthy();
});
