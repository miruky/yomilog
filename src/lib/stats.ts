// 読書記録の集計。日付はすべてYYYY-MM-DDの文字列で受け取り、
// タイムゾーンの影響を避けるためUTCで日数計算する。

import type { Entry } from './log';

export interface MonthPages {
  month: string; // YYYY-MM
  pages: number;
  entries: number;
}

export interface GenreShare {
  genre: string;
  pages: number;
  ratio: number; // 0..1
}

export interface Summary {
  monthPages: number;
  yearPages: number;
  totalPages: number;
  finishedCount: number;
  activeDaysInMonth: number;
  currentStreak: number;
  longestStreak: number;
}

function toUtc(date: string): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 1);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

const DAY_MS = 86_400_000;

// todayを末尾に、過去n個月のキーを昇順で返す。
export function lastMonths(today: string, n: number): string[] {
  const [y, m] = today.split('-').map(Number);
  const months: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1 - i, 1));
    months.push(dt.toISOString().slice(0, 7));
  }
  return months;
}

export function monthlyPages(entries: Entry[], today: string, n = 12): MonthPages[] {
  const byMonth = new Map<string, { pages: number; entries: number }>();
  for (const e of entries) {
    const key = e.date.slice(0, 7);
    const cur = byMonth.get(key) ?? { pages: 0, entries: 0 };
    cur.pages += e.pages;
    cur.entries += 1;
    byMonth.set(key, cur);
  }
  return lastMonths(today, n).map((month) => ({
    month,
    pages: byMonth.get(month)?.pages ?? 0,
    entries: byMonth.get(month)?.entries ?? 0,
  }));
}

// ページ数の多い順。top件を超えるぶんは「その他」へまとめる。
export function genreShare(entries: Entry[], top = 6): GenreShare[] {
  const byGenre = new Map<string, number>();
  for (const e of entries) {
    byGenre.set(e.genre, (byGenre.get(e.genre) ?? 0) + e.pages);
  }
  const total = [...byGenre.values()].reduce((a, b) => a + b, 0);
  if (total === 0) return [];
  const sorted = [...byGenre.entries()].sort((a, b) => b[1] - a[1]);
  const head = sorted.slice(0, top);
  const restPages = sorted.slice(top).reduce((a, [, p]) => a + p, 0);
  const shares = head.map(([genre, pages]) => ({
    genre,
    pages,
    ratio: pages / total,
  }));
  if (restPages > 0) {
    shares.push({ genre: 'その他', pages: restPages, ratio: restPages / total });
  }
  return shares;
}

export function streaks(entries: Entry[], today: string): { current: number; longest: number } {
  const days = [...new Set(entries.map((e) => e.date))].sort();
  if (days.length === 0) return { current: 0, longest: 0 };

  let longest = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    const prev = days[i - 1] ?? '';
    const cur = days[i] ?? '';
    if (toUtc(cur) - toUtc(prev) === DAY_MS) {
      run++;
      longest = Math.max(longest, run);
    } else {
      run = 1;
    }
  }

  // 今日まだ記録がなくても、昨日まで続いていれば継続中とみなす。
  const daySet = new Set(days);
  let cursor = daySet.has(today) ? today : fromUtc(toUtc(today) - DAY_MS);
  let current = 0;
  while (daySet.has(cursor)) {
    current++;
    cursor = fromUtc(toUtc(cursor) - DAY_MS);
  }
  return { current, longest };
}

export function summarize(entries: Entry[], today: string): Summary {
  const month = today.slice(0, 7);
  const year = today.slice(0, 4);
  let monthPages = 0;
  let yearPages = 0;
  let totalPages = 0;
  let finishedCount = 0;
  const monthDays = new Set<string>();
  for (const e of entries) {
    totalPages += e.pages;
    if (e.date.startsWith(year)) yearPages += e.pages;
    if (e.date.startsWith(month)) {
      monthPages += e.pages;
      monthDays.add(e.date);
    }
    if (e.finished) finishedCount++;
  }
  const { current, longest } = streaks(entries, today);
  return {
    monthPages,
    yearPages,
    totalPages,
    finishedCount,
    activeDaysInMonth: monthDays.size,
    currentStreak: current,
    longestStreak: longest,
  };
}
