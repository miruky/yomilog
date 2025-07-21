import { describe, expect, it } from 'vitest';
import { arcPath, barChart, donutChart, escapeXml, niceMax } from './chart';

describe('niceMax', () => {
  it('1・2・2.5・5の系列へ切り上げる', () => {
    expect(niceMax(7)).toBe(10);
    expect(niceMax(23)).toBe(25);
    expect(niceMax(180)).toBe(200);
    expect(niceMax(420)).toBe(500);
    expect(niceMax(1200)).toBe(2000);
  });

  it('ちょうどの値はそのまま使う', () => {
    expect(niceMax(100)).toBe(100);
    expect(niceMax(250)).toBe(250);
  });

  it('0以下と1未満は1にする', () => {
    expect(niceMax(0)).toBe(1);
    expect(niceMax(0.4)).toBe(1);
  });
});

describe('barChart', () => {
  const data = [
    { label: '4月', value: 120 },
    { label: '5月', value: 0 },
    { label: '6月', value: 260 },
  ];

  it('データ件数ぶんの棒を描く', () => {
    const svg = barChart(data, { unit: 'ページ' });
    expect(svg.match(/class="bar"/g)).toHaveLength(3);
    expect(svg).toContain('viewBox="0 0 600 220"');
  });

  it('値0の棒は高さ0になる', () => {
    const svg = barChart(data);
    expect(svg).toContain('height="0"');
  });

  it('合計をaria-labelに含める', () => {
    expect(barChart(data, { unit: 'ページ' })).toContain('合計380ページ');
  });

  it('ラベルをエスケープする', () => {
    const svg = barChart([{ label: '<6月>', value: 1 }]);
    expect(svg).toContain('&lt;6月&gt;');
    expect(svg).not.toContain('<6月>');
  });

  it('全て0でも壊れない', () => {
    const svg = barChart([{ label: '6月', value: 0 }]);
    expect(svg).toContain('class="bar"');
  });
});

describe('arcPath', () => {
  it('半周以下はlarge-arcフラグ0', () => {
    const d = arcPath(100, 100, 90, 60, 0, Math.PI / 2);
    expect(d).toContain('A 90 90 0 0 1');
  });

  it('半周を超えるとlarge-arcフラグ1', () => {
    const d = arcPath(100, 100, 90, 60, 0, Math.PI * 1.5);
    expect(d).toContain('A 90 90 0 1 1');
  });

  it('12時方向から始まる', () => {
    const d = arcPath(100, 100, 90, 60, 0, Math.PI / 2);
    expect(d.startsWith('M 100 10')).toBe(true);
  });
});

describe('donutChart', () => {
  it('区分ごとのパスを描き、割合をtitleに入れる', () => {
    const svg = donutChart([
      { label: '小説', value: 75 },
      { label: '技術書', value: 25 },
    ]);
    expect(svg.match(/<path/g)).toHaveLength(2);
    expect(svg).toContain('小説: 75%');
  });

  it('1区分だけのときは環として描く', () => {
    const svg = donutChart([{ label: '小説', value: 10 }]);
    expect(svg).toContain('<circle');
    expect(svg).toContain('小説: 100%');
  });

  it('中央ラベルを描ける', () => {
    const svg = donutChart([{ label: 'A', value: 1 }], {
      centerLabel: '1200',
      centerSub: 'ページ',
    });
    expect(svg).toContain('1200');
    expect(svg).toContain('ページ');
  });

  it('空データでもaria-labelを付けて返す', () => {
    expect(donutChart([])).toContain('データなし');
  });
});

describe('escapeXml', () => {
  it('特殊文字を実体参照にする', () => {
    expect(escapeXml('<&">\'')).toBe('&lt;&amp;&quot;&gt;&apos;');
  });
});
