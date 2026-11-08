# Achievement families

These are the intended roles of the four achievement families. The catalog is
authored separately under [data/achievements/](../../data/achievements/).

- Badges: repeatable qualifying events accumulate progress through authored tiers.
- Mastery: experience and levels for openings, tactics, and other chess skills.
- Story: narrative achievement trees with prerequisites and unlockable episodes.
  An example is the Ben Finegold episode unlocked by losing after f3/f6.
- Scraps: one-time collectible discoveries. Checkmate notation scraps are the
  original product hook and belong in the first playable version.
- Streak, diversity, and achievement-group conditions are cross-game mechanics;
  their exact definitions are not yet authored.
- Preserve authored thresholds, tier names, flavor text, attribution, and humor.
  Do not standardize progress curves or silently edit content.
- Existing JSON feat/mastery/story content is reference material to preserve,
  not proof that its older naming or rules are final.

## Mastery progression

Tactics such as forks, skewers, and discoveries belong to mastery tracks. A
qualifying tactic awards experience according to its assessed quality. Awards
vary with quality rather than adding a flat occurrence count. Experience
accumulates toward levels in the corresponding mastery.

Keep qualification and the XP award distinct: first establish that the tactic
qualifies, then evaluate its quality to determine the experience earned. For
forks, use the intended qualification in the
[implementation map](../planning/achievement-implementation.md). Missing analysis
leaves quality-dependent awards pending; it does not imply good or bad play.

The quality-to-XP formula and tactical level thresholds remain undecided. Preserve
the existing opening-mastery rank thresholds while those tracks are reviewed;
they do not establish a level curve for tactical masteries. The current fork
inspector displays candidates and engine evidence without awarding mastery XP.

See [checkmate scraps](checkmate-scraps.md) for their collectible rules and the
[implementation map](../planning/achievement-implementation.md) for detectors
and unresolved mechanics.
