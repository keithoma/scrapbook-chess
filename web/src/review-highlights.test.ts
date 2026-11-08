import { describe, expect, it } from 'vitest';
import { BADGES } from './achievements/catalog';
import type { Contribution } from './achievements/collection';
import { masteryContributions } from './achievements/mastery';
import { endgameContributions } from './endgames/mastery';
import { analyzed } from './fixtures/test-analysis';
import { parseGame } from './game';
import { reviewHighlights } from './review-highlights';
import { annotateMoves } from './chess/annotations';
import { knightForkCandidates } from './tactics/knight-forks';
import { skewerCandidates } from './tactics/skewers';
import { openingContributions } from './openings/mastery';
import jobavaPgn from './fixtures/games/jobava.pgn?raw';

const empty = { events: [], forks: [], skewers: [], results: [], color: 'white', locale: 'en' } as const;
const base = () => ({ ...empty, events: [] as Contribution[], forks: [], skewers: [], results: [] });

describe('review highlight explanations', () => {
  it('groups simultaneous triggers, sorts plies, and explains badge origins with the award location', () => {
    const event: Contribution = { kind: 'badge', badgeId: 'badge_punish_blunders', amount: 1, originPly: 3, ply: 4 };
    const highlights = reviewHighlights({ ...base(), events: [
      { kind: 'scrap', mode: 'real', notation: 'Qh4#', ply: 4 },
      event, event,
      { kind: 'badge', badgeId: 'badge_moves_played', amount: 1, ply: 2 },
      { kind: 'scrap', mode: 'virtual', notation: 'Qh2#', ply: 3, virtualPly: 5 },
    ] });
    expect(highlights.map(highlight => highlight.ply)).toEqual([3, 4]);
    const badge = BADGES.find(badge => badge.id === 'badge_punish_blunders')!;
    expect(highlights[0].reasons).toEqual([
      `${badge.name} +1: ${badge.description} Confirmed at ply 4.`,
      'The separate engine finish earned the virtual Qh2# scrap.',
    ]);
    expect(highlights[1].reasons).toEqual(['Checkmate earned the Qh4# scrap.']);
  });

  it('explains tactical candidates using their squares, without implying a reward or including the other side', () => {
    const forkGame = parseGame('[SetUp "1"]\n[FEN "3q3k/8/8/4N3/8/8/8/7K w - - 0 1"]\n\n1. Nf7+ *');
    const forks = knightForkCandidates(forkGame);
    const highlights = reviewHighlights({ ...base(), forks });
    expect(highlights[0].reasons).toEqual([
      'Knight-fork candidate: the knight on f7 attacks enemy pieces on d8, h8. This alone does not guarantee mastery XP.',
    ]);
    expect(reviewHighlights({ ...base(), forks, color: 'black' })).toEqual([]);
    const skewerGame = parseGame('[SetUp "1"]\n[FEN "8/8/8/3k3q/8/8/8/RK6 w - - 0 1"]\n\n1. Ra5+ 1-0');
    // Use an actual detected line so explanation and detection agree on its targets.
    const skewers = skewerCandidates(skewerGame);
    expect(skewers).toHaveLength(1);
    for (const skewer of skewers) {
      const highlight = reviewHighlights({ ...base(), skewers: [skewer] })[0];
      for (const line of skewer.lines) expect(highlight.reasons).toContain(
        `Skewer candidate: ${line.attackerName} attacks ${line.front.name} with ${line.rear.name} behind it. This alone does not guarantee mastery XP.`,
      );
    }
  });

  it('never creates highlights from only-move annotations alone, but keeps their context on existing highlights', () => {
    const game = parseGame('1. e4 e5 *');
    const checkpoint = analyzed(game);
    for (const [index, result] of checkpoint.results.entries()) result.topMoves = [
      { uci: result.bestMove, score: { type: 'cp', value: 0 }, depth: 6 },
      { uci: index === 0 ? 'd2d4' : 'd7d5', score: { type: 'cp', value: index === 0 ? -500 : 500 }, depth: 6 },
    ];
    const results = annotateMoves(game, checkpoint.results);
    expect(results.every(result => result.annotations?.only)).toBe(true);
    expect(reviewHighlights({ ...base(), results })).toEqual([]);
    for (const ply of [1, 2]) {
      const highlights = reviewHighlights({ ...base(), results, events: [
        { kind: 'badge', badgeId: 'badge_punish_blunders', amount: 1, originPly: ply, ply: ply + 1 },
      ] });
      expect(highlights.map(highlight => highlight.ply)).toEqual([ply]);
      expect(highlights[0].reasons).toHaveLength(2);
      expect(highlights[0].reasons).toContain(
        'Only move: the played move is a best move, while the next-best engine choice is an inaccuracy or worse.',
      );
    }
  });

  it('shows mastery XP together with its tactical candidate and explains opening awards', () => {
    const game = parseGame('[SetUp "1"]\n[FEN "3r3k/8/8/4N3/8/8/7K/3r4 w - - 0 1"]\n\n1. Nf7+ 1-0');
    const events = masteryContributions(game, 'white', analyzed(game, 200));
    expect(events).toHaveLength(1);
    const highlights = reviewHighlights({ ...base(), events, forks: knightForkCandidates(game) });
    expect(highlights).toHaveLength(1);
    expect(highlights[0].reasons).toHaveLength(2);
    expect(highlights[0].reasons[0]).toBe(`Qualified tactic: Knight forks +${events[0].amount} XP.`);

    const openingGame = parseGame(jobavaPgn);
    const openingEvents = openingContributions(openingGame, 'white', analyzed(openingGame));
    expect(openingEvents.length).toBeGreaterThan(0);
    const event = openingEvents[0];
    for (const inBook of [true, false]) {
      const [highlight] = reviewHighlights({ ...base(), events: [{ ...event, evidence: { ...event.evidence, inBook } }] });
      expect(highlight.ply).toBe(event.ply);
      expect(highlight.reasons).toEqual([
        `The Modern Artist (Rapport-Jobava) +${event.amount} XP ${inBook ? 'for a book move in this opening.' : 'for your play beyond the opening book.'}`,
      ]);
    }
    const [gradeHighlight] = reviewHighlights({ ...base(), events: [{ ...event, amount: 0, grade: 'S' }] });
    expect(gradeHighlight.reasons).toEqual(['The Modern Artist (Rapport-Jobava) · Opening grade: S']);
  });

  it('explains the beginning and award of a pawn ending, including a starting-position highlight', () => {
    const game = parseGame('[SetUp "1"]\n[FEN "7k/6p1/8/8/8/8/1P6/K7 w - - 0 1"]\n\n1. Kb1 Kh7 2. Kc2 Kg6 1-0');
    const events = endgameContributions(game, 'white', analyzed(game));
    expect(events).toHaveLength(1);
    const highlights = reviewHighlights({ ...base(), events });
    expect(highlights).toEqual([
      { ply: 0, reasons: ['Pawn ending begins: only kings and pawns remain, with pawns on both sides.'] },
      { ply: 4, reasons: [`Pawn vs Pawn +${events[0].amount} XP for your play from ply 0 through the game result.`] },
    ]);
    expect(reviewHighlights({ ...base(), events, locale: 'de' })[1].reasons[0]).toContain('Bauern gegen Bauern');
  });
});
