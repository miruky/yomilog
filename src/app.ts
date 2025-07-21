// ダッシュボードのUI。集計とチャート生成はlibに任せ、ここでは
// フォームの状態(新規か編集か)と表示件数だけを持つ。

import { barChart, donutChart, escapeXml } from './lib/chart';
import { demoEntries } from './lib/demo';
import type { Entry, ReadingLog } from './lib/log';
import { LogError } from './lib/log';
import { genreShare, monthlyPages, summarize } from './lib/stats';

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

const LOGO = `
<svg class="logo" viewBox="0 0 64 64" aria-hidden="true">
  <path d="M10 14h18a6 6 0 0 1 6 6v32a8 8 0 0 0-8-6H10z" fill="none" stroke="currentColor" stroke-width="3" stroke-linejoin="round"/>
  <path d="M54 14H36a6 6 0 0 0-6 6v32a8 8 0 0 1 8-6h16z" fill="var(--accent)" opacity="0.9"/>
  <path d="M40 26h8M40 33h8" stroke="var(--bg)" stroke-width="2.5" stroke-linecap="round"/>
</svg>`;

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

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function countUp(el: HTMLElement, target: number): void {
  if (prefersReducedMotion() || target === 0) {
    el.textContent = target.toLocaleString('ja-JP');
    return;
  }
  const duration = 600;
  const start = performance.now();
  const step = (t: number) => {
    const ratio = Math.min(1, (t - start) / duration);
    const eased = 1 - (1 - ratio) ** 3;
    el.textContent = Math.round(target * eased).toLocaleString('ja-JP');
    if (ratio < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function mountApp(root: HTMLElement, log: ReadingLog): void {
  let editingId: string | null = null;
  let showAll = false;

  root.innerHTML = `
    <div class="shell">
      <header class="masthead">
        <div class="brand">
          ${LOGO}
          <div>
            <h1>yomilog</h1>
            <p class="tagline">読んだページを、かたちにする</p>
          </div>
        </div>
        <div class="masthead-actions">
          <button type="button" id="export" class="ghost">エクスポート</button>
          <button type="button" id="import" class="ghost">インポート</button>
          <input type="file" id="import-file" accept=".json,application/json" hidden>
        </div>
      </header>

      <section class="panel entry-panel" aria-label="記録を付ける">
        <form id="entry-form" autocomplete="off">
          <label>日付<input type="date" name="date" required></label>
          <label class="grow">書名<input name="title" list="title-list" required placeholder="何を読んだか"></label>
          <label>ページ<input type="number" name="pages" min="1" max="3000" required placeholder="数"></label>
          <label>ジャンル<input name="genre" list="genre-list" placeholder="小説など"></label>
          <label class="check"><input type="checkbox" name="finished">読み終えた</label>
          <div class="entry-buttons">
            <button type="submit" class="primary" id="entry-submit">記録する</button>
            <button type="button" id="entry-cancel" class="ghost" hidden>取りやめ</button>
          </div>
          <datalist id="title-list"></datalist>
          <datalist id="genre-list"></datalist>
        </form>
      </section>

      <section class="cards" id="cards" aria-label="読書のサマリ"></section>

      <div class="charts">
        <section class="panel" aria-labelledby="bar-heading">
          <h2 id="bar-heading">月間ページ数</h2>
          <div id="bar-chart"></div>
        </section>
        <section class="panel" aria-labelledby="donut-heading">
          <h2 id="donut-heading">ジャンル分布</h2>
          <div class="donut-row">
            <div id="donut-chart"></div>
            <ul id="legend" class="legend"></ul>
          </div>
        </section>
      </div>

      <section class="panel" aria-labelledby="recent-heading">
        <h2 id="recent-heading">記録の一覧</h2>
        <div id="entries"></div>
      </section>

      <footer class="foot">
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

  function renderCards(): void {
    const s = summarize(log.all(), todayLocal());
    const cards = [
      { label: '今月', value: s.monthPages, unit: 'ページ', sub: `活動${s.activeDaysInMonth}日` },
      {
        label: '今年',
        value: s.yearPages,
        unit: 'ページ',
        sub: `累計${s.totalPages.toLocaleString('ja-JP')}ページ`,
      },
      { label: '読了', value: s.finishedCount, unit: '冊', sub: 'これまでに読み終えた本' },
      { label: '継続', value: s.currentStreak, unit: '日', sub: `最長${s.longestStreak}日` },
    ];
    $('#cards').innerHTML = cards
      .map(
        (c, i) => `
        <div class="card" style="--i:${i}">
          <p class="card-label">${c.label}</p>
          <p class="card-value"><span class="num" data-count="${c.value}">0</span><span class="unit">${c.unit}</span></p>
          <p class="card-sub">${esc(c.sub)}</p>
        </div>`,
      )
      .join('');
    root.querySelectorAll<HTMLElement>('.num').forEach((el) => {
      countUp(el, Number(el.dataset.count ?? 0));
    });
  }

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
        centerLabel: total === 0 ? '' : total.toLocaleString('ja-JP'),
        centerSub: total === 0 ? '' : 'ページ',
      },
    );
    $('#legend').innerHTML = shares
      .map(
        (s, i) => `
        <li style="--i:${i}"><span class="swatch seg-${i % 8}" aria-hidden="true"></span>
          ${esc(s.genre)}<span class="legend-pct">${Math.round(s.ratio * 100)}%</span></li>`,
      )
      .join('');
  }

  function renderEntries(): void {
    const entries = log.all();
    $('#clear-all').hidden = entries.length === 0;
    if (entries.length === 0) {
      $('#entries').innerHTML = `
        <div class="empty">
          <p>記録がまだありません。フォームから1件目を付けるか、デモデータで画面の雰囲気を確かめられます。</p>
          <button type="button" id="demo" class="ghost">デモデータを入れる</button>
        </div>`;
      return;
    }
    const visible = showAll ? entries : entries.slice(0, RECENT_LIMIT);
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
      entries.length > RECENT_LIMIT
        ? `<button type="button" id="toggle-all" class="ghost">${
            showAll ? '直近だけ表示' : `すべて表示(全${entries.length}件)`
          }</button>`
        : '';
    $('#entries').innerHTML = `
      <table>
        <thead><tr><th scope="col">日付</th><th scope="col">書名</th><th scope="col">ジャンル</th><th scope="col">ページ</th><th scope="col"><span class="visually-hidden">操作</span></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>${more}`;
  }

  function render(): void {
    renderCards();
    renderCharts();
    renderEntries();
    renderDatalists();
  }

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

  $('#entries').parentElement?.addEventListener('click', (e) => {
    const target = e.target as HTMLElement;
    const demo = target.closest('#demo');
    if (demo !== null) {
      for (const entry of demoEntries(todayLocal())) log.add(entry);
      toast('デモデータを入れました。消すときは下の「すべての記録を消す」から');
      render();
      return;
    }
    const toggle = target.closest('#toggle-all');
    if (toggle !== null) {
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
    toast('すべての記録を消しました');
    render();
  });

  $('#export').addEventListener('click', () => {
    const stamp = todayLocal().replace(/-/g, '');
    const blob = new Blob([log.exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `yomilog-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('記録をエクスポートしました');
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

  resetForm();
  render();
}
