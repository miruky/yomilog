// 記録の書き出し。JSONは引っ越し用にlog.tsが持ち、ここは人が読む/表計算で
// 開くための形式(CSV・Markdown)を担う。いずれも純粋関数。

import type { Entry } from './log';

function csvCell(value: string): string {
  // カンマ・引用符・改行を含むセルはRFC 4180に従い引用符で囲む。
  if (/[",\r\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv(entries: Entry[]): string {
  const header = ['日付', '書名', 'ジャンル', 'ページ', '読了'];
  const rows = entries.map((e) =>
    [e.date, e.title, e.genre, String(e.pages), e.finished ? 'はい' : ''].map(csvCell).join(','),
  );
  // Excelでの文字化けを避けるためBOMを先頭に付ける。
  return '﻿' + [header.join(','), ...rows].join('\r\n') + '\r\n';
}

function mdCell(value: string): string {
  return value.replace(/\|/g, '\\|');
}

export function toMarkdown(entries: Entry[]): string {
  const lines = [
    '| 日付 | 書名 | ジャンル | ページ | 読了 |',
    '| --- | --- | --- | ---: | :---: |',
  ];
  for (const e of entries) {
    lines.push(
      `| ${e.date} | ${mdCell(e.title)} | ${mdCell(e.genre)} | ${e.pages} | ${e.finished ? '○' : ''} |`,
    );
  }
  return lines.join('\n') + '\n';
}
