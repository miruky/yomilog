// ダッシュボードのUI。集計・チャート・書き出しはlibに任せ、ここでは画面の
// 状態(フォームが新規か編集か、一覧の絞り込み、表示テーマ)だけを持つ。

import { barChart, donutChart, escapeXml, heatmap } from './lib/chart';
import { demoEntries } from './lib/demo';
import { toCsv, toMarkdown } from './lib/exporters';
import {
  applyQuery,
  DEFAULT_QUERY,
  filterEntries,
  type ListQuery,
  type SortKey,
} from './lib/filter';
import {
  loadGoals,
  monthProgress,
  projectYear,
  saveGoals,
  yearProgress,
  type GoalProgress,
  type Goals,
} from './lib/goal';
import type { Entry, ReadingLog, StorageLike } from './lib/log';
import { LogError } from './lib/log';
import {
  bookSummaries,
  dailyPages,
  genreShare,
  monthlyPages,
  summarize,
  type BookSummary,
} from './lib/stats';
import {
  applyTheme,
  loadThemeSetting,
  nextTheme,
  saveThemeSetting,
  themeLabel,
  type ThemeSetting,
} from './lib/theme';

const esc = escapeXml;

const GENRE_SUGGESTIONS = [
  '小説',
  'ミステリ',
  'SF',
  '技術書',
  'ノンフィクション',
  'エッセイ',
  '歴史',
  '漫画',
];

const RECENT_LIMIT = 12;

// 本を開いた形を1本のストロークで象った見出し用のマーク。
const LOGO = `
<svg class="logo" viewBox="0 0 64 64" aria-hidden="true">
  <path d="M10 14h18a6 6 0 0 1 6 6v32a8 8 0 0 0-8-6H10z" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round"/>
  <path d="M54 14H36a6 6 0 0 0-6 6v32a8 8 0 0 1 8-6h16z" fill="var(--accent)" opacity="0.92"/>
  <path d="M40 26h8M40 33h8" stroke="var(--paper)" stroke-width="2.4" stroke-linecap="round"/>
</svg>`;

const THEME_ICON: Record<ThemeSetting, string> = {
  auto: '<circle cx="12" cy="12" r="6.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 5.5a6.5 6.5 0 0 0 0 13z" fill="currentColor"/>',
  light:
    '<circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
  dark: '<path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z" fill="currentColor"/>',
};

function todayLocal(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

function monthLabel(month: string): string {
  return `${Number(month.slice(5))}月`;
}

function dateLabel(date: string): string {
  return `${Number(date.slice(5, 7))}/${Number(date.slice(8))}`;
}

function jp(n: number): string {
  return n.toLocaleString('ja-JP');
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function countUp(el: HTMLElement, target: number): void {
  if (prefersReducedMotion() || target === 0) {
    el.textContent = jp(target);
    return;
  }
  const duration = 720;
  const start = performance.now();
  const step = (t: number) => {
    const ratio = Math.min(1, (t - start) / duration);
    const eased = 1 - (1 - ratio) ** 3;
    el.textContent = jp(Math.round(target * eased));
    if (ratio < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function download(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function mountApp(root: HTMLElement, log: ReadingLog, storage: StorageLike): void {
  let editingId: string | null = null;
  let showAll = false;
  let ledgerView: 'entries' | 'books' = 'entries';
  let query: ListQuery = { ...DEFAULT_QUERY };
  let theme: ThemeSetting = loadThemeSetting(storage);
  let goals: Goals = loadGoals(storage);

  root.innerHTML = `
    <div class="shell">
      <div class="topbar">
        <span class="org">読書記録</span>
        <div class="tools">
          <button type="button" id="theme" class="icon-btn" aria-label="${themeLabel(theme)}">
            <svg viewBox="0 0 24 24" aria-hidden="true" class="theme-icon">${THEME_ICON[theme]}</svg>
          </button>
          <details class="menu" id="export-menu">
            <summary class="text-btn">書き出す</summary>
            <div class="menu-body" role="menu">
              <button type="button" data-export="json" role="menuitem">JSON(バックアップ)</button>
              <button type="button" data-export="csv" role="menuitem">CSV(表計算)</button>
              <button type="button" data-export="md" role="menuitem">Markdown(一覧)</button>
            </div>
          </details>
          <button type="button" id="import" class="text-btn">読み込む</button>
          <input type="file" id="import-file" accept=".json,application/json" hidden>
        </div>
      </div>

      <header class="masthead reveal">
        <div class="mast-text">
          <p class="kicker">READING JOURNAL</p>
          <h1 class="wordmark">${LOGO}<span>yomilog</span></h1>
          <p class="lede">読んだページを書きとめると、月日が冊数ではなく<em>厚み</em>で見えてくる。日付と書名とページ数、それだけ。</p>
        </div>
        <figure class="mast-figure" aria-hidden="true">
          <img
            src="https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=1120&h=1400&q=80&auto=format&fit=crop"
            alt="" width="560" height="700" loading="lazy" decoding="async">
        </figure>
      </header>

      <section class="compose reveal" aria-label="記録を付ける">
        <form id="entry-form" autocomplete="off">
          <div class="field field-date">
            <label for="f-date">日付</label>
            <input id="f-date" type="date" name="date" required>
          </div>
          <div class="field field-title">
            <label for="f-title">書名</label>
            <input id="f-title" name="title" list="title-list" required placeholder="何を読んだか">
          </div>
          <div class="field field-pages">
            <label for="f-pages">ページ</label>
            <input id="f-pages" type="number" name="pages" min="1" max="3000" required placeholder="数">
          </div>
          <div class="field field-genre">
            <label for="f-genre">ジャンル</label>
            <input id="f-genre" name="genre" list="genre-list" placeholder="小説など">
          </div>
          <label class="check"><input type="checkbox" name="finished">読み終えた</label>
          <div class="entry-buttons">
            <button type="submit" class="primary" id="entry-submit">記録する</button>
            <button type="button" id="entry-cancel" class="text-btn" hidden>取りやめ</button>
          </div>
          <datalist id="title-list"></datalist>
          <datalist id="genre-list"></datalist>
        </form>
      </section>

      <section class="figures reveal" id="figures" aria-label="読書のサマリ"></section>

      <section class="goals reveal" aria-labelledby="goals-head">
        <div class="section-head"><h2 id="goals-head">目標</h2></div>
        <div class="goal-grid" id="goals"></div>
      </section>

      <div class="charts reveal">
        <section class="block block-bar" aria-labelledby="bar-head">
          <div class="section-head"><h2 id="bar-head">月間ページ数</h2><span class="section-note">直近12か月</span></div>
          <div id="bar-chart"></div>
        </section>
        <section class="block block-donut" aria-labelledby="donut-head">
          <div class="section-head"><h2 id="donut-head">ジャンル分布</h2></div>
          <div class="donut-row">
            <div id="donut-chart"></div>
            <ul id="legend" class="legend"></ul>
          </div>
        </section>
      </div>

      <section class="almanac reveal" aria-labelledby="heat-head">
        <div class="section-head"><h2 id="heat-head">読書の暦</h2><span class="section-note">この1年</span></div>
        <div class="heat-scroll"><div id="heat-chart"></div></div>
        <div class="heat-key" aria-hidden="true">
          <span>少</span>
          <span class="heat-cell lvl-0"></span><span class="heat-cell lvl-1"></span><span class="heat-cell lvl-2"></span><span class="heat-cell lvl-3"></span><span class="heat-cell lvl-4"></span>
          <span>多</span>
        </div>
      </section>

      <section class="ledger reveal" aria-labelledby="ledger-head">
        <div class="section-head">
          <h2 id="ledger-head">記録の一覧</h2>
          <div class="ledger-controls" id="ledger-controls" hidden>
            <div class="view-toggle" role="tablist" aria-label="表示の切替">
              <button type="button" id="view-entries" class="view-tab" role="tab" aria-selected="true">記録</button>
              <button type="button" id="view-books" class="view-tab" role="tab" aria-selected="false">本</button>
            </div>
            <input type="search" id="search" placeholder="書名・ジャンルで絞る" aria-label="一覧を絞り込む">
            <select id="genre-filter" aria-label="ジャンルで絞る"></select>
            <label class="check small"><input type="checkbox" id="finished-filter">読了のみ</label>
          </div>
        </div>
        <div id="entries"></div>
      </section>

      <footer class="foot">
        <p class="shortcuts" aria-hidden="true"><kbd>n</kbd> 新規 <kbd>/</kbd> 検索 <kbd>t</kbd> 表示切替</p>
        <button type="button" id="clear-all" class="danger-link" hidden>すべての記録を消す</button>
      </footer>
      <div id="toast" role="status" aria-live="polite"></div>
    </div>`;

  const $ = <T extends HTMLElement>(selector: string): T => {
    const node = root.querySelector<T>(selector);
    if (node === null) throw new Error(`要素が見つからない: ${selector}`);
    return node;
  };

  const form = $<HTMLFormElement>('#entry-form');
  const field = <T extends HTMLElement>(name: string): T => {
    const node = form.elements.namedItem(name);
    if (!(node instanceof HTMLElement)) throw new Error(`入力が見つからない: ${name}`);
    return node as T;
  };
  const toastBox = $('#toast');
  let toastTimer: ReturnType<typeof setTimeout> | undefined;

  function toast(message: string): void {
    toastBox.textContent = message;
    toastBox.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastBox.classList.remove('show'), 3500);
  }

  // テーマ ---------------------------------------------------------------

  function syncTheme(): void {
    applyTheme(document.documentElement, theme);
    $<HTMLButtonElement>('#theme').setAttribute('aria-label', themeLabel(theme));
    $<HTMLElement>('.theme-icon').innerHTML = THEME_ICON[theme];
  }

  function cycleTheme(): void {
    theme = nextTheme(theme);
    saveThemeSetting(storage, theme);
    syncTheme();
    toast(themeLabel(theme));
  }

  // フォーム -------------------------------------------------------------

  function resetForm(): void {
    editingId = null;
    form.reset();
    field<HTMLInputElement>('date').value = todayLocal();
    $('#entry-submit').textContent = '記録する';
    $('#entry-cancel').hidden = true;
  }

  function fillForm(entry: Entry): void {
    editingId = entry.id;
    field<HTMLInputElement>('date').value = entry.date;
    field<HTMLInputElement>('title').value = entry.title;
    field<HTMLInputElement>('pages').value = String(entry.pages);
    field<HTMLInputElement>('genre').value = entry.genre;
    field<HTMLInputElement>('finished').checked = entry.finished;
    $('#entry-submit').textContent = '更新する';
    $('#entry-cancel').hidden = false;
    field<HTMLInputElement>('title').focus();
  }

  function renderDatalists(): void {
    $('#title-list').innerHTML = log
      .knownTitles()
      .map((t) => `<option value="${esc(t)}"></option>`)
      .join('');
    const genres = [...new Set([...log.knownGenres(), ...GENRE_SUGGESTIONS])];
    $('#genre-list').innerHTML = genres.map((g) => `<option value="${esc(g)}"></option>`).join('');
  }

  // サマリ ---------------------------------------------------------------

  function renderFigures(): void {
    const s = summarize(log.all(), todayLocal());
    const projected = projectYear(s.yearPages, todayLocal());
    const figures = [
      { label: '今月', value: s.monthPages, unit: 'ページ', sub: `活動${s.activeDaysInMonth}日` },
      { label: '今年', value: s.yearPages, unit: 'ページ', sub: `予測 ${jp(projected)}` },
      { label: '読了', value: s.finishedCount, unit: '冊', sub: `累計 ${jp(s.totalPages)}ページ` },
      { label: '継続', value: s.currentStreak, unit: '日', sub: `最長 ${s.longestStreak}日` },
    ];
    $('#figures').innerHTML = figures
      .map(
        (f, i) => `
        <div class="figure" style="--i:${i}">
          <p class="figure-label">${f.label}</p>
          <p class="figure-value"><span class="num" data-count="${f.value}">0</span><span class="unit">${f.unit}</span></p>
          <p class="figure-sub">${esc(f.sub)}</p>
        </div>`,
      )
      .join('');
    root.querySelectorAll<HTMLElement>('#figures .num').forEach((el) => {
      countUp(el, Number(el.dataset.count ?? 0));
    });
  }

  // 目標 -----------------------------------------------------------------

  function goalNote(p: GoalProgress, span: string): string {
    if (p.target === 0) return '目標を決めると、ここに進み具合が出ます。';
    if (p.achieved) return `達成。目標を${jp(p.current - p.target)}ページ上回っています。`;
    return `あと${jp(p.remaining)}ページ。残り${p.daysLeft}日なら1日${jp(p.perDayNeeded)}ページで${span}の目標に届きます。`;
  }

  function renderGoals(): void {
    const s = summarize(log.all(), todayLocal());
    const month = monthProgress(goals.monthly, s.monthPages, todayLocal());
    const year = yearProgress(goals.yearly, s.yearPages, todayLocal());
    const rows: { id: 'monthly' | 'yearly'; name: string; span: string; p: GoalProgress }[] = [
      { id: 'monthly', name: '今月', span: '今月', p: month },
      { id: 'yearly', name: '今年', span: '年内', p: year },
    ];
    $('#goals').innerHTML = rows
      .map(
        (r) => `
        <div class="goal${r.p.achieved ? ' is-done' : ''}">
          <div class="goal-top">
            <span class="goal-name">${r.name}</span>
            <label class="goal-input">目標
              <input type="number" id="goal-${r.id}" min="0" max="1000000" step="50"
                value="${goals[r.id] === 0 ? '' : goals[r.id]}" placeholder="—" inputmode="numeric"> ページ</label>
          </div>
          <div class="goal-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100"
            aria-valuenow="${Math.round(r.p.ratio * 100)}" aria-label="${r.name}の目標達成率">
            <span class="goal-fill" style="--r:${r.p.ratio}"></span>
          </div>
          <p class="goal-note">${esc(goalNote(r.p, r.span))}</p>
        </div>`,
      )
      .join('');
    (['monthly', 'yearly'] as const).forEach((id) => {
      $<HTMLInputElement>(`#goal-${id}`).addEventListener('change', (e) => {
        const v = Math.max(0, Math.floor(Number((e.target as HTMLInputElement).value) || 0));
        goals = { ...goals, [id]: v };
        saveGoals(storage, goals);
        renderGoals();
        toast(
          v === 0
            ? '目標を外しました'
            : `${id === 'monthly' ? '今月' : '今年'}の目標を${jp(v)}ページにしました`,
        );
      });
    });
  }

  // チャート -------------------------------------------------------------

  function renderCharts(): void {
    const entries = log.all();
    const monthly = monthlyPages(entries, todayLocal()).map((m) => ({
      label: monthLabel(m.month),
      value: m.pages,
    }));
    $('#bar-chart').innerHTML = barChart(monthly, { unit: 'ページ' });

    const shares = genreShare(entries);
    const total = shares.reduce((a, s) => a + s.pages, 0);
    $('#donut-chart').innerHTML = donutChart(
      shares.map((s) => ({ label: s.genre, value: s.pages })),
      {
        centerLabel: total === 0 ? '' : jp(total),
        centerSub: total === 0 ? '' : 'ページ',
      },
    );
    $('#legend').innerHTML =
      shares.length === 0
        ? '<li class="legend-empty">記録するとジャンルの内訳が出ます</li>'
        : shares
            .map(
              (s, i) => `
        <li style="--i:${i}"><span class="swatch seg-${i % 8}" aria-hidden="true"></span>
          <span class="legend-name">${esc(s.genre)}</span><span class="legend-pct">${Math.round(s.ratio * 100)}%</span></li>`,
            )
            .join('');

    $('#heat-chart').innerHTML = heatmap(dailyPages(entries, todayLocal()));
  }

  // 一覧 -----------------------------------------------------------------

  function renderControls(): void {
    const hasEntries = log.count() > 0;
    $('#ledger-controls').hidden = !hasEntries;
    if (!hasEntries) return;
    const genres = log.knownGenres();
    const select = $<HTMLSelectElement>('#genre-filter');
    select.innerHTML =
      '<option value="">すべてのジャンル</option>' +
      genres.map((g) => `<option value="${esc(g)}">${esc(g)}</option>`).join('');
    select.value = query.genre;
    $<HTMLInputElement>('#search').value = query.text;
    $<HTMLInputElement>('#finished-filter').checked = query.finishedOnly;
    const onEntries = ledgerView === 'entries';
    $<HTMLButtonElement>('#view-entries').setAttribute('aria-selected', String(onEntries));
    $<HTMLButtonElement>('#view-books').setAttribute('aria-selected', String(!onEntries));
  }

  function sortIndicator(key: SortKey): string {
    if (query.sortKey !== key) return '';
    return query.sortDir === 'asc' ? ' ▲' : ' ▼';
  }

  function renderBooks(): void {
    const filtered = filterEntries(log.all(), { ...query, finishedOnly: false });
    let books: BookSummary[] = bookSummaries(filtered);
    if (query.finishedOnly) books = books.filter((b) => b.finished);
    if (books.length === 0) {
      $('#entries').innerHTML = `<p class="no-match">条件に合う本がありません。</p>`;
      return;
    }
    const visible = showAll ? books : books.slice(0, RECENT_LIMIT);
    const rows = visible
      .map(
        (b) => `
        <li class="book">
          <div class="book-main">
            <p class="book-title">${esc(b.title)}${b.finished ? '<span class="badge">読了</span>' : '<span class="badge reading">読書中</span>'}</p>
            <p class="book-meta">${esc(b.genre)}・${b.sessions}回・${dateLabel(b.firstDate)}〜${dateLabel(b.lastDate)}</p>
          </div>
          <p class="book-pages"><span class="num">${jp(b.pages)}</span><span class="unit">ページ</span></p>
        </li>`,
      )
      .join('');
    const more =
      books.length > RECENT_LIMIT
        ? `<button type="button" id="toggle-all" class="text-btn">${
            showAll ? '直近だけ表示' : `すべて表示(全${books.length}冊)`
          }</button>`
        : '';
    $('#entries').innerHTML = `<ul class="book-list">${rows}</ul>${more}`;
  }

  function renderEntries(): void {
    const all = log.all();
    $('#clear-all').hidden = all.length === 0;
    if (all.length === 0) {
      $('#entries').innerHTML = `
        <div class="empty">
          <p>記録がまだありません。上のフォームから1件目を付けるか、デモデータで画面の雰囲気を確かめられます。</p>
          <button type="button" id="demo" class="text-btn">デモデータを入れる</button>
        </div>`;
      return;
    }
    if (ledgerView === 'books') {
      renderBooks();
      return;
    }
    const matched = applyQuery(all, query);
    if (matched.length === 0) {
      $('#entries').innerHTML = `<p class="no-match">条件に合う記録がありません。</p>`;
      return;
    }
    const visible = showAll ? matched : matched.slice(0, RECENT_LIMIT);
    const rows = visible
      .map(
        (e) => `
        <tr>
          <td class="cell-date">${dateLabel(e.date)}</td>
          <td class="cell-title">${esc(e.title)}${e.finished ? '<span class="badge">読了</span>' : ''}</td>
          <td class="cell-genre">${esc(e.genre)}</td>
          <td class="cell-pages">${e.pages}</td>
          <td class="cell-ops">
            <button type="button" data-edit="${esc(e.id)}" class="link">編集</button>
            <button type="button" data-remove="${esc(e.id)}" class="link">削除</button>
          </td>
        </tr>`,
      )
      .join('');
    const more =
      matched.length > RECENT_LIMIT
        ? `<button type="button" id="toggle-all" class="text-btn">${
            showAll ? '直近だけ表示' : `すべて表示(全${matched.length}件)`
          }</button>`
        : '';
    $('#entries').innerHTML = `
      <table>
        <thead><tr>
          <th scope="col"><button type="button" class="sort" data-sort="date">日付${sortIndicator('date')}</button></th>
          <th scope="col"><button type="button" class="sort" data-sort="title">書名${sortIndicator('title')}</button></th>
          <th scope="col">ジャンル</th>
          <th scope="col" class="th-pages"><button type="button" class="sort" data-sort="pages">ページ${sortIndicator('pages')}</button></th>
          <th scope="col"><span class="visually-hidden">操作</span></th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>${more}`;
  }

  function render(): void {
    renderFigures();
    renderGoals();
    renderCharts();
    renderControls();
    renderEntries();
    renderDatalists();
  }

  function toggleSort(key: SortKey): void {
    if (query.sortKey === key) {
      query = { ...query, sortDir: query.sortDir === 'asc' ? 'desc' : 'asc' };
    } else {
      query = { ...query, sortKey: key, sortDir: key === 'title' ? 'asc' : 'desc' };
    }
    renderEntries();
  }

  // イベント -------------------------------------------------------------

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const input = {
      date: field<HTMLInputElement>('date').value,
      title: field<HTMLInputElement>('title').value,
      pages: Number(field<HTMLInputElement>('pages').value),
      genre: field<HTMLInputElement>('genre').value,
      finished: field<HTMLInputElement>('finished').checked,
    };
    try {
      if (editingId === null) {
        const entry = log.add(input);
        toast(`「${entry.title}」${entry.pages}ページを記録しました`);
      } else {
        log.update(editingId, input);
        toast('記録を更新しました');
      }
      resetForm();
      render();
    } catch (err) {
      toast(err instanceof LogError ? err.message : '記録に失敗しました');
    }
  });

  $('#entry-cancel').addEventListener('click', () => {
    resetForm();
  });

  $('#search').addEventListener('input', (e) => {
    query = { ...query, text: (e.target as HTMLInputElement).value };
    renderEntries();
  });

  $('#genre-filter').addEventListener('change', (e) => {
    query = { ...query, genre: (e.target as HTMLSelectElement).value };
    renderEntries();
  });

  $('#finished-filter').addEventListener('change', (e) => {
    query = { ...query, finishedOnly: (e.target as HTMLInputElement).checked };
    renderEntries();
  });

  function setView(view: 'entries' | 'books'): void {
    if (ledgerView === view) return;
    ledgerView = view;
    showAll = false;
    renderControls();
    renderEntries();
  }
  $('#view-entries').addEventListener('click', () => setView('entries'));
  $('#view-books').addEventListener('click', () => setView('books'));

  $('#entries').addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const sort = target.closest<HTMLElement>('[data-sort]');
    if (sort !== null) {
      toggleSort(sort.dataset.sort as SortKey);
      return;
    }
    if (target.closest('#demo') !== null) {
      for (const entry of demoEntries(todayLocal())) log.add(entry);
      toast('デモデータを入れました。消すときは下の「すべての記録を消す」から');
      render();
      return;
    }
    if (target.closest('#toggle-all') !== null) {
      showAll = !showAll;
      renderEntries();
      return;
    }
    const edit = target.closest<HTMLElement>('[data-edit]');
    if (edit !== null) {
      const entry = log.get(edit.dataset.edit ?? '');
      if (entry !== null) fillForm(entry);
      return;
    }
    const remove = target.closest<HTMLElement>('[data-remove]');
    if (remove !== null) {
      if (remove.dataset.armed === undefined) {
        remove.dataset.armed = '1';
        remove.textContent = '本当に削除';
        return;
      }
      log.remove(remove.dataset.remove ?? '');
      if (editingId === remove.dataset.remove) resetForm();
      toast('記録を削除しました');
      render();
    }
  });

  $('#clear-all').addEventListener('click', (e) => {
    const button = e.currentTarget as HTMLButtonElement;
    if (button.dataset.armed === undefined) {
      button.dataset.armed = '1';
      button.textContent = 'もう一度押すと全件削除';
      return;
    }
    log.clear();
    delete button.dataset.armed;
    button.textContent = 'すべての記録を消す';
    resetForm();
    showAll = false;
    query = { ...DEFAULT_QUERY };
    toast('すべての記録を消しました');
    render();
  });

  // 書き出し・読み込み ---------------------------------------------------

  $('#export-menu').addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLElement>('[data-export]');
    if (btn === null) return;
    const stamp = todayLocal().replace(/-/g, '');
    const kind = btn.dataset.export;
    if (kind === 'csv') {
      download(`yomilog-${stamp}.csv`, toCsv(log.all()), 'text/csv;charset=utf-8');
      toast('CSVを書き出しました');
    } else if (kind === 'md') {
      download(`yomilog-${stamp}.md`, toMarkdown(log.all()), 'text/markdown;charset=utf-8');
      toast('Markdownを書き出しました');
    } else {
      download(`yomilog-${stamp}.json`, log.exportJson(), 'application/json');
      toast('JSONを書き出しました');
    }
    $<HTMLDetailsElement>('#export-menu').open = false;
  });

  $('#import').addEventListener('click', () => {
    $<HTMLInputElement>('#import-file').click();
  });

  $<HTMLInputElement>('#import-file').addEventListener('change', (e) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file === undefined) return;
    void file.text().then((text) => {
      try {
        const result = log.importJson(text);
        toast(`${result.added}件を取り込みました(${result.skipped}件は読み飛ばし)`);
        render();
      } catch (err) {
        toast(err instanceof LogError ? err.message : '読み込みに失敗しました');
      }
    });
  });

  $('#theme').addEventListener('click', cycleTheme);

  // 書き出しメニューは外側クリックとEscで閉じる。
  const exportMenu = $<HTMLDetailsElement>('#export-menu');
  document.addEventListener('click', (e) => {
    if (exportMenu.open && !exportMenu.contains(e.target as Node)) {
      exportMenu.open = false;
    }
  });

  // キーボード操作。入力中はショートカットを横取りしない。
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (exportMenu.open) {
        exportMenu.open = false;
        return;
      }
      if (editingId !== null) {
        resetForm();
        return;
      }
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const el = e.target as HTMLElement;
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) return;
    if (e.key === 'n') {
      e.preventDefault();
      field<HTMLInputElement>('title').focus();
    } else if (e.key === '/') {
      const search = root.querySelector<HTMLInputElement>('#search');
      if (search !== null && !$('#ledger-controls').hidden) {
        e.preventDefault();
        search.focus();
      }
    } else if (e.key === 't') {
      cycleTheme();
    }
  });

  // 出現アニメーションと視差。reduced-motionでは即時表示で止める。
  function setupMotion(): void {
    const sections = root.querySelectorAll<HTMLElement>('.reveal');
    if (prefersReducedMotion() || typeof IntersectionObserver === 'undefined') {
      sections.forEach((s) => s.classList.add('is-in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries, obs) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-in');
            obs.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );
    sections.forEach((s) => io.observe(s));

    const figure = root.querySelector<HTMLElement>('.mast-figure img');
    if (figure !== null) {
      let ticking = false;
      const onScroll = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          const shift = Math.max(-18, Math.min(18, window.scrollY * -0.04));
          figure.style.transform = `translateY(${shift.toFixed(1)}px) scale(1.04)`;
          ticking = false;
        });
      };
      window.addEventListener('scroll', onScroll, { passive: true });
    }
  }

  syncTheme();
  resetForm();
  render();
  setupMotion();
}
