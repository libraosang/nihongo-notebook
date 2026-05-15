/* ========================================================
   日语学习笔记本 · App
   v1.1 — 简体中文 UI + 网页快速录入
   ======================================================== */

import { startQuiz, openTokenSettings } from './quiz.js';
import { hasToken, updateFile, getFile } from './github.js';
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
const TYPE_LABELS_OPTS = VALID_TYPES.map(t => `<option value="${t}">${TYPE_LABELS[t].zh}（${TYPE_LABELS[t].en}）</option>`).join('');

const state = {
  notes: [],
  filter: { type: 'all', search: '', tag: null },
  loaded: false,
};

const $ = s => document.querySelector(s);
const $$ = s => Array.from(document.querySelectorAll(s));

/* ===== 数据加载 ===== */
async function loadNotes() {
  try {
    const res = await fetch('data/notes.json?v=' + Date.now(), { cache: 'no-cache' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const data = await res.json();
    state.notes = data.notes || [];
    state.loaded = true;
    render();
  } catch (err) {
    $('#notes-list').innerHTML =
      `<div class="empty"><div class="em">⚠</div>数据加载失败<br><small>${escapeHtml(err.message)}</small></div>`;
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
  $$('#tabs .tab').forEach(btn => {
    btn.addEventListener('click', () => {
      state.filter.type = btn.dataset.type;
      state.filter.tag = null;
      render();
    });
  });
}

function renderTagFilters() {
  const candidates = state.notes.filter(n => state.filter.type === 'all' || n.type === state.filter.type);
  const tagSet = new Map();
  candidates.forEach(n => (n.tags || []).forEach(t => tagSet.set(t, (tagSet.get(t) || 0) + 1)));
  const tags = Array.from(tagSet.entries()).sort((a, b) => b[1] - a[1]).slice(0, 20);
  if (!tags.length) { $('#tag-filters').innerHTML = ''; return; }
  $('#tag-filters').innerHTML =
    '<span class="label">#</span>' +
    tags.map(([t, c]) => {
      const active = state.filter.tag === t ? 'active' : '';
      return `<span class="tag-pill ${active}" data-tag="${t}">${t} <small>${c}</small></span>`;
    }).join('');
  $$('#tag-filters .tag-pill').forEach(el => {
    el.addEventListener('click', () => {
      state.filter.tag = state.filter.tag === el.dataset.tag ? null : el.dataset.tag;
      render();
    });
  });
}

function renderList() {
  const list = getFilteredNotes();
  if (!list.length) {
    const msg = !state.notes.length ? '还没有笔记，点击「＋ 添加笔记」开始记录吧！'
                                    : '没有符合条件的笔记';
    $('#notes-list').innerHTML = `<div class="empty"><div class="em">·</div>${msg}</div>`;
    return;
  }
  $('#notes-list').innerHTML = list.map(n => {
    const status = getSrsStatus(n);
    const tags = (n.tags || []).slice(0, 3).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
    return `<div class="note-card ${status}" data-id="${n.id}">
      <span class="type-badge">${TYPE_LABELS[n.type]?.zh || n.type}</span>
      <div class="front">${escapeHtml(n.front)}</div>
      ${n.kana && n.kana !== n.front ? `<div class="kana">${escapeHtml(n.kana)}</div>` : ''}
      <div class="back">${escapeHtml(truncate(n.back, 60))}</div>
      ${tags ? `<div class="meta">${tags}</div>` : ''}
      <span class="srs-dot" title="${status === 'due' ? '待复习' : status === 'mastered' ? '已掌握' : '正常'}"></span>
    </div>`;
  }).join('');
  $$('#notes-list .note-card').forEach(card => card.addEventListener('click', () => openModal(card.dataset.id)));
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
  if (due === 0) {
    btn.disabled = true;
    btn.innerHTML = '🌸 今日无待复习';
  } else {
    btn.disabled = false;
    btn.innerHTML = `📝 今日复习 <span class="badge-count">${due}</span>`;
  }
}

/* ===== 详情 Modal ===== */
function openModal(id) {
  const note = state.notes.find(n => n.id === id);
  if (!note) return;
  const examples = (note.examples || []).map(e =>
    `<li><div class="ja">${escapeHtml(e.ja || '')}</div>${e.zh ? `<div class="zh">${escapeHtml(e.zh)}</div>` : ''}</li>`
  ).join('');
  const tags = (note.tags || []).map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('');
  $('#modal-content').innerHTML = `
    <button class="modal-close" aria-label="关闭">×</button>
    <h2>${escapeHtml(note.front)}</h2>
    ${note.kana ? `<div class="modal-kana">${escapeHtml(note.kana)}</div>` : ''}
    ${note.romaji ? `<div class="modal-romaji">${escapeHtml(note.romaji)}</div>` : ''}
    <div class="modal-back">${escapeHtml(note.back)}</div>
    ${note.pos ? `<div class="field"><div class="field-label">词性 / 分类</div><div class="field-value">${escapeHtml(note.pos)} <span style="color:var(--usuzumi-light);margin-left:.4rem;">· ${TYPE_LABELS[note.type]?.zh || note.type}</span></div></div>` : ''}
    ${examples ? `<div class="field"><div class="field-label">例句</div><ul class="examples">${examples}</ul></div>` : ''}
    ${note.context_note ? `<div class="field"><div class="field-label">备注</div><div class="field-value">${escapeHtml(note.context_note)}</div></div>` : ''}
    ${tags ? `<div class="field"><div class="field-label">标签</div><div class="modal-tags">${tags}</div></div>` : ''}
    ${note.source ? `<div class="field"><div class="field-label">来源</div><div class="field-value">${escapeHtml(note.source)}</div></div>` : ''}
    <div class="field" style="margin-bottom:0;">
      <div class="field-label">SRS 状态</div>
      <div class="field-value">
        下次复习：${note.srs?.next_review || '—'} ·
        间隔：${note.srs?.interval ?? 0}天 ·
        已复习：${note.srs?.reps ?? 0}次 ·
        Ease：${(note.srs?.ease ?? 2.5).toFixed(2)}
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
function escClose(e) { if (e.key === 'Escape') { closeModal(); closeAddModal(); } }

/* ===================================================
   ＋ 添加笔记 Modal（网页快速录入）
   =================================================== */
function openAddModal() {
  if (!hasToken()) {
    openTokenSettings();
    return;
  }
  $('#add-modal-content').innerHTML = `
    <button class="modal-close" id="add-modal-close">×</button>
    <h2 style="margin-bottom:1.25rem;">＋ 添加笔记</h2>

    <div class="add-form">
      <!-- 必填：单词 -->
      <div class="form-row">
        <label class="form-label">单词 / 表达 <span class="req">*</span></label>
        <input type="text" id="f-front" class="form-input" placeholder="例：ブラッシュアップ" autocomplete="off">
      </div>

      <!-- 必填：释义 -->
      <div class="form-row">
        <label class="form-label">中文释义 <span class="req">*</span></label>
        <input type="text" id="f-back" class="form-input" placeholder="例：完善、打磨（已有方案）">
      </div>

      <!-- 类型 -->
      <div class="form-row form-row-half">
        <div>
          <label class="form-label">类型 <span class="req">*</span></label>
          <select id="f-type" class="form-input">${TYPE_LABELS_OPTS}</select>
        </div>
        <div>
          <label class="form-label">词性</label>
          <input type="text" id="f-pos" class="form-input" placeholder="名詞・サ変">
        </div>
      </div>

      <!-- 假名 / 罗马音 -->
      <div class="form-row form-row-half">
        <div>
          <label class="form-label">假名读法</label>
          <input type="text" id="f-kana" class="form-input" placeholder="ぶらっしゅあっぷ">
        </div>
        <div>
          <label class="form-label">罗马音</label>
          <input type="text" id="f-romaji" class="form-input" placeholder="burasshuappu">
        </div>
      </div>

      <!-- 例句 -->
      <div class="form-row" id="examples-section">
        <label class="form-label">例句</label>
        <div id="examples-list">
          <div class="example-row">
            <input type="text" class="form-input ex-ja" placeholder="日语例句">
            <input type="text" class="form-input ex-zh" placeholder="中文翻译（可选）">
          </div>
        </div>
        <button type="button" class="btn-link add-example-btn" id="add-example-btn">＋ 添加一行</button>
      </div>

      <!-- 标签 -->
      <div class="form-row">
        <label class="form-label">标签</label>
        <input type="text" id="f-tags" class="form-input" placeholder="用逗号分隔，例：ビジネス,外来語,N2">
        <div class="form-hint">常用：ビジネス · IT · ゲーム · N1~N5 · 外来語 · 和製英語 · 日常</div>
      </div>

      <!-- 备注 -->
      <div class="form-row">
        <label class="form-label">备注 / 记忆点</label>
        <textarea id="f-note" class="form-input" rows="2" placeholder="用法陷阱、关联词、语感差异…"></textarea>
      </div>

      <!-- 来源 -->
      <div class="form-row">
        <label class="form-label">来源</label>
        <input type="text" id="f-source" class="form-input" placeholder="会议、文档、影视…">
      </div>

      <div id="add-form-msg"></div>

      <div class="form-actions">
        <button type="button" class="btn-primary" id="add-submit-btn">保存到笔记本</button>
        <button type="button" class="btn-link" id="add-cancel-btn">取消</button>
      </div>
    </div>
  `;

  $('#add-modal').classList.add('open');

  // 关闭
  $('#add-modal-close').addEventListener('click', closeAddModal);
  $('#add-cancel-btn').addEventListener('click', closeAddModal);
  $('#add-modal').addEventListener('click', e => { if (e.target.id === 'add-modal') closeAddModal(); });

  // 添加例句行
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
  $('#add-submit-btn').addEventListener('click', submitAddNote);

  // front 变化时自动提示填假名
  $('#f-front').focus();
}

function closeAddModal() {
  $('#add-modal').classList.remove('open');
}

async function submitAddNote() {
  const front = $('#f-front').value.trim();
  const back  = $('#f-back').value.trim();
  const type  = $('#f-type').value;
  const msg   = $('#add-form-msg');

  // 校验
  if (!front) { showFormMsg('请填写单词/表达', 'error'); return; }
  if (!back)  { showFormMsg('请填写中文释义', 'error'); return; }

  // 收集例句
  const examples = Array.from($$('#examples-list .example-row')).map(row => ({
    ja: row.querySelector('.ex-ja')?.value.trim() || '',
    zh: row.querySelector('.ex-zh')?.value.trim() || '',
  })).filter(e => e.ja);

  // 收集标签
  const tagsRaw = $('#f-tags').value.trim();
  const tags = tagsRaw ? tagsRaw.split(/[,，、\s]+/).map(t => t.trim()).filter(Boolean) : [];

  showFormMsg('正在保存…', 'info');
  const btn = $('#add-submit-btn');
  btn.disabled = true;

  try {
    let newId;
    await updateFile('data/notes.json', data => {
      // 生成 ID
      const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
      const todayIds = (data.notes || []).filter(n => n.id.startsWith(today));
      const seq = todayIds.length + 1;
      newId = `${today}-${String(seq).padStart(3, '0')}`;

      const newNote = {
        id: newId,
        type,
        front,
        back,
        kana:         $('#f-kana').value.trim() || front,
        romaji:       $('#f-romaji').value.trim(),
        pos:          $('#f-pos').value.trim(),
        examples,
        tags,
        source:       $('#f-source').value.trim() || '网页录入',
        context_note: $('#f-note').value.trim(),
        created_at:   new Date().toISOString(),
        srs:          initialSrs(),
      };

      data.notes = [...(data.notes || []), newNote];
      data.updated_at = new Date().toISOString();
      return data;
    }, `add: ${front} (${type}) via web`);

    showFormMsg(`✓ 已保存！ID: ${newId}`, 'ok');
    // 重新拉数据刷新列表
    await loadNotes();
    setTimeout(closeAddModal, 900);
  } catch (e) {
    btn.disabled = false;
    showFormMsg('保存失败：' + (e.message || String(e)), 'error');
  }
}

function showFormMsg(text, type) {
  const el = $('#add-form-msg');
  if (!el) return;
  el.className = 'form-msg form-msg-' + type;
  el.textContent = text;
}

/* ===== quiz.js 中的文案汉化 patch ===== */
// quiz.js 已经有自己的语言控制，通过 window 暴露覆盖点
window._quizI18n = {
  loading:   '📚 正在准备今日复习…',
  empty:     '🌸 今日没有待复习的内容，继续加油！',
  saving:    '💾 正在写回 GitHub…',
  saved:     '✓ 已同步到 GitHub',
  saveFail:  '⚠ 写回失败，请重试',
  close:     '关闭',
  flipBtn:   '查看答案 ⤵',
  gradeHint: '你的掌握程度？',
  grade0:    '0\n完全忘了',
  grade3:    '3\n想起来了',
  grade4:    '4\n正常',
  grade5:    '5\n秒答',
  summary:   '🎯 本次复习结果',
  correct:   '正确',
  accuracy:  '正确率',
  avgScore:  '平均分',
  tokenTitle: '🔑 GitHub Token 设置',
  tokenDesc:  '需要 Fine-grained Personal Access Token（仅此仓库的 Contents 写权限）才能将答题结果写回。',
  tokenSave:  '验证并保存',
  tokenCancel:'取消',
  tokenMgmt:  '🔑 Token 管理',
  tokenRenew: '重新设置 Token',
  tokenDelete:'删除 Token',
  retryLabel: '重试保存',
  stopLabel:  '中途结束',
};

/* ===== 详情 Modal ===== */
function closeDetailModal() {
  $('#modal').classList.remove('open');
  document.removeEventListener('keydown', escClose);
}

/* ===== 初始化 ===== */
function init() {
  $('#search-input').addEventListener('input', e => {
    state.filter.search = e.target.value;
    renderList();
  });
  $('#modal').addEventListener('click', e => { if (e.target.id === 'modal') closeModal(); });
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

/* ===== 工具函数 ===== */
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function truncate(s, n) { s = String(s ?? ''); return s.length > n ? s.slice(0, n) + '…' : s; }
