/* ========================================================
   日本語学習ノート · App
   - data/notes.json を fetch
   - 一覧 / 検索 / type フィルタ / タグフィルタ / 詳細モーダル
   - SRS 状態を表示（due / mastered ドット）
   - URL ハッシュで状態保持
   ======================================================== */

const TYPE_LABELS = {
  all:        { ja: 'すべて',   en: 'ALL' },
  word:       { ja: '単語',     en: 'WORD' },
  phrase:     { ja: 'フレーズ', en: 'PHRASE' },
  grammar:    { ja: '文法',     en: 'GRAMMAR' },
  expression: { ja: '表現',     en: 'EXPRESSION' },
  culture:    { ja: '文化',     en: 'CULTURE' },
};

const state = {
  notes: [],
  filter: { type: 'all', search: '', tag: null },
  loaded: false,
};

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* ---------- データ読み込み ---------- */
async function loadNotes() {
  try {
    // commit SHA で破缓存（Pages の CDN 反映遅延対策）
    const res = await fetch('data/notes.json?v=' + Date.now(), { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    state.notes = data.notes || [];
    state.loaded = true;
    render();
  } catch (err) {
    console.error('Failed to load notes:', err);
    $('#notes-list').innerHTML =
      '<div class="empty"><div class="em">⚠</div>データの読み込みに失敗しました<br><small>' +
      (err.message || err) + '</small></div>';
  }
}

/* ---------- SRS ステータス判定 ---------- */
function getSrsStatus(note) {
  const srs = note.srs || {};
  const today = new Date().toISOString().slice(0, 10);
  if (srs.next_review && srs.next_review <= today) return 'due';
  if (srs.reps >= 5 && srs.ease >= 2.5) return 'mastered';
  return 'normal';
}

/* ---------- フィルタリング ---------- */
function getFilteredNotes() {
  const { type, search, tag } = state.filter;
  const q = search.trim().toLowerCase();
  return state.notes.filter((n) => {
    if (type !== 'all' && n.type !== type) return false;
    if (tag && !(n.tags || []).includes(tag)) return false;
    if (q) {
      const haystack = [
        n.front, n.back, n.kana, n.romaji, n.context_note, n.source,
        ...(n.tags || []),
        ...(n.examples || []).flatMap((e) => [e.ja, e.zh]),
      ].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    return true;
  });
}

/* ---------- レンダリング ---------- */
function render() {
  renderTabs();
  renderTagFilters();
  renderList();
  renderStats();
}

function renderTabs() {
  const counts = state.notes.reduce((acc, n) => {
    acc[n.type] = (acc[n.type] || 0) + 1;
    acc.all = (acc.all || 0) + 1;
    return acc;
  }, {});
  const types = ['all', 'word', 'phrase', 'grammar', 'expression', 'culture'];
  $('#tabs').innerHTML = types.map((t) => {
    const c = counts[t] || 0;
    if (t !== 'all' && c === 0) return '';
    const active = state.filter.type === t ? 'active' : '';
    return `<button class="tab ${active}" data-type="${t}">
      ${TYPE_LABELS[t].ja}<span class="count">${c}</span>
    </button>`;
  }).join('');
  $$('#tabs .tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.filter.type = btn.dataset.type;
      state.filter.tag = null;
      render();
    });
  });
}

function renderTagFilters() {
  // 現在の type フィルタにマッチするノートからタグを集める
  const candidates = state.notes.filter((n) =>
    state.filter.type === 'all' || n.type === state.filter.type
  );
  const tagSet = new Map();
  candidates.forEach((n) => (n.tags || []).forEach((t) => {
    tagSet.set(t, (tagSet.get(t) || 0) + 1);
  }));
  const tags = Array.from(tagSet.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20);
  if (tags.length === 0) {
    $('#tag-filters').innerHTML = '';
    return;
  }
  $('#tag-filters').innerHTML =
    '<span class="label">#</span>' +
    tags.map(([t, c]) => {
      const active = state.filter.tag === t ? 'active' : '';
      return `<span class="tag-pill ${active}" data-tag="${t}">${t} <small>${c}</small></span>`;
    }).join('');
  $$('#tag-filters .tag-pill').forEach((el) => {
    el.addEventListener('click', () => {
      state.filter.tag = state.filter.tag === el.dataset.tag ? null : el.dataset.tag;
      render();
    });
  });
}

function renderList() {
  const list = getFilteredNotes();
  if (list.length === 0) {
    const msg = state.notes.length === 0
      ? '該当するノートがまだありません'
      : '条件に一致するノートが見つかりません';
    $('#notes-list').innerHTML = `<div class="empty"><div class="em">·</div>${msg}</div>`;
    return;
  }
  $('#notes-list').innerHTML = list.map((n) => {
    const status = getSrsStatus(n);
    const tags = (n.tags || []).slice(0, 3)
      .map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('');
    return `<div class="note-card ${status}" data-id="${n.id}">
      <span class="type-badge">${TYPE_LABELS[n.type]?.en || n.type}</span>
      <div class="front">${escapeHtml(n.front)}</div>
      ${n.kana && n.kana !== n.front ? `<div class="kana">${escapeHtml(n.kana)}</div>` : ''}
      <div class="back">${escapeHtml(truncate(n.back, 60))}</div>
      ${tags ? `<div class="meta">${tags}</div>` : ''}
      <span class="srs-dot" title="${status}"></span>
    </div>`;
  }).join('');
  $$('#notes-list .note-card').forEach((card) => {
    card.addEventListener('click', () => openModal(card.dataset.id));
  });
}

function renderStats() {
  const total = state.notes.length;
  const due = state.notes.filter((n) => getSrsStatus(n) === 'due').length;
  $('#stats').innerHTML =
    `<strong>${total}</strong>件 · <strong>${due}</strong>件復習待ち`;
}

/* ---------- 詳細モーダル ---------- */
function openModal(id) {
  const note = state.notes.find((n) => n.id === id);
  if (!note) return;
  const examples = (note.examples || []).map((e) =>
    `<li><div class="ja">${escapeHtml(e.ja || '')}</div>${e.zh ? `<div class="zh">${escapeHtml(e.zh)}</div>` : ''}</li>`
  ).join('');
  const tags = (note.tags || []).map((t) => `<span class="tag">${escapeHtml(t)}</span>`).join('');

  $('#modal-content').innerHTML = `
    <button class="modal-close" aria-label="閉じる">×</button>
    <h2>${escapeHtml(note.front)}</h2>
    ${note.kana ? `<div class="modal-kana">${escapeHtml(note.kana)}</div>` : ''}
    ${note.romaji ? `<div class="modal-romaji">${escapeHtml(note.romaji)}</div>` : ''}
    <div class="modal-back">${escapeHtml(note.back)}</div>
    ${note.pos ? `<div class="field"><div class="field-label">品詞 / Type</div><div class="field-value">${escapeHtml(note.pos)} <span style="color:var(--usuzumi-light);margin-left:0.4rem;">· ${TYPE_LABELS[note.type]?.ja || note.type}</span></div></div>` : ''}
    ${examples ? `<div class="field"><div class="field-label">例文</div><ul class="examples">${examples}</ul></div>` : ''}
    ${note.context_note ? `<div class="field"><div class="field-label">メモ</div><div class="field-value">${escapeHtml(note.context_note)}</div></div>` : ''}
    ${tags ? `<div class="field"><div class="field-label">タグ</div><div class="modal-tags">${tags}</div></div>` : ''}
    ${note.source ? `<div class="field"><div class="field-label">出典</div><div class="field-value">${escapeHtml(note.source)}</div></div>` : ''}
    <div class="field" style="margin-bottom:0;">
      <div class="field-label">SRS 状態</div>
      <div class="field-value">
        次回復習: ${note.srs?.next_review || '—'} ・
        間隔: ${note.srs?.interval ?? 0}日 ・
        復習回数: ${note.srs?.reps ?? 0}回 ・
        Ease: ${(note.srs?.ease ?? 2.5).toFixed(2)}
      </div>
    </div>
  `;
  $('#modal').classList.add('open');
  $('.modal-close').addEventListener('click', closeModal);
  document.addEventListener('keydown', escClose);
}

function closeModal() {
  $('#modal').classList.remove('open');
  document.removeEventListener('keydown', escClose);
}
function escClose(e) { if (e.key === 'Escape') closeModal(); }

/* ---------- ユーティリティ ---------- */
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function truncate(s, n) {
  s = String(s ?? '');
  return s.length > n ? s.slice(0, n) + '…' : s;
}

/* ---------- イベント ---------- */
function init() {
  $('#search-input').addEventListener('input', (e) => {
    state.filter.search = e.target.value;
    renderList();
  });
  $('#modal').addEventListener('click', (e) => {
    if (e.target.id === 'modal') closeModal();
  });
  loadNotes();
}

document.addEventListener('DOMContentLoaded', init);

/* ---------- Service Worker 登録 ---------- */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {/* silent */});
  });
}
