import { describe, expect, it } from 'vitest';
import { german, translate } from './i18n';

describe('English and German messages', () => {
  it('keeps the same interpolation fields in both languages', () => {
    const fields = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map(match => match[1]).sort();
    for (const [english, translation] of Object.entries(german)) {
      expect(translation.trim()).not.toBe('');
      expect(fields(translation)).toEqual(fields(english));
    }
  });
  it('formats dynamic values using the selected locale', () => {
    expect(translate('de', 'Downloading engine · {received} MB', { received: 3.5 })).toBe('Engine wird heruntergeladen · 3,5 MB');
    expect(translate('en', 'Ply {ply} / {total}', { ply: 5, total: 137 })).toBe('Ply 5 / 137');
  });
});
