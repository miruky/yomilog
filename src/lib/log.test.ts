import { describe, expect, it } from 'vitest';
import type { StorageLike } from './log';
import { isValidDate, LogError, ReadingLog } from './log';

function memoryStorage(): StorageLike {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
  };
}

const base = { date: '2026-06-10', title: 'こころ', pages: 40, genre: '小説' };

describe('isValidDate', () => {
  it('正しい日付を受理する', () => {
    expect(isValidDate('2026-06-13')).toBe(true);
    expect(isValidDate('2024-02-29')).toBe(true);
  });

  it('存在しない日付と形式違いを弾く', () => {
    expect(isValidDate('2026-02-30')).toBe(false);
    expect(isValidDate('2026-13-01')).toBe(false);
    expect(isValidDate('2026/06/13')).toBe(false);
    expect(isValidDate('20260613')).toBe(false);
  });
});

describe('追加と検証', () => {
  it('追加した記録を取得できる', () => {
    const log = new ReadingLog(memoryStorage());
    const entry = log.add(base);
    expect(log.get(entry.id)?.title).toBe('こころ');
    expect(entry.finished).toBe(false);
  });

  it('ジャンル未指定は「その他」になる', () => {
    const log = new ReadingLog(memoryStorage());
    expect(log.add({ ...base, genre: undefined }).genre).toBe('その他');
    expect(log.add({ ...base, genre: '  ' }).genre).toBe('その他');
  });

  it('書名が空なら拒否する', () => {
    const log = new ReadingLog(memoryStorage());
    expect(() => log.add({ ...base, title: ' ' })).toThrow('書名');
  });

  it('不正な日付を拒否する', () => {
    const log = new ReadingLog(memoryStorage());
    expect(() => log.add({ ...base, date: '2026-02-30' })).toThrow(LogError);
  });

  it('0以下・小数・過大なページ数を拒否する', () => {
    const log = new ReadingLog(memoryStorage());
    expect(() => log.add({ ...base, pages: 0 })).toThrow(LogError);
    expect(() => log.add({ ...base, pages: 12.5 })).toThrow(LogError);
    expect(() => log.add({ ...base, pages: 3001 })).toThrow(LogError);
  });
});

describe('更新と削除', () => {
  it('記録を書き換えられる', () => {
    const log = new ReadingLog(memoryStorage());
    const entry = log.add(base);
    log.update(entry.id, { ...base, pages: 60, finished: true });
    expect(log.get(entry.id)?.pages).toBe(60);
    expect(log.get(entry.id)?.finished).toBe(true);
  });

  it('存在しないIDはLogErrorになる', () => {
    const log = new ReadingLog(memoryStorage());
    expect(() => log.update('none', base)).toThrow(LogError);
    expect(() => log.remove('none')).toThrow(LogError);
  });

  it('削除とすべて消すが効く', () => {
    const log = new ReadingLog(memoryStorage());
    const a = log.add(base);
    log.add({ ...base, date: '2026-06-11' });
    log.remove(a.id);
    expect(log.count()).toBe(1);
    log.clear();
    expect(log.count()).toBe(0);
  });
});

describe('並び順と補完', () => {
  it('all()は日付の新しい順に返す', () => {
    const log = new ReadingLog(memoryStorage());
    log.add({ ...base, date: '2026-06-01' });
    log.add({ ...base, date: '2026-06-12', title: '草枕' });
    expect(log.all().map((e) => e.date)).toEqual(['2026-06-12', '2026-06-01']);
  });

  it('書名とジャンルの候補を重複なしで返す', () => {
    const log = new ReadingLog(memoryStorage());
    log.add(base);
    log.add({ ...base, date: '2026-06-11' });
    log.add({ ...base, date: '2026-06-12', title: '草枕', genre: 'エッセイ' });
    expect(log.knownTitles()).toEqual(['草枕', 'こころ']);
    expect(log.knownGenres()).toEqual(['エッセイ', '小説']);
  });
});

describe('永続化と入出力', () => {
  it('同じストレージから作り直しても台帳が再現される', () => {
    const storage = memoryStorage();
    new ReadingLog(storage).add(base);
    expect(new ReadingLog(storage).count()).toBe(1);
  });

  it('壊れた保存データは無視する', () => {
    const storage = memoryStorage();
    storage.setItem('yomilog:v1', '{bad');
    expect(new ReadingLog(storage).count()).toBe(0);
  });

  it('エクスポートを別の台帳へ取り込める', () => {
    const log = new ReadingLog(memoryStorage());
    log.add(base);
    log.add({ ...base, date: '2026-06-11' });
    const other = new ReadingLog(memoryStorage());
    expect(other.importJson(log.exportJson())).toEqual({
      added: 2,
      skipped: 0,
    });
  });

  it('同じIDの再インポートは読み飛ばす', () => {
    const log = new ReadingLog(memoryStorage());
    log.add(base);
    expect(log.importJson(log.exportJson())).toEqual({ added: 0, skipped: 1 });
  });

  it('不正な要素は数えながら読み飛ばす', () => {
    const log = new ReadingLog(memoryStorage());
    const json = JSON.stringify({
      entries: [
        { date: '2026-06-10', title: '正しい記録', pages: 10 },
        { date: '2026-06-10', title: 'ページ数なし' },
        { date: 'いつか', title: '日付が変', pages: 10 },
      ],
    });
    expect(log.importJson(json)).toEqual({ added: 1, skipped: 2 });
  });

  it('形式違いのJSONはLogErrorになる', () => {
    const log = new ReadingLog(memoryStorage());
    expect(() => log.importJson('not json')).toThrow(LogError);
    expect(() => log.importJson('{"x":1}')).toThrow('エクスポート形式');
  });
});
