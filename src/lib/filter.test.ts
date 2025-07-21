import { describe, expect, it } from 'vitest';
import { applyQuery, DEFAULT_QUERY, filterEntries, sortEntries } from './filter';
import type { Entry } from './log';

let seq = 0;
function entry(over: Partial<Entry>): Entry {
  return {
    id: `e${seq++}`,
    date: '2026-06-01',
    title: '本',
    pages: 30,
    genre: '小説',
    finished: false,
    ...over,
  };
}

const sample: Entry[] = [
  entry({ title: '銀河鉄道の夜', genre: 'SF', pages: 160, date: '2026-06-03', finished: true }),
  entry({ title: 'リファクタリング', genre: '技術書', pages: 380, date: '2026-06-01' }),
  entry({ title: 'こころ', genre: '小説', pages: 40, date: '2026-06-05' }),
];

describe('filterEntries', () => {
  it('書名・ジャンルの部分一致で絞る', () => {
    const r = filterEntries(sample, { ...DEFAULT_QUERY, text: '鉄道' });
    expect(r.map((e) => e.title)).toEqual(['銀河鉄道の夜']);
  });

  it('ジャンル指定で絞る', () => {
    const r = filterEntries(sample, { ...DEFAULT_QUERY, genre: '技術書' });
    expect(r).toHaveLength(1);
  });

  it('読了のみを絞る', () => {
    const r = filterEntries(sample, { ...DEFAULT_QUERY, finishedOnly: true });
    expect(r.map((e) => e.title)).toEqual(['銀河鉄道の夜']);
  });

  it('条件を満たさなければ空', () => {
    expect(filterEntries(sample, { ...DEFAULT_QUERY, text: '存在しない' })).toEqual([]);
  });
});

describe('sortEntries', () => {
  it('ページ数の昇順・降順', () => {
    expect(sortEntries(sample, 'pages', 'asc').map((e) => e.pages)).toEqual([40, 160, 380]);
    expect(sortEntries(sample, 'pages', 'desc').map((e) => e.pages)).toEqual([380, 160, 40]);
  });

  it('日付の新しい順', () => {
    expect(sortEntries(sample, 'date', 'desc').map((e) => e.date)).toEqual([
      '2026-06-05',
      '2026-06-03',
      '2026-06-01',
    ]);
  });

  it('元配列を変更しない', () => {
    const before = sample.map((e) => e.id);
    sortEntries(sample, 'pages', 'asc');
    expect(sample.map((e) => e.id)).toEqual(before);
  });
});

describe('applyQuery', () => {
  it('絞り込みと並べ替えを合成する', () => {
    const r = applyQuery(sample, {
      ...DEFAULT_QUERY,
      genre: '',
      sortKey: 'pages',
      sortDir: 'asc',
    });
    expect(r.map((e) => e.pages)).toEqual([40, 160, 380]);
  });
});
