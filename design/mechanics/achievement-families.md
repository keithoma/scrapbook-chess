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
- Existing JSON mastery/story content is reference material to preserve,
  not proof that its older naming or rules are final.

## Content organization

Executable YAML content belongs in a family/category/subcategory path. Categories
describe the player's accomplishment, rather than its detector input. For example,
rating-based wins and draws belong to Resilience / Against the Odds, while gross
captures and clean material gains belong to separate Material subcategories.
The [YAML checks](../../docs/how-to/run-checks.md#yaml-content) enforce matching
paths and metadata. Keep IDs stable through moves and category corrections.
Unimplemented drafts remain drafts after being classified; filing them does not
activate their mechanics or require completing their writing in the same change.

## Named scraps

The eight former feat definitions belong to the scrap family alongside mating
notation discoveries. They are one-time collectibles, rather than another
achievement family or repeatable badge tiers. A named scrap uses its stable
catalog ID as its identity, regardless of the player's color. Keep the existing
`feat_` ID prefixes so moving the definitions does not rename their identities.

The definitions live in [the scrap catalog](../../data/achievements/scraps/),
grouped by their existing categories and new subject-based subcategories. Names,
descriptions, flavor, and hidden flags are preserved. `config.status: draft`
records that these definitions do not yet have active unlock detectors. Hidden
status alone does not establish that a detector exists.

Mating scraps already have implemented real/virtual states. Moving named
discoveries into the same family does not extend engine simulation eligibility
to their conditions. Their unlock rules still need review, including Connect
Four's starting-position false positive, the no-achievement-hunting principle,
and the perfect game's mention of inaccuracies. See the
[implementation map](../planning/achievement-implementation.md#mastery-story-and-scraps).

## Skewer qualification

Skewers follow the tactical mastery blueprint: material qualification comes before
engine quality, grades, and XP. The initial detector treats a new bishop, rook,
or queen ray with a more valuable enemy piece in front of a less valuable one
as a candidate. Its bounded verifier must establish net material gain through
every immediate defense and legal recaptures. It can credit a newly uncovered
ray, while an unchanged alignment does not earn another occurrence.

These are prototype detection boundaries, not additional authored content rules.
The [implementation reference](../../docs/reference/tactical-masteries.md#skewers)
describes its conservative cases, evidence, and limits. Fork and skewer awards
at the same ply remain distinct; neither track supplies XP or grade marks to the
other.

## Badge qualification and tuning

All YAML badges are implemented. Repeatable game accomplishments stay badges;
quality-scaled tactical skill stays mastery. The
[qualification reference](../../docs/reference/badge-rules.md) describes the
implemented rules and their source limitations without duplicating them here.

Calendar rewards use the user's Settings time zone and original game start time.
Phases follow Lichess scalachess. Mistakes and blunders follow Lichess's convention;
inaccuracies do not block badges. Existing authored tier curves and nonempty
flavor are preserved. Previously blank writing now has initial text for review.

Some formerly unspecified mechanics needed prototype interpretations: clock
sampling and scramble duration, five-full-turn net-gain retention, comeback
boundary samples, the lost-position threshold for draws, and how much gifted
advantage a response must retain. These are revisable implementation choices,
not user-approved balance decisions. The relevant YAML exposes tunable values;
the qualification reference identifies the sampling rules. Missing evidence
leaves an award unavailable rather than assuming success.

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

Knight forks and skewers are implemented. Their definitions refer to one
[shared tactical policy](../../data/rules/tactical-mastery.yml) for quality awards,
grades, XP thresholds, and grade-gate costs. Each track has independent progress.
Values should appear irregular like the authored badge thresholds while keeping
a sensible progression: precise moves earn more experience, and later levels
require progressively more experience. Awards are deterministic for the same
evidence; their apparent randomness is in the authored numbers.

### Tactical grades and level requirements

Every qualified tactical occurrence receives a grade from D-, D, D+, C-, C, C+, B-, B, B+,
A-, A, A+, S-, S, through S+. Grades describe the quality of the move creating
the tactic after material qualification. Geometric candidates that fail the
material or quality gate do not receive a mastery grade. Missing analysis stays
pending rather than being rated poorly.

The initial grade bands subdivide the existing engine-evaluation-loss XP bands.
They are prototype tuning in the shared policy YAML, not standard chess annotations
or Lichess mistake categories. Existing XP awards and level XP thresholds are
preserved. The existing accepted mate outcomes receive S+; no mate distance is
converted into centipawns. Saved contributions keep their grade and grading
version alongside their original XP and evidence.

XP continues accumulating while a grade requirement blocks the next level.
Levels 1–5 require only XP. Level 6 also requires two S-/S/S+ occurrences in its track, level 7
requires three additional high-grade occurrences, and level 8 requires five more.
These are separate batches: lifetime totals are two, five, and ten respectively.
The per-level batch sizes live in YAML alongside the unchanged XP thresholds.

A collected tactic can satisfy only one gate in its own track. Its grade and occurrence remain in
the collection; allocation is derived from the saved history rather than deleting
awards. Multiple qualifying occurrences in one game count separately. Grades earned
before a gate can be banked, and recollection or repeated analysis does not add
another occurrence. The collection shows the next gate's batch progress separately
from the lifetime high-grade count.

Meeting both requirements makes banked XP eligible for further levels, subject
to each intervening gate. Levels above the last specified gate use their existing
XP thresholds with no further grade cost; the earlier gates cannot be skipped.

Existing saved forks can be graded from their retained engine evidence without
rerunning analysis or changing earned XP. Recollection persists the recovered
grade. Unknown historical rules remain ungraded; XP alone never proves an S
grade. Changing saved grading or qualification policies requires an explicit
migration. Correcting a game's player color replaces its contributions as before.

Preserve the existing opening-mastery rank thresholds while those tracks are
reviewed; they do not establish the curve for tactical masteries. Other tactical
tracks and their tuning remain future work.

See [checkmate scraps](checkmate-scraps.md) for their collectible rules and the
[implementation map](../planning/achievement-implementation.md) for detectors
and unresolved mechanics.
