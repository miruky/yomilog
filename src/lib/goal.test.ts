import { describe, expect, it } from 'vitest';
import {
  dayOfYear,
  loadGoals,
  monthProgress,
  progress,
  projectYear,
  saveGoals,
  yearProgress,
} from './goal';

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
    clear: () => map.clear(),
    key: () => null,
    length: 0,
  } as Storage;
}

describe('progress', () => {
  it('未設定(target=0)は比率0・未達成', () => {
    const p = progress(0, 120, 10);
    expect(p.ratio).toBe(0);
    expect(p.achieved).toBe(false);
    expect(p.remaining).toBe(0);
  });

  it('途中経過の比率と必要ペースを返す', () => {
    const p = progress(600, 300, 10);
    expect(p.ratio).toBeCloseTo(0.5);
    expect(p.remaining).toBe(300);
    expect(p.perDayNeeded).toBe(30);
    expect(p.achieved).toBe(false);
  });

  it('達成時は比率1で頭打ち・残り0', () => {
    const p = progress(600, 800, 5);
    expect(p.ratio).toBe(1);
    expect(p.remaining).toBe(0);
    expect(p.perDayNeeded).toBe(0);
    expect(p.achieved).toBe(true);
  });

  it('残り日数0でも必要ページは破綻しない', () => {
    const p = progress(600, 100, 0);
    expect(p.perDayNeeded).toBe(0);
    expect(p.daysLeft).toBe(0);
  });
});

describe('monthProgress', () => {
  it('月末までの残り日数を当日込みで数える', () => {
    // 2月は28日。2/20時点で残り9日(20〜28)。
    const p = monthProgress(900, 450, '2026-02-20');
    expect(p.daysLeft).toBe(9);
    expect(p.perDayNeeded).toBe(50);
  });
});

describe('yearProgress / dayOfYear', () => {
  it('元日は通算1日目', () => {
    expect(dayOfYear('2026-01-01')).toBe(1);
  });

  it('閏年は366日で残りを数える', () => {
    // 2024-12-31は通算366日目、残り1日。
    const p = yearProgress(10000, 9000, '2024-12-31');
    expect(p.daysLeft).toBe(1);
  });
});

describe('projectYear', () => {
  it('日割りペースを年末まで伸ばす', () => {
    // 100日で1000ページ→年365日で3650ページ。
    expect(projectYear(1000, '2026-04-10')).toBe(3650);
  });

  it('記録ゼロは0を返す', () => {
    expect(projectYear(0, '2026-06-19')).toBe(0);
  });
});

describe('loadGoals / saveGoals', () => {
  it('未保存は0を返す', () => {
    expect(loadGoals(memoryStorage())).toEqual({ monthly: 0, yearly: 0 });
  });

  it('保存値を読み戻し、負や非数は0へ丸める', () => {
    const s = memoryStorage();
    saveGoals(s, { monthly: 500, yearly: -3 });
    expect(loadGoals(s)).toEqual({ monthly: 500, yearly: 0 });
  });

  it('壊れたJSONは0で復帰する', () => {
    const s = memoryStorage();
    s.setItem('yomilog:goals', '{broken');
    expect(loadGoals(s)).toEqual({ monthly: 0, yearly: 0 });
  });
});
