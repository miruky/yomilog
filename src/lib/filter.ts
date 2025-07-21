// 一覧の絞り込みと並べ替え。表示用の派生でしかないので、元の配列は変更しない。

import type { Entry } from './log';

export type SortKey = 'date' | 'pages' | 'title';
export type SortDir = 'asc' | 'desc';

export interface ListQuery {
  text: string;
  genre: string; // 空なら全ジャンル
  finishedOnly: boolean;
  sortKey: SortKey;
  sortDir: SortDir;
}

export const DEFAULT_QUERY: ListQuery = {
  text: '',
  genre: '',
  finishedOnly: false,
  sortKey: 'date',
  sortDir: 'desc',
};

export function filterEntries(entries: Entry[], q: ListQuery): Entry[] {
  const needle = q.text.trim().toLowerCase();
  return entries.filter((e) => {
    if (q.finishedOnly && !e.finished) return false;
    if (q.genre !== '' && e.genre !== q.genre) return false;
    if (needle !== '') {
      const hay = `${e.title} ${e.genre}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

export function sortEntries(entries: Entry[], key: SortKey, dir: SortDir): Entry[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...entries].sort((a, b) => {
    let cmp: number;
    switch (key) {
      case 'pages':
        cmp = a.pages - b.pages;
        break;
      case 'title':
        cmp = a.title.localeCompare(b.title, 'ja');
        break;
      default:
        cmp = a.date.localeCompare(b.date);
    }
    // 同値は日付の新しい順で安定させる。
    if (cmp === 0) cmp = a.date.localeCompare(b.date);
    return cmp * sign;
  });
}

export function applyQuery(entries: Entry[], q: ListQuery): Entry[] {
  return sortEntries(filterEntries(entries, q), q.sortKey, q.sortDir);
}
