import { describe, expect, it } from 'vitest';
import { demoEntries } from './demo';
import { isValidDate } from './log';

describe('demoEntries', () => {
  const today = '2026-06-13';
  const entries = demoEntries(today);

  it('同じ日付からは毎回同じデータを返す', () => {
    expect(demoEntries(today)).toEqual(entries);
  });

  it('全件が妥当な日付と正のページ数を持つ', () => {
    expect(entries.length).toBeGreaterThan(100);
    for (const e of entries) {
      expect(isValidDate(e.date)).toBe(true);
      expect(e.pages).toBeGreaterThan(0);
      expect(e.title).not.toBe('');
    }
  });

  it('期間は指定日から過去1年に収まる', () => {
    const dates = entries.map((e) => e.date).sort();
    expect((dates[0] ?? '') >= '2025-06-14').toBe(true);
    expect((dates[dates.length - 1] ?? '') <= today).toBe(true);
  });

  it('読了の記録と複数のジャンルを含む', () => {
    expect(entries.some((e) => e.finished === true)).toBe(true);
    expect(new Set(entries.map((e) => e.genre)).size).toBeGreaterThanOrEqual(4);
  });
});
