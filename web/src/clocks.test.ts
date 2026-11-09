import { expect, it } from 'vitest';
import { lichessClocks } from '../../shared/clocks';

it('aligns Lichess move clocks with or without a terminal unplayed-turn sample', () => {
  const moves = [60003, 60003, 59835, 59659];
  expect(lichessClocks(moves, 4)).toEqual([600.03, 600.03, 598.35, 596.59]);
  for (const terminal of [0, 59523]) {
    expect(lichessClocks([...moves, terminal], 4)).toEqual(lichessClocks(moves, 4));
  }
});

it('does not guess alignment for truncated or excessively long histories, or fabricate missing samples', () => {
  expect(lichessClocks(undefined, 4)).toBeUndefined();
  for (const raw of [[60000, 59000, 58000], [60000, 59000, 58000, 57000, 56000, 0]])
    expect(lichessClocks(raw, 4)).toEqual([null, null, null, null]);
  expect(lichessClocks([60000, null, -1, '59000', 0], 4)).toEqual([600, null, null, null]);
});
