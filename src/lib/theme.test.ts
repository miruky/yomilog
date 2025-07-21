import { describe, expect, it } from 'vitest';
import {
  isThemeSetting,
  loadThemeSetting,
  nextTheme,
  resolveTheme,
  saveThemeSetting,
  themeLabel,
} from './theme';

describe('isThemeSetting', () => {
  it('3値だけを受け入れる', () => {
    expect(isThemeSetting('auto')).toBe(true);
    expect(isThemeSetting('light')).toBe(true);
    expect(isThemeSetting('dark')).toBe(true);
    expect(isThemeSetting('sepia')).toBe(false);
    expect(isThemeSetting(null)).toBe(false);
  });
});

describe('resolveTheme', () => {
  it('autoはOS設定に従う', () => {
    expect(resolveTheme('auto', true)).toBe('dark');
    expect(resolveTheme('auto', false)).toBe('light');
  });

  it('明示指定はOS設定を無視する', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('nextTheme', () => {
  it('auto→light→dark→autoと巡回する', () => {
    expect(nextTheme('auto')).toBe('light');
    expect(nextTheme('light')).toBe('dark');
    expect(nextTheme('dark')).toBe('auto');
  });
});

describe('themeLabel', () => {
  it('設定ごとの読み上げラベルを返す', () => {
    expect(themeLabel('auto')).toContain('自動');
    expect(themeLabel('light')).toContain('ライト');
    expect(themeLabel('dark')).toContain('ダーク');
  });
});

describe('loadThemeSetting / saveThemeSetting', () => {
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

  it('未保存ならautoを返す', () => {
    expect(loadThemeSetting(memoryStorage())).toBe('auto');
  });

  it('保存した値を読み戻す', () => {
    const s = memoryStorage();
    saveThemeSetting(s, 'dark');
    expect(loadThemeSetting(s)).toBe('dark');
  });

  it('壊れた値はautoへ丸める', () => {
    const s = memoryStorage();
    s.setItem('yomilog:theme', 'neon');
    expect(loadThemeSetting(s)).toBe('auto');
  });
});
