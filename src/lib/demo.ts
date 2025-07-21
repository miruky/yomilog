// 空の状態でも画面の意味が伝わるように、過去1年ぶんの読書記録を合成する。
// 乱数は固定シードなので、何度入れても同じデモデータになる。

import type { NewEntry } from './log';

interface DemoBook {
  title: string;
  genre: string;
  pages: number;
}

const BOOKS: DemoBook[] = [
  { title: '吾輩は猫である', genre: '小説', pages: 480 },
  { title: 'こころ', genre: '小説', pages: 280 },
  { title: '銀河鉄道の夜', genre: '小説', pages: 160 },
  { title: '人間失格', genre: '小説', pages: 180 },
  { title: '山月記・李陵', genre: '小説', pages: 200 },
  { title: '雪原の灯台', genre: 'ミステリ', pages: 360 },
  { title: '終電の消えた駅', genre: 'ミステリ', pages: 320 },
  { title: '時間結晶の庭', genre: 'SF', pages: 400 },
  { title: '第七大陸の漂流者', genre: 'SF', pages: 340 },
  { title: '型システム入門の前に', genre: '技術書', pages: 300 },
  { title: 'リファクタリングの作法', genre: '技術書', pages: 380 },
  { title: '分散システムの歩き方', genre: '技術書', pages: 420 },
  { title: '習慣の解剖学', genre: 'ノンフィクション', pages: 260 },
  { title: '深海とプランクトン', genre: 'ノンフィクション', pages: 240 },
  { title: '台所からの随筆', genre: 'エッセイ', pages: 200 },
  { title: '街道の昼食', genre: 'エッセイ', pages: 180 },
  { title: '城郭と街道の中世', genre: '歴史', pages: 320 },
];

// mulberry32。依存を増やさず再現可能な乱数を得る。
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DAY_MS = 86_400_000;

export function demoEntries(today: string, days = 365): NewEntry[] {
  const random = rng(20260613);
  const [y, m, d] = today.split('-').map(Number);
  const end = Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1);
  const entries: NewEntry[] = [];

  let book = BOOKS[0] as DemoBook;
  let remaining = book.pages;
  let bookIndex = 0;

  for (let i = days - 1; i >= 0; i--) {
    // 平日よりも週末に読む傾向を持たせ、読まない日も一定割合つくる。
    const date = new Date(end - i * DAY_MS).toISOString().slice(0, 10);
    const weekday = new Date(end - i * DAY_MS).getUTCDay();
    const readChance = weekday === 0 || weekday === 6 ? 0.78 : 0.55;
    if (random() > readChance) continue;

    const pages = Math.min(remaining, 15 + Math.floor(random() * 70));
    remaining -= pages;
    const finished = remaining === 0;
    entries.push({ date, title: book.title, genre: book.genre, pages, finished });

    if (finished) {
      bookIndex = (bookIndex + 1 + Math.floor(random() * 3)) % BOOKS.length;
      book = BOOKS[bookIndex] as DemoBook;
      remaining = book.pages;
    }
  }
  return entries;
}
