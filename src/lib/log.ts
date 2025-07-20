// 読書記録の台帳。1件の記録は「ある日、ある本を何ページ読んだか」。
// 保存先は注入されたストレージで、UIにもネットワークにも依存しない。

export interface Entry {
  id: string;
  date: string; // YYYY-MM-DD
  title: string;
  pages: number;
  genre: string;
  finished: boolean; // この記録でその本を読み終えたか
}

export interface NewEntry {
  date: string;
  title: string;
  pages: number;
  genre?: string;
  finished?: boolean;
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface ImportResult {
  added: number;
  skipped: number;
}

export class LogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LogError';
  }
}

const STORAGE_KEY = 'yomilog:v1';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_PAGES = 3000;

function makeId(): string {
  const c = globalThis.crypto;
  if (c !== undefined && typeof c.randomUUID === 'function') {
    return c.randomUUID();
  }
  return 'e-' + Math.random().toString(36).slice(2, 12);
}

export function isValidDate(date: string): boolean {
  if (!DATE_RE.test(date)) return false;
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y ?? 0, (m ?? 1) - 1, d ?? 0));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === (m ?? 1) - 1 && dt.getUTCDate() === d;
}

function validate(input: NewEntry): void {
  if (input.title.trim() === '') throw new LogError('書名は必須です');
  if (!isValidDate(input.date)) {
    throw new LogError('日付はYYYY-MM-DD形式で指定してください');
  }
  if (!Number.isInteger(input.pages) || input.pages < 1) {
    throw new LogError('ページ数は1以上の整数で入力してください');
  }
  if (input.pages > MAX_PAGES) {
    throw new LogError(`ページ数は${MAX_PAGES}以下で入力してください`);
  }
}

function coerceEntry(value: unknown): Entry | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.title !== 'string' || v.title.trim() === '') return null;
  if (typeof v.date !== 'string' || !isValidDate(v.date)) return null;
  const pages = typeof v.pages === 'number' && Number.isFinite(v.pages) ? Math.round(v.pages) : 0;
  if (pages < 1 || pages > MAX_PAGES) return null;
  return {
    id: typeof v.id === 'string' && v.id !== '' ? v.id : makeId(),
    date: v.date,
    title: v.title,
    pages,
    genre: typeof v.genre === 'string' && v.genre !== '' ? v.genre : 'その他',
    finished: v.finished === true,
  };
}

export class ReadingLog {
  private items: Entry[] = [];

  constructor(private storage: StorageLike) {
    this.load();
  }

  private load(): void {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (raw === null) return;
    try {
      const data: unknown = JSON.parse(raw);
      const entries =
        typeof data === 'object' && data !== null
          ? (data as Record<string, unknown>).entries
          : null;
      if (!Array.isArray(entries)) return;
      this.items = entries.map(coerceEntry).filter((e): e is Entry => e !== null);
    } catch {
      // 壊れた保存データは読み飛ばし、空の台帳から始める。
    }
  }

  private save(): void {
    this.storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ app: 'yomilog', version: 1, entries: this.items }),
    );
  }

  // 新しい日付が先、同日内は後から付けた記録が先。
  all(): Entry[] {
    return [...this.items].sort((a, b) => b.date.localeCompare(a.date));
  }

  count(): number {
    return this.items.length;
  }

  get(id: string): Entry | null {
    return this.items.find((e) => e.id === id) ?? null;
  }

  add(input: NewEntry): Entry {
    validate(input);
    const entry: Entry = {
      id: makeId(),
      date: input.date,
      title: input.title.trim(),
      pages: input.pages,
      genre: (input.genre ?? '').trim() || 'その他',
      finished: input.finished ?? false,
    };
    this.items.push(entry);
    this.save();
    return entry;
  }

  update(id: string, input: NewEntry): Entry {
    const entry = this.get(id);
    if (entry === null) throw new LogError('対象の記録が見つかりません');
    validate(input);
    entry.date = input.date;
    entry.title = input.title.trim();
    entry.pages = input.pages;
    entry.genre = (input.genre ?? '').trim() || 'その他';
    entry.finished = input.finished ?? false;
    this.save();
    return entry;
  }

  remove(id: string): void {
    const before = this.items.length;
    this.items = this.items.filter((e) => e.id !== id);
    if (this.items.length === before) {
      throw new LogError('対象の記録が見つかりません');
    }
    this.save();
  }

  clear(): void {
    this.items = [];
    this.save();
  }

  // 入力補完用。新しい記録から順に重複なしで返す。
  knownTitles(limit = 30): string[] {
    return [...new Set(this.all().map((e) => e.title))].slice(0, limit);
  }

  knownGenres(): string[] {
    return [...new Set(this.all().map((e) => e.genre))];
  }

  exportJson(now: Date = new Date()): string {
    return JSON.stringify(
      {
        app: 'yomilog',
        version: 1,
        exportedAt: now.toISOString(),
        entries: this.items,
      },
      null,
      2,
    );
  }

  importJson(text: string): ImportResult {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new LogError('JSONとして読み取れないファイルです');
    }
    const entries =
      typeof data === 'object' && data !== null ? (data as Record<string, unknown>).entries : null;
    if (!Array.isArray(entries)) {
      throw new LogError('yomilogのエクスポート形式ではありません');
    }
    let added = 0;
    let skipped = 0;
    for (const raw of entries) {
      const entry = coerceEntry(raw);
      if (entry === null || this.items.some((e) => e.id === entry.id)) {
        skipped++;
      } else {
        this.items.push(entry);
        added++;
      }
    }
    this.save();
    return { added, skipped };
  }
}
