/* ========================================================
   日语学习笔记本 · App
   v1.2 — 编辑 + 删除功能
   ======================================================== */

import { startQuiz, openTokenSettings } from './quiz.js';
import { hasToken, updateFile } from './github.js';
import { initialSrs } from './srs.js';

/* ===== 常量 ===== */
const TYPE_LABELS = {
  all:        { zh: '全部',   en: 'ALL' },
  word:       { zh: '单词',   en: 'WORD' },
  phrase:     { zh: '句型',   en: 'PHRASE' },
  grammar:    { zh: '语法',   en: 'GRAMMAR' },
  expression: { zh: '表达',   en: 'EXPRESSION' },
  culture:    { zh: '文化',   en: 'CULTURE' },
};
const VALID_TYPES = ['word', 'phrase', 'grammar', 'expression', 'culture'];
const TYPE_LABELS_OPTS = VALID_TYPES.map(t =>
  `<option value="${t}">${TYPE_LABELS[t].zh}（${TYPE_LABELS[t].en}）</option>`
).join('');

const state = {
  notes: [],
  filter: { type: 'all', search: '', tag: null },
};

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));
const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const truncate = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n) + '…' : s; };

/* ===== 数据加载 ===== */
async function loadNotes() {
  try {
    const res = await fetch('data/notes.json?v=' + Date.now(), { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    state.notes = data.notes || [];
    render();
  } catch (err) {
    $('#notes-list').innerHTML =
      `<div class="empty"><div class="em">⚠</div>数据加载失败<br><small>${esc(err.message)}</small></div>`;
  }
}
window._reloadNotes = loadNotes;

/* ===== SRS 状态 ===== */
function getSrsStatus(note) {
  const srs = note.srs || {};
  const today = new Date().toISOString().slice(0, 10);
  if (srs.next_review && srs.next_review <= today) return 'due';
  if (srs.reps >= 5 && srs.ease >= 2.5) return 'mastered';
  return 'normal';
}

/* ===== 过滤 ===== */
function getFilteredNotes() {
  const { type, search, tag } = state.filter;
  const q = search.trim().toLowerCase();
  return state.notes.filter(n => {
    if (type !== 'all' && n.type !== type) return false;
    if (tag && !(n.tags || []).includes(tag)) return false;
    if (q) {
      const hay = [
        n.front, n.back, n.kana, n.romaji, n.context_note, n.source,
        ...(n.tags || []),
        ...(n.examples || []).flatMap(e => [e.ja, e.zh]),
      ].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/* ===== 渲染 ===== */
function render() {
  renderTabs();
  renderTagFilters();
  renderList();
  renderStats();
  renderActionBar();
}

function renderTabs() {
  const counts = state.notes.reduce((acc, n) => {
    acc[n.type] = (acc[n.type] || 0) + 1;
    acc.all = (acc.all || 0) + 1;
    return acc;
  }, {});
  $('#tabs').innerHTML = ['all', ...VALID_TYPES].map(t => {
    const c = counts[t] || 0;
    if (t !== 'all' && c === 0) return '';
    const active = state.filter.type === t ? 'active' : '';
    return `<button class="tab ${active}" data-type="${t}">${TYPE_LABELS[t].zh}<span class="count">${c}</span></button>`;
  }).join('');
  $$('#tabs .tab').forEach(btn => btn.addEventListener('click', () => {
    state.filter.type = btn.dataset.type;
    state.filter.tag = null;
    render();
  }));
}

function renderTagFilters() {
  const candidates = state.notes.filter(n => state.filter.type === 'all' || n.type === state.filter.type);
  const tagSet = new Map();
  candidates.forEach(n => (n.tags || []).forEach(t => tagSet.set(t, (tagSet.get(t) || 0) + 1)));
  const tags = Array.from(tagSet.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20);
  if (!tags.length) { $('#tag-filters').innerHTML = ''; return; }
  $('#tag-filters').innerHTML = '<span class="label">#</span>' +
    tags.map(([t, c]) => {
      const active = state.filter.tag === t ? 'active' : '';
      return `<span class="tag-pill ${active}" data-tag="${t}">${t} <small>${c}</small></span>`;
    }).join('');
  $$('#tag-filters .tag-pill').forEach(el => el.addEventListener('click', () => {
    state.filter.tag = state.filter.tag === el.dataset.tag ? null : el.dataset.tag;
    render();
  }));
}

function renderList() {
  const list = getFilteredNotes();
  if (!list.length) {
    const msg = !state.notes.length
      ? '还没有笔记，点击「＋ 添加笔记」开始记录吧！'
      : '没有符合条件的笔记';
    $('#notes-list').innerHTML = `<div class="empty"><div class="em">·</div>${msg}</div>`;
    return;
  }
  $('#notes-list').innerHTML = list.map(n => {
    const status = getSrsStatus(n);
    const tags = (n.tags || []).slice(0, 3).map(t => `<span class="tag">${esc(t)}</span>`).join('');
    return `<div class="note-card ${status}" data-id="${n.id}">
      <span class="type-badge">${TYPE_LABELS[n.type]?.zh || n.type}</span>
      <div class="front">${esc(n.front)}</div>
      ${n.kana && n.kana !== n.front ? `<div class="kana">${esc(n.kana)}</div>` : ''}
      <div class="back">${esc(truncate(n.back, 60))}</div>
      ${tags ? `<div class="meta">${tags}</div>` : ''}
      <span class="srs-dot" title="${status === 'due' ? '待复习' : status === 'mastered' ? '已掌握' : '正常'}"></span>
    </div>`;
  }).join('');
  $$('#notes-list .note-card').forEach(card =>
    card.addEventListener('click', () => openDetailModal(card.dataset.id))
  );
}

function renderStats() {
  const total = state.notes.length;
  const due = state.notes.filter(n => getSrsStatus(n) === 'due').length;
  $('#stats').innerHTML = `<strong>${total}</strong> 条笔记 · <strong>${due}</strong> 条待复习`;
}

function renderActionBar() {
  const due = state.notes.filter(n => getSrsStatus(n) === 'due').length;
  const btn = $('#quiz-btn');
  if (!btn) return;
  btn.disabled = due === 0;
  btn.innerHTML = due === 0
    ? '🌸 今日无待复习'
    : `📝 今日复习 <span class="badge-count">${due}</span>`;
}

/* ======================================================
   详情 Modal（含编辑 + 删除入口）
   ====================================================== */
function openDetailModal(id) {
  const note = state.notes.find(n => n.id === id);
  if (!note) return;

  const examples = (note.examples || []).map(e =>
    `<li><div class="ja">${esc(e.ja || '')}</div>${e.zh ? `<div class="zh">${esc(e.zh)}</div>` : ''}</li>`
  ).join('');
  const tags = (note.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('');

  // 编辑/删除按钮只在有 Token 时显示（无 Token 也能看，但改不了）
  const actionBtns = `
    <div class="modal-actions">
      <button class="btn-edit" id="modal-edit-btn">✏️ 编辑</button>
      <button class="btn-delete" id="modal-delete-btn">🗑 删除</button>
    </div>`;

  $('#modal-content').innerHTML = `
    <button class="modal-close" aria-label="关闭">×</button>
    <h2>${esc(note.front)}</h2>
    ${note.kana ? `<div class="modal-kana">${esc(note.kana)}</div>` : ''}
    ${note.romaji ? `<div class="modal-romaji">${esc(note.romaji)}</div>` : ''}
    <div class="modal-back">${esc(note.back)}</div>
    ${note.pos ? `<div class="field"><div class="field-label">词性 / 分类</div><div class="field-value">${esc(note.pos)} <span style="color:var(--usuzumi-light);margin-left:.4rem;">· ${TYPE_LABELS[note.type]?.zh || note.type}</span></div></div>` : ''}
    ${examples ? `<div class="field"><div class="field-label">例句</div><ul class="examples">${examples}</ul></div>` : ''}
    ${note.context_note ? `<div class="field"><div class="field-label">备注</div><div class="field-value">${esc(note.context_note)}</div></div>` : ''}
    ${tags ? `<div class="field"><div class="field-label">标签</div><div class="modal-tags">${tags}</div></div>` : ''}
    ${note.source ? `<div class="field"><div class="field-label">来源</div><div class="field-value">${esc(note.source)}</div></div>` : ''}
    <div class="field">
      <div class="field-label">SRS 状态</div>
      <div class="field-value">
        下次复习：${note.srs?.next_review || '—'} ·
        间隔：${note.srs?.interval ?? 0}天 ·
        已复习：${note.srs?.reps ?? 0}次 ·
        Ease：${(note.srs?.ease ?? 2.5).toFixed(2)}
      </div>
    </div>
    ${actionBtns}
  `;

  $('#modal').classList.add('open');
  $('.modal-close').addEventListener('click', closeDetailModal);
  document.addEventListener('keydown', onEscKey);

  $('#modal-edit-btn').addEventListener('click', () => {
    closeDetailModal();
    openEditModal(note.id);
  });
  $('#modal-delete-btn').addEventListener('click', () => confirmDelete(note.id, note.front));
}

function closeDetailModal() {
  $('#modal').classList.remove('open');
  document.removeEventListener('keydown', onEscKey);
}

function onEscKey(e) {
  if (e.key === 'Escape') { closeDetailModal(); closeEditModal(); }
}

/* ======================================================
   删除确认
   ====================================================== */
async function confirmDelete(id, front) {
  if (!hasToken()) { openTokenSettings(); return; }
  if (!confirm(`确定删除「${front}」？\n\n删除后无法撤销（但 GitHub 仓库有历史记录可回溯）。`)) return;

  // 乐观更新本地列表
  closeDetailModal();
  state.notes = state.notes.filter(n => n.id !== id);
  render();

  try {
    await updateFile('data/notes.json', data => {
      data.notes = (data.notes || []).filter(n => n.id !== id);
      data.updated_at = new Date().toISOString();
      return data;
    }, `delete: ${front} (${id})`);
    // 写回成功后重新拉一次确保同步
    await loadNotes();
  } catch (e) {
    alert('删除失败，已恢复本地数据：' + (e.message || String(e)));
    await loadNotes(); // 从 GitHub 恢复
  }
}

/* ======================================================
   编辑 Modal（复用添加表单，预填数据）
   ====================================================== */
function openEditModal(id) {
  if (!hasToken()) { openTokenSettings(); return; }
  const note = state.notes.find(n => n.id === id);
  if (!note) return;
  _openNoteForm({ mode: 'edit', note });
}

function openAddModal() {
  if (!hasToken()) { openTokenSettings(); return; }
  _openNoteForm({ mode: 'add' });
}

function closeEditModal() {
  $('#add-modal').classList.remove('open');
}

/* 通用表单（添加 / 编辑共用） */
function _openNoteForm({ mode, note }) {
  const isEdit = mode === 'edit';
  const title  = isEdit ? `✏️ 编辑笔记` : `＋ 添加笔记`;
  const btnLabel = isEdit ? '保存修改' : '保存到笔记本';

  // 预填例句行
  const prefillExamples = isEdit && (note.examples || []).length > 0
    ? (note.examples || []).map((e, i) => `
        <div class="example-row">
          <input type="text" class="form-input ex-ja" placeholder="日语例句" value="${esc(e.ja || '')}">
          <input type="text" class="form-input ex-zh" placeholder="中文翻译（可选）" value="${esc(e.zh || '')}">
          ${i > 0 ? '<button type="button" class="btn-remove-ex" title="删除">×</button>' : ''}
        </div>`).join('')
    : `<div class="example-row">
        <input type="text" class="form-input ex-ja" placeholder="日语例句">
        <input type="text" class="form-input ex-zh" placeholder="中文翻译（可选）">
      </div>`;

  $('#add-modal-content').innerHTML = `
    <button class="modal-close" id="add-modal-close">×</button>
    <h2 style="margin-bottom:1.25rem;">${title}</h2>

    <div class="add-form">
      <div class="form-row">
        <label class="form-label">单词 / 表达 <span class="req">*</span></label>
        <input type="text" id="f-front" class="form-input" placeholder="例：ブラッシュアップ"
               value="${isEdit ? esc(note.front) : ''}" autocomplete="off">
      </div>
      <div class="form-row">
        <label class="form-label">中文释义 <span class="req">*</span></label>
        <input type="text" id="f-back" class="form-input" placeholder="例：完善、打磨（已有方案）"
               value="${isEdit ? esc(note.back) : ''}">
      </div>
      <div class="form-row form-row-half">
        <div>
          <label class="form-label">类型 <span class="req">*</span></label>
          <select id="f-type" class="form-input">${
            VALID_TYPES.map(t =>
              `<option value="${t}" ${isEdit && note.type === t ? 'selected' : ''}>${TYPE_LABELS[t].zh}（${TYPE_LABELS[t].en}）</option>`
            ).join('')
          }</select>
        </div>
        <div>
          <label class="form-label">词性</label>
          <input type="text" id="f-pos" class="form-input" placeholder="名詞・サ変"
                 value="${isEdit ? esc(note.pos || '') : ''}">
        </div>
      </div>
      <div class="form-row form-row-half">
        <div>
          <label class="form-label">假名读法</label>
          <input type="text" id="f-kana" class="form-input" placeholder="ぶらっしゅあっぷ"
                 value="${isEdit ? esc(note.kana || '') : ''}">
        </div>
        <div>
          <label class="form-label">罗马音</label>
          <input type="text" id="f-romaji" class="form-input" placeholder="burasshuappu"
                 value="${isEdit ? esc(note.romaji || '') : ''}">
        </div>
      </div>
      <div class="form-row">
        <label class="form-label">例句</label>
        <div id="examples-list">${prefillExamples}</div>
        <button type="button" class="btn-link" id="add-example-btn">＋ 添加一行</button>
      </div>
      <div class="form-row">
        <label class="form-label">标签</label>
        <input type="text" id="f-tags" class="form-input" placeholder="用逗号分隔，例：ビジネス,外来語,N2"
               value="${isEdit ? esc((note.tags || []).join(', ')) : ''}">
        <div class="form-hint">常用：ビジネス · IT · ゲーム · N1~N5 · 外来語 · 和製英語 · 日常</div>
      </div>
      <div class="form-row">
        <label class="form-label">备注 / 记忆点</label>
        <textarea id="f-note" class="form-input" rows="2"
                  placeholder="用法陷阱、关联词、语感差异…">${isEdit ? esc(note.context_note || '') : ''}</textarea>
      </div>
      <div class="form-row">
        <label class="form-label">来源</label>
        <input type="text" id="f-source" class="form-input" placeholder="会议、文档、影视…"
               value="${isEdit ? esc(note.source || '') : ''}">
      </div>

      <div id="add-form-msg"></div>

      <div class="form-actions">
        <button type="button" class="btn-primary" id="add-submit-btn">${btnLabel}</button>
        <button type="button" class="btn-link"    id="add-cancel-btn">取消</button>
      </div>
    </div>
  `;

  $('#add-modal').classList.add('open');

  // 关闭
  $('#add-modal-close').addEventListener('click', closeEditModal);
  $('#add-cancel-btn').addEventListener('click', closeEditModal);
  $('#add-modal').addEventListener('click', e => { if (e.target.id === 'add-modal') closeEditModal(); });

  // 例句行：删除按钮绑定
  $$('#examples-list .btn-remove-ex').forEach(btn =>
    btn.addEventListener('click', () => btn.closest('.example-row').remove())
  );

  // 例句行：添加
  $('#add-example-btn').addEventListener('click', () => {
    const row = document.createElement('div');
    row.className = 'example-row';
    row.innerHTML = `
      <input type="text" class="form-input ex-ja" placeholder="日语例句">
      <input type="text" class="form-input ex-zh" placeholder="中文翻译（可选）">
      <button type="button" class="btn-remove-ex" title="删除">×</button>
    `;
    row.querySelector('.btn-remove-ex').addEventListener('click', () => row.remove());
    $('#examples-list').appendChild(row);
  });

  // 提交
  $('#add-submit-btn').addEventListener('click', () =>
    isEdit ? submitEditNote(note.id) : submitAddNote()
  );

  $('#f-front').focus();
}

/* ======================================================
   添加（新条目）
   ====================================================== */
async function submitAddNote() {
  const front = $('#f-front').value.trim();
  const back  = $('#f-back').value.trim();
  const type  = $('#f-type').value;
  if (!front) { showFormMsg('请填写单词/表达', 'error'); return; }
  if (!back)  { showFormMsg('请填写中文释义', 'error'); return; }

  const examples = collectExamples();
  const tags     = collectTags();

  showFormMsg('正在保存…', 'info');
  $('#add-submit-btn').disabled = true;

  try {
    let newId;
    await updateFile('data/notes.json', data => {
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const seq   = (data.notes || []).filter(n => n.id.startsWith(today)).length + 1;
      newId = `${today}-${String(seq).padStart(3, '0')}`;

      data.notes = [...(data.notes || []), {
        id: newId, type, front, back,
        kana:         $('#f-kana').value.trim() || front,
        romaji:       $('#f-romaji').value.trim(),
        pos:          $('#f-pos').value.trim(),
        examples, tags,
        source:       $('#f-source').value.trim() || '网页录入',
        context_note: $('#f-note').value.trim(),
        created_at:   new Date().toISOString(),
        srs:          initialSrs(),
      }];
      data.updated_at = new Date().toISOString();
      return data;
    }, `add: ${front} (${type}) via web`);

    showFormMsg(`✓ 已保存！ID: ${newId}`, 'ok');
    await loadNotes();
    setTimeout(closeEditModal, 900);
  } catch (e) {
    $('#add-submit-btn').disabled = false;
    showFormMsg('保存失败：' + (e.message || String(e)), 'error');
  }
}

/* ======================================================
   编辑（覆盖已有条目，保留 id / created_at / srs）
   ====================================================== */
async function submitEditNote(id) {
  const front = $('#f-front').value.trim();
  const back  = $('#f-back').value.trim();
  const type  = $('#f-type').value;
  if (!front) { showFormMsg('请填写单词/表达', 'error'); return; }
  if (!back)  { showFormMsg('请填写中文释义', 'error'); return; }

  const examples = collectExamples();
  const tags     = collectTags();

  showFormMsg('正在保存…', 'info');
  $('#add-submit-btn').disabled = true;

  try {
    await updateFile('data/notes.json', data => {
      data.notes = (data.notes || []).map(n => {
        if (n.id !== id) return n;
        return {
          ...n,                               // 保留 id / created_at / srs
          type, front, back,
          kana:         $('#f-kana').value.trim() || front,
          romaji:       $('#f-romaji').value.trim(),
          pos:          $('#f-pos').value.trim(),
          examples, tags,
          source:       $('#f-source').value.trim() || n.source || '网页录入',
          context_note: $('#f-note').value.trim(),
          updated_at:   new Date().toISOString(),
        };
      });
      data.updated_at = new Date().toISOString();
      return data;
    }, `edit: ${front} (${id}) via web`);

    showFormMsg('✓ 已保存！', 'ok');
    await loadNotes();
    setTimeout(closeEditModal, 700);
  } catch (e) {
    $('#add-submit-btn').disabled = false;
    showFormMsg('保存失败：' + (e.message || String(e)), 'error');
  }
}

/* ======================================================
   工具函数
   ====================================================== */
function collectExamples() {
  return Array.from($$('#examples-list .example-row')).map(row => ({
    ja: row.querySelector('.ex-ja')?.value.trim() || '',
    zh: row.querySelector('.ex-zh')?.value.trim() || '',
  })).filter(e => e.ja);
}
function collectTags() {
  const raw = $('#f-tags')?.value.trim() || '';
  return raw ? raw.split(/[,，、\s]+/).map(t => t.trim()).filter(Boolean) : [];
}
function showFormMsg(text, type) {
  const el = $('#add-form-msg');
  if (!el) return;
  el.className = 'form-msg form-msg-' + type;
  el.textContent = text;
}

/* ===== 初始化 ===== */
function init() {
  $('#search-input').addEventListener('input', e => {
    state.filter.search = e.target.value;
    renderList();
  });
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeDetailModal(); });
  $('#quiz-btn')?.addEventListener('click', () => startQuiz());
  $('#token-btn')?.addEventListener('click', () => openTokenSettings());
  $('#add-btn')?.addEventListener('click', () => openAddModal());
  loadNotes();
}
document.addEventListener('DOMContentLoaded', init);

/* ===== SW 注册 ===== */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
