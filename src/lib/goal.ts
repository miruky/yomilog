// 読書目標とペースの計算。目標は「今月に読むページ数」と「今年に読むページ数」の
// 2本立てで、0は未設定を表す。日数はYYYY-MM-DD文字列とUTCで数える。

export interface Goals {
  monthly: number;
  yearly: number;
}

export interface GoalProgress {
  target: number;
  current: number;
  ratio: number; // 0..1。targetが0なら0。
  remaining: number; // 目標までの残りページ(達成済みは0)
  daysLeft: number; // 期間末までの残り日数(当日を含む)
  perDayNeeded: number; // 残り日数で目標へ届くのに必要な1日あたりページ
  achieved: boolean;
}

const STORAGE_KEY = 'yomilog:goals';
const MAX_GOAL = 1_000_000;

function clampGoal(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 0;
  return Math.min(MAX_GOAL, Math.round(value));
}

export function loadGoals(storage: Pick<Storage, 'getItem'>): Goals {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw === null) return { monthly: 0, yearly: 0 };
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    return { monthly: clampGoal(data.monthly), yearly: clampGoal(data.yearly) };
  } catch {
    return { monthly: 0, yearly: 0 };
  }
}

export function saveGoals(storage: Pick<Storage, 'setItem'>, goals: Goals): void {
  storage.setItem(
    STORAGE_KEY,
    JSON.stringify({ monthly: clampGoal(goals.monthly), yearly: clampGoal(goals.yearly) }),
  );
}

function daysInMonth(year: number, month1: number): number {
  return new Date(Date.UTC(year, month1, 0)).getUTCDate();
}

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function progress(target: number, current: number, daysLeft: number): GoalProgress {
  const safeTarget = clampGoal(target);
  const remaining = Math.max(0, safeTarget - current);
  const achieved = safeTarget > 0 && current >= safeTarget;
  const perDayNeeded =
    remaining === 0 || daysLeft <= 0 ? 0 : Math.ceil(remaining / Math.max(1, daysLeft));
  return {
    target: safeTarget,
    current,
    ratio: safeTarget === 0 ? 0 : Math.min(1, current / safeTarget),
    remaining,
    daysLeft: Math.max(0, daysLeft),
    perDayNeeded,
    achieved,
  };
}

export function monthProgress(target: number, monthPages: number, today: string): GoalProgress {
  const [y, m, d] = today.split('-').map(Number);
  const total = daysInMonth(y ?? 2026, m ?? 1);
  const daysLeft = total - (d ?? 1) + 1;
  return progress(target, monthPages, daysLeft);
}

export function yearProgress(target: number, yearPages: number, today: string): GoalProgress {
  const [y] = today.split('-').map(Number);
  const total = isLeap(y ?? 2026) ? 366 : 365;
  const passed = dayOfYear(today);
  return progress(target, yearPages, total - passed + 1);
}

export function dayOfYear(today: string): number {
  const [y, m, d] = today.split('-').map(Number);
  const start = Date.UTC(y ?? 2026, 0, 1);
  const now = Date.UTC(y ?? 2026, (m ?? 1) - 1, d ?? 1);
  return Math.round((now - start) / 86_400_000) + 1;
}

// 年初からの日割りペースを年末まで伸ばした予測ページ数。
export function projectYear(yearPages: number, today: string): number {
  const [y] = today.split('-').map(Number);
  const total = isLeap(y ?? 2026) ? 366 : 365;
  const passed = dayOfYear(today);
  if (passed <= 0) return 0;
  return Math.round((yearPages / passed) * total);
}
