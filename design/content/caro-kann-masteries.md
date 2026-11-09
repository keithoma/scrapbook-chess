# Caro-Kann granularity review

This curated design view groups opening identities and aliases for reviewing
Caro-Kann catalog granularity. Use the generated
[implemented achievement inventory](../../docs/reference/implemented-achievements.md)
for current active White and Black mastery tracks and their exact IDs.

Names come from the [recognition catalog](../../data/openings/caro-kann.json),
with executable tracks in the
[mastery YAML](../../data/achievements/masteries/openings/caro-kann-defense.yml).
XP thresholds remain in the
[shared opening policy](../../data/rules/opening-mastery.yml).

The common “Caro-Kann Defense:” prefix is omitted below, except for the base
opening. Commas retain the complete nested variation name. Each row is a named
opening identity; a name component without its own row does not imply another
mastery. Headings group related names for design review. Recognition and credit
follow the [opening mastery rules](../mechanics/opening-masteries.md#named-openings-and-branching).

## Base opening

| No. | Implemented identity |
| --- | --- |
| 1 | Caro-Kann Defense |

## Accelerated Panov Attack

| No. | Implemented identity |
| --- | --- |
| 2 | Accelerated Panov Attack |
| 3 | Accelerated Panov Attack, Modern Variation |
| 4 | Accelerated Panov Attack, Open Variation |
| 5 | Accelerated Panov Attack, Pseudo-Scandinavian |
| 6 | Accelerated Panov Attack, Van Weersel Attack |

## Advance Variation

| No. | Implemented identity |
| --- | --- |
| 7 | Advance Variation |
| 8 | Advance Variation, Bayonet Attack |
| 9 | Advance Variation, Botvinnik-Carls Defense |
| 10 | Advance Variation, Bronstein Variation |
| 11 | Advance Variation, Prins Attack |
| 12 | Advance Variation, Short Variation |
| 13 | Advance Variation, Tal Variation |
| 14 | Advance Variation, Van der Wiel Attack |
| 15 | Advance Variation, Van der Wiel Attack, Dreyev Defense |

## Breyer Variation

| No. | Implemented identity |
| --- | --- |
| 16 | Breyer Variation |
| 17 | Breyer Variation, Stein Attack |

## Classical Variation

| No. | Implemented identity |
| --- | --- |
| 18 | Classical Variation |
| 19 | Classical Variation, Flohr Variation |
| 20 | Classical Variation, Maróczy Attack |
| 21 | Classical Variation, Lobron System |
| 22 | Classical Variation, Seirawan Variation |
| 23 | Classical Variation, Spassky Variation |

## Exchange Variation

| No. | Implemented identity |
| --- | --- |
| 24 | Exchange Variation |
| 25 | Exchange Variation, Bulla Attack |
| 26 | Exchange Variation, Rubinstein Variation |

## Hillbilly Attack

| No. | Implemented identity |
| --- | --- |
| 27 | Hillbilly Attack |
| 28 | Hillbilly Attack, Schaeffer Gambit |

## Karpov Variation

| No. | Implemented identity |
| --- | --- |
| 29 | Karpov Variation |
| 30 | Karpov Variation, Modern Variation |
| 31 | Karpov Variation, Modern Variation, Ivanchuk Defense |
| 32 | Karpov Variation, Modern Variation, Kasparov Attack |
| 33 | Karpov Variation, Smyslov Variation |
| 34 | Karpov Variation, Tiviakov-Fischer Attack |

## Labahn Attack

| No. | Implemented identity |
| --- | --- |
| 35 | Labahn Attack |
| 36 | Labahn Attack, Double Gambit |
| 37 | Labahn Attack, Polish Variation |

## Maróczy Variation

| No. | Implemented identity |
| --- | --- |
| 38 | Maróczy Variation |
| 39 | Maróczy Variation, Maróczy Gambit |

## Panov Attack and Panov-Botvinnik

| No. | Implemented identity |
| --- | --- |
| 40 | Panov Attack |
| 41 | Panov Attack, Gunderam Attack |
| 42 | Panov Attack, Modern Defense |
| 43 | Panov Attack, Modern Defense, Carlsbad Line |
| 44 | Panov Attack, Modern Defense, Czerniak Line |
| 45 | Panov Attack, Modern Defense, Mieses Line |
| 46 | Panov Attack, Modern Defense, Reifir-Spielmann Line |
| 47 | Panov-Botvinnik, Herzog Defense |
| 48 | Panov Attack, Fianchetto Defense |
| 49 | Panov Attack, Fianchetto Defense, Fianchetto Gambit |

## Spike Variation

| No. | Implemented identity |
| --- | --- |
| 50 | Spike Variation |
| 51 | Spike Variation, Scorpion-Grob Gambit |

## Tartakower Variation

| No. | Implemented identity |
| --- | --- |
| 52 | Tartakower Variation |
| 53 | Tartakower Variation, Perlis Line |

## Two Knights Attack

| No. | Implemented identity |
| --- | --- |
| 54 | Two Knights Attack |
| 55 | Two Knights Attack, Mindeno Variation |

## Other named variations and gambits

| No. | Implemented identity |
| --- | --- |
| 56 | Apocalypse Attack |
| 57 | Dinic Gambit |
| 58 | Endgame Offer |
| 59 | Endgame Variation |
| 60 | Euwe Attack |
| 61 | Goldman Variation |
| 62 | Hector Gambit |
| 63 | Scorpion-Horus Gambit |
| 64 | St. Patrick's Attack |
| 65 | Toikkanen Gambit |
| 66 | De Bruycker Defense |
| 67 | Edinburgh Variation |
| 68 | Masi Variation |
| 69 | Massachusetts Defense |
| 70 | Mieses Attack, Landau Gambit |
| 71 | Mieses Gambit |
| 72 | Modern Variation |
| 73 | Ulysses Gambit |
| 74 | Alekhine Gambit |
| 75 | Alien Gambit |
| 76 | Campomanes Attack |
| 77 | Forgacs Variation |
| 78 | Gurgenidze Counterattack |
| 79 | Gurgenidze System |
| 80 | Rasa-Studier Gambit |
| 81 | von Hennig Gambit |
| 82 | Bronstein-Larsen Variation |
| 83 | Finnish Variation |
| 84 | Martian Gambit |

## Labels sharing an identity

The pinned [source rows](../../data/openings/sources/caro-kann.tsv) contain 110
entries under 92 distinct labels. Repeated labels share an identity. The following
eight additional labels are folded into existing identities, producing the 84
rows above. These aliases do not add color tracks.

| Additional source label | Implemented identity |
| --- | --- |
| Main Line | Caro-Kann Defense |
| Two Knights Attack, Mindeno Variation, Exchange Line | Two Knights Attack, Mindeno Variation |
| Two Knights Attack, Mindeno Variation, Retreat Line | Two Knights Attack, Mindeno Variation |
| Advance, Short Variation | Advance Variation, Short Variation |
| Panov Attack, Main Line | Panov Attack |
| Karpov Variation, Modern Main Line | Karpov Variation, Modern Variation |
| Karpov Variation, Smyslov Variation, Main Line | Karpov Variation, Smyslov Variation |
| Classical Variation, Main Line | Classical Variation |
