// テーマの状態管理。設定値は3値(auto/light/dark)で、autoのときだけ
// OSの設定に従う。描画前にindex.htmlの先頭スクリプトが同じ規則でdata-theme
// を立てるため、ここでの解決規則を一致させてちらつきを防ぐ。

export type ThemeSetting = 'auto' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'yomilog:theme';
const ORDER: ThemeSetting[] = ['auto', 'light', 'dark'];

export function isThemeSetting(value: unknown): value is ThemeSetting {
  return value === 'auto' || value === 'light' || value === 'dark';
}

export function resolveTheme(setting: ThemeSetting, prefersDark: boolean): ResolvedTheme {
  if (setting === 'auto') return prefersDark ? 'dark' : 'light';
  return setting;
}

// auto → light → dark → auto の順に巡回する。
export function nextTheme(current: ThemeSetting): ThemeSetting {
  const i = ORDER.indexOf(current);
  return ORDER[(i + 1) % ORDER.length] ?? 'auto';
}

export function themeLabel(setting: ThemeSetting): string {
  switch (setting) {
    case 'light':
      return '表示: ライト';
    case 'dark':
      return '表示: ダーク';
    default:
      return '表示: 自動';
  }
}

export function loadThemeSetting(storage: Pick<Storage, 'getItem'>): ThemeSetting {
  const raw = storage.getItem(STORAGE_KEY);
  return isThemeSetting(raw) ? raw : 'auto';
}

export function saveThemeSetting(storage: Pick<Storage, 'setItem'>, setting: ThemeSetting): void {
  storage.setItem(STORAGE_KEY, setting);
}

// data-themeはautoのとき外し、明示指定のときだけ立てる。CSSは
// :root[data-theme='dark'] と prefers-color-scheme の両方を見る。
export function applyTheme(root: HTMLElement, setting: ThemeSetting): void {
  if (setting === 'auto') {
    root.removeAttribute('data-theme');
  } else {
    root.setAttribute('data-theme', setting);
  }
}
