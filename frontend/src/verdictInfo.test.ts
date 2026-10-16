import { describe, it, expect } from 'vitest';
import { VERDICT_INFO, DISCLAIMER, reasonText } from './verdictInfo';

const ALL = ['verified','suspicious','unverified','invalid','expired','recalled','confirmed_counterfeit'];

describe('verdict copy', () => {
  it('covers every verdict the API can return', () => {
    for (const v of ALL) expect(VERDICT_INFO[v as keyof typeof VERDICT_INFO]).toBeTruthy();
  });
  it('never claims the product is genuine', () => {
    for (const v of Object.values(VERDICT_INFO)) {
      expect(`${v.title} ${v.summary}`.toLowerCase()).not.toMatch(/\bgenuine\b|\bauthentic\b|100%/);
    }
    expect(DISCLAIMER).toMatch(/does not prove/);
  });
  it('reasonText handles strings and objects', () => {
    expect(reasonText('a')).toBe('a');
    expect(reasonText({ message: 'b' })).toBe('b');
    expect(reasonText(null)).toBe('');
  });
});