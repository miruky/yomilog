import { describe, expect, it } from 'vitest';
import type { Entry } from './log';
import {
  bookSummaries,
  dailyPages,
  genreShare,
  lastMonths,
  monthlyPages,
  streaks,
  summarize,
} from './stats';

let seq = 0;
function entry(date: string, pages: number, genre = '小説', finished = false): Entry {
  return { id: `t${seq++}`, date, title: '本', pages, genre, finished };
}

describe('lastMonths', () => {
  it('当月を末尾に過去n個月を昇順で返す', () => {
    expect(lastMonths('2026-06-13', 3)).toEqual(['2026-04', '2026-05', '2026-06']);
  });

  it('年境界をまたぐ', () => {
    expect(lastMonths('2026-02-01', 4)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });
});

describe('monthlyPages', () => {
  it('月ごとに合計し、記録のない月は0で埋める', () => {
    const entries = [entry('2026-06-01', 30), entry('2026-06-15', 20), entry('2026-04-10', 50)];
    const result = monthlyPages(entries, '2026-06-13', 3);
    expect(result).toEqual([
      { month: '2026-04', pages: 50, entries: 1 },
      { month: '2026-05', pages: 0, entries: 0 },
      { month: '2026-06', pages: 50, entries: 2 },
    ]);
  });

  it('範囲外の古い記録は数えない', () => {
    const result = monthlyPages([entry('2020-01-01', 100)], '2026-06-13', 12);
    expect(result.every((m) => m.pages === 0)).toBe(true);
  });
});

describe('dailyPages', () => {
  it('当日を末尾に日別合計を昇順で返す', () => {
    const entries = [entry('2026-06-13', 30), entry('2026-06-13', 20), entry('2026-06-11', 40)];
    const result = dailyPages(entries, '2026-06-13', 3);
    expect(result).toEqual([
      { date: '2026-06-11', pages: 40, weekday: 4 },
      { date: '2026-06-12', pages: 0, weekday: 5 },
      { date: '2026-06-13', pages: 50, weekday: 6 },
    ]);
  });

  it('既定では53週ぶんの日数を返す', () => {
    expect(dailyPages([], '2026-06-13').length).toBe(371);
  });

  it('範囲外の記録は数えない', () => {
    const result = dailyPages([entry('2000-01-01', 100)], '2026-06-13', 7);
    expect(result.every((d) => d.pages === 0)).toBe(true);
  });
});

describe('genreShare', () => {
  it('ページ数の多い順に比率を返す', () => {
    const shares = genreShare([
      entry('2026-06-01', 30, '小説'),
      entry('2026-06-02', 60, '技術書'),
      entry('2026-06-03', 10, 'SF'),
    ]);
    expect(shares.map((s) => s.genre)).toEqual(['技術書', '小説', 'SF']);
    expect(shares[0]?.ratio).toBeCloseTo(0.6);
  });

  it('上位を超えるジャンルは「その他」へまとめる', () => {
    const entries = ['A', 'B', 'C', 'D'].map((g, i) => entry('2026-06-01', 40 - i * 10, g));
    const shares = genreShare(entries, 2);
    expect(shares.map((s) => s.genre)).toEqual(['A', 'B', 'その他']);
    expect(shares[2]?.pages).toBe(30);
  });

  it('記録がなければ空配列', () => {
    expect(genreShare([])).toEqual([]);
  });
});

describe('bookSummaries', () => {
  function e(date: string, title: string, pages: number, finished = false, genre = '小説'): Entry {
    return { id: `b${seq++}`, date, title, pages, genre, finished };
  }

  it('書名ごとにページと回数を集計する', () => {
    const r = bookSummaries([
      e('2026-06-01', 'こころ', 40),
      e('2026-06-03', 'こころ', 60, true),
      e('2026-06-02', '人間失格', 30),
    ]);
    const kokoro = r.find((b) => b.title === 'こころ');
    expect(kokoro?.pages).toBe(100);
    expect(kokoro?.sessions).toBe(2);
    expect(kokoro?.finished).toBe(true);
    expect(kokoro?.firstDate).toBe('2026-06-01');
    expect(kokoro?.lastDate).toBe('2026-06-03');
  });

  it('最後に読んだ日の新しい順に並べる', () => {
    const r = bookSummaries([
      e('2026-06-01', 'A', 10),
      e('2026-06-05', 'B', 10),
      e('2026-06-03', 'C', 10),
    ]);
    expect(r.map((b) => b.title)).toEqual(['B', 'C', 'A']);
  });

  it('ジャンルは直近の記録のものを採る', () => {
    const r = bookSummaries([
      e('2026-06-01', 'X', 10, false, '小説'),
      e('2026-06-04', 'X', 10, false, '技術書'),
    ]);
    expect(r[0]?.genre).toBe('技術書');
  });

  it('記録がなければ空配列', () => {
    expect(bookSummaries([])).toEqual([]);
  });
});

describe('streaks', () => {
  it('今日を含む連続日数を数える', () => {
    const entries = [entry('2026-06-11', 10), entry('2026-06-12', 10), entry('2026-06-13', 10)];
    expect(streaks(entries, '2026-06-13')).toEqual({ current: 3, longest: 3 });
  });

  it('今日が未記録でも昨日までの継続を保つ', () => {
    const entries = [entry('2026-06-11', 10), entry('2026-06-12', 10)];
    expect(streaks(entries, '2026-06-13').current).toBe(2);
  });

  it('途切れたら0、最長は過去の連続から取る', () => {
    const entries = [
      entry('2026-06-01', 10),
      entry('2026-06-02', 10),
      entry('2026-06-03', 10),
      entry('2026-06-10', 10),
    ];
    expect(streaks(entries, '2026-06-13')).toEqual({ current: 0, longest: 3 });
  });

  it('月境界をまたいで連続を数える', () => {
    const entries = [entry('2026-05-31', 10), entry('2026-06-01', 10)];
    expect(streaks(entries, '2026-06-01')).toEqual({ current: 2, longest: 2 });
  });

  it('同じ日の複数記録は1日と数える', () => {
    const entries = [entry('2026-06-13', 10), entry('2026-06-13', 20)];
    expect(streaks(entries, '2026-06-13')).toEqual({ current: 1, longest: 1 });
  });

  it('記録がなければすべて0', () => {
    expect(streaks([], '2026-06-13')).toEqual({ current: 0, longest: 0 });
  });
});

describe('summarize', () => {
  it('月間・年間・累計・読了数・活動日数をまとめる', () => {
    const entries = [
      entry('2026-06-01', 30),
      entry('2026-06-01', 20),
      entry('2026-05-20', 40, '小説', true),
      entry('2025-12-31', 100, '小説', true),
    ];
    const s = summarize(entries, '2026-06-13');
    expect(s.monthPages).toBe(50);
    expect(s.yearPages).toBe(90);
    expect(s.totalPages).toBe(190);
    expect(s.finishedCount).toBe(2);
    expect(s.activeDaysInMonth).toBe(1);
  });

  it('空の記録では全項目0', () => {
    const s = summarize([], '2026-06-13');
    expect(s.totalPages).toBe(0);
    expect(s.currentStreak).toBe(0);
  });
});
