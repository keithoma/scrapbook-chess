import { expect, it } from 'vitest';
import { bookMove } from './book-move';

it('requires enough observations of the move, and rejects loss rates of 70% or more', () => {
  expect(bookMove({ weight: 65535, games: 24, losses: 0 }, 'clean').reason).toBe('rare');
  expect(bookMove({ weight: 1, games: 25, losses: 17 }, 'clean').status).toBe('book');
  expect(bookMove({ weight: 65535, games: 100, losses: 69 }, 'clean').status).toBe('book');
  expect(bookMove({ weight: 65535, games: 100, losses: 70 }, 'clean').reason).toBe('high-loss-rate');
  expect(bookMove({ weight: 65535, games: 100, losses: 100 }, 'clean').reason).toBe('high-loss-rate');
});

it('uses the shared quality gate even for popular moves with good results', () => {
  const evidence = { weight: 65535, games: 1000, losses: 1 };
  for (const quality of ['mistake', 'blunder'] as const)
    expect(bookMove(evidence, quality)).toMatchObject({ status: 'outside', reason: 'quality' });
  expect(bookMove(evidence, 'clean').status).toBe('book');
});

it('does not interpret a scaled Polyglot weight as a count or infer missing results', () => {
  for (const evidence of [
    { weight: 65535 }, { weight: 65535, games: 100 },
    { weight: 1, games: 100, losses: -1 }, { weight: 1, games: 100, losses: 101 },
    { weight: 1, games: NaN, losses: 0 }, { weight: 1, games: 100, losses: Infinity },
  ]) expect(bookMove(evidence, 'clean')).toMatchObject({ status: 'candidate', reason: 'missing-statistics' });
  expect(bookMove(undefined, 'clean').reason).toBe('absent');
  expect(bookMove({ weight: 0 }, 'clean').reason).toBe('absent');
});
