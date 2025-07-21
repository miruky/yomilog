import { describe, expect, it } from 'vitest';
import type { Entry } from './log';
import { toCsv, toMarkdown } from './exporters';

function entry(over: Partial<Entry>): Entry {
  return {
    id: 'x',
    date: '2026-06-13',
    title: 'こころ',
    pages: 40,
    genre: '小説',
    finished: false,
    ...over,
  };
}

describe('toCsv', () => {
  it('BOM・ヘッダ・行をCRLFで返す', () => {
    const csv = toCsv([entry({ pages: 40, finished: true })]);
    expect(csv.startsWith('﻿')).toBe(true);
    expect(csv).toContain('日付,書名,ジャンル,ページ,読了');
    expect(csv).toContain('2026-06-13,こころ,小説,40,はい');
    expect(csv.endsWith('\r\n')).toBe(true);
  });

  it('カンマや引用符を含むセルを引用符で囲む', () => {
    const csv = toCsv([entry({ title: '吾輩は"猫",である' })]);
    expect(csv).toContain('"吾輩は""猫"",である"');
  });

  it('空配列でもヘッダだけ返す', () => {
    const csv = toCsv([]);
    expect(csv).toContain('日付,書名,ジャンル,ページ,読了');
  });
});

describe('toMarkdown', () => {
  it('表形式で書き出し、読了は○で示す', () => {
    const md = toMarkdown([entry({ finished: true })]);
    expect(md).toContain('| 日付 | 書名 |');
    expect(md).toContain('| 2026-06-13 | こころ | 小説 | 40 | ○ |');
  });

  it('縦棒をエスケープする', () => {
    const md = toMarkdown([entry({ title: 'A|B' })]);
    expect(md).toContain('A\\|B');
  });
});
