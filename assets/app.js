/* ========================================================
   日语学习笔记本 · App
   v2.0 — Quick Capture + AI 补全 + 待处理队列
   ======================================================== */

import { startQuiz, openTokenSettings } from './quiz.js';
import { hasToken, updateFile, getFile, putBinaryFile } from './github.js';
import { initialSrs } from './srs.js';
import { fillNoteWithAI, hasAiKey, setAiKey, getAiKey, getProxyUrl, setProxyUrl } from './ai.js';

const RAW_BASE = 'https://raw.githubusercontent.com/libraosang/nihongo-notebook/main/';

/* ===== 从 GitHub API 直接刷新（绕过 Pages CDN 缓存） ===== */
async function reloadFromGitHub() {
  if (hasToken()) {
    try {
      const { json } = await getFile('data/notes.json');
      state.notes = json?.notes || [];
      render();
      return;
    } catch {}
  }
  await loadNotes();
}

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
  pending: [],
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

async function loadPending() {
  if (!hasToken()) return;
  try {
    const { json } = await getFile('data/pending.json');
    state.pending = json?.pending || [];
  } catch {
    state.pending = [];
  }
  renderActionBar();
}

window._reloadNotes = loadNotes;
window._reloadFromGitHub = reloadFromGitHub;

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
    const thumb = n.image
      ? `<img class="card-thumb" src="${RAW_BASE}${esc(n.image)}" loading="lazy" alt="" onerror="this.style.display='none'">`
      : '';
    return `<div class="note-card ${status}" data-id="${n.id}">
      ${thumb}
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
  if (btn) {
    btn.disabled = due === 0;
    btn.innerHTML = due === 0
      ? '🌸 今日无待复习'
      : `📝 今日复习 <span class="badge-count">${due}</span>`;
  }
  const pendingBtn = $('#pending-btn');
  if (pendingBtn) {
    const n = state.pending.length;
    pendingBtn.style.display = n > 0 ? '' : 'none';
    pendingBtn.textContent = `⏳ ${n}`;
  }
}

/* ======================================================
   详情 Modal（含编辑 + 删除 + 图片）
   ====================================================== */
function openDetailModal(id) {
  const note = state.notes.find(n => n.id === id);
  if (!note) return;

  const examples = (note.examples || []).map(e =>
    `<li><div class="ja">${esc(e.ja || '')}</div>${e.zh ? `<div class="zh">${esc(e.zh)}</div>` : ''}</li>`
  ).join('');
  const tags = (note.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join('');

  const imageHtml = note.image
    ? `<div class="field">
        <div class="field-label">场景截图</div>
        <img class="modal-img" src="${RAW_BASE}${esc(note.image)}" loading="lazy"
             alt="场景截图" onerror="this.closest('.field').style.display='none'"
             onclick="document.getElementById('lightbox').classList.add('open');document.getElementById('lightbox-img').src=this.src">
       </div>`
    : '';

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
    ${imageHtml}
    <div class="field">
      <div class="field-label">SRS 状态</div>
      <div class="field-value">
        下次复习：${note.srs?.next_review || '—'} ·
        间隔：${note.srs?.interval ?? 0}天 ·
        已复习：${note.srs?.reps ?? 0}次 ·
        Ease：${(note.srs?.ease ?? 2.5).toFixed(2)}
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn-edit" id="modal-edit-btn">✏️ 编辑</button>
      <button class="btn-delete" id="modal-delete-btn">🗑 删除</button>
    </div>
  `;

  $('#modal').classList.add('open');
  $('.modal-close').addEventListener('click', closeDetailModal);
  document.addEventListener('keydown', onEscKey);
  $('#modal-edit-btn').addEventListener('click', () => { closeDetailModal(); openEditModal(note.id); });
  $('#modal-delete-btn').addEventListener('click', () => confirmDelete(note.id, note.front));
}

function closeDetailModal() {
  $('#modal').classList.remove('open');
  document.removeEventListener('keydown', onEscKey);
}

function onEscKey(e) {
  if (e.key === 'Escape') {
    closeDetailModal();
    closeEditModal();
    document.getElementById('lightbox')?.classList.remove('open');
  }
}

/* ======================================================
   删除确认
   ====================================================== */
async function confirmDelete(id, front) {
  if (!hasToken()) { openTokenSettings(); return; }
  if (!confirm(`确定删除「${front}」？\n\n删除后无法撤销（但 GitHub 仓库有历史记录可回溯）。`)) return;

  closeDetailModal();
  state.notes = state.notes.filter(n => n.id !== id);
  render();

  try {
    await updateFile('data/notes.json', data => {
      data.notes = (data.notes || []).filter(n => n.id !== id);
      data.updated_at = new Date().toISOString();
      return data;
    }, `delete: ${front} (${id})`);
    await reloadFromGitHub();
  } catch (e) {
    alert('删除失败，已恢复本地数据：' + (e.message || String(e)));
    await reloadFromGitHub();
  }
}

/* ======================================================
   编辑 Modal
   ====================================================== */
function openEditModal(id) {
  if (!hasToken()) { openTokenSettings(); return; }
  const note = state.notes.find(n => n.id === id);
  if (!note) return;
  _openNoteForm({ mode: 'edit', note });
}

function openAddModal() {
  if (!hasToken()) { openTokenSettings(); return; }
  _openQuickAddForm();
}

function closeEditModal() {
  $('#add-modal').classList.remove('open');
}

/* ======================================================
   快速添加表单（简化版，3 个字段）
   ====================================================== */
function _openQuickAddForm() {
  let capturedBlob = null;

  $('#add-modal-content').innerHTML = `
    <button class="modal-close" id="add-modal-close">×</button>
    <h2 style="margin-bottom:1.25rem;">＋ 添加笔记</h2>
    <div class="add-form">
      <div class="form-row">
        <label class="form-label">类型 <span class="req">*</span></label>
        <select id="qf-type" class="form-input">${TYPE_LABELS_OPTS}</select>
      </div>
      <div class="form-row">
        <label class="form-label">内容</label>
        <textarea id="qf-input" class="form-input" rows="3"
          placeholder="直接写日文词语或句子，也可加中文备注&#10;例：ブラッシュアップ — 刚才会议里同事说的"></textarea>
      </div>
      <div class="form-row">
        <label class="form-label">截图 <span class="form-hint-inline">可选</span></label>
        <div class="img-upload-wrap" id="qf-img-wrap">
          <input type="file" id="qf-img-input" accept="image/*" style="display:none">
          <div id="qf-img-preview"></div>
          <label for="qf-img-input" class="btn-upload-img" id="qf-img-label">📷 选择截图</label>
        </div>
      </div>
      <div id="quick-form-msg"></div>
      <div class="form-actions quick-form-actions">
        <button type="button" class="btn-primary" id="qf-ai-btn">AI 实时补全 ✨</button>
        <button type="button" class="btn-secondary" id="qf-queue-btn">先暂存 →</button>
        <button type="button" class="btn-link" id="qf-cancel">取消</button>
      </div>
    </div>
  `;

  $('#add-modal').classList.add('open');
  $('#add-modal-close').addEventListener('click', closeEditModal);
  $('#qf-cancel').addEventListener('click', closeEditModal);
  $('#add-modal').addEventListener('click', e => { if (e.target.id === 'add-modal') closeEditModal(); });

  $('#qf-img-input').addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    $('#qf-img-label').textContent = '⏳ 压缩中…';
    try {
      capturedBlob = await compressImage(file);
      const url = URL.createObjectURL(capturedBlob);
      $('#qf-img-preview').innerHTML = `
        <div class="img-preview-wrap">
          <img src="${url}" class="img-preview-thumb" alt="截图预览">
          <button type="button" class="btn-remove-img" id="qf-img-remove" title="移除">×</button>
        </div>`;
      $('#qf-img-label').textContent = '📷 更换截图';
      $('#qf-img-remove').addEventListener('click', () => {
        capturedBlob = null;
        URL.revokeObjectURL(url);
        $('#qf-img-preview').innerHTML = '';
        $('#qf-img-label').textContent = '📷 选择截图';
        $('#qf-img-input').value = '';
      });
    } catch {
      $('#qf-img-label').textContent = '📷 选择截图';
      showQuickMsg('图片处理失败，请重试', 'error');
    }
  });

  $('#qf-ai-btn').addEventListener('click', () => {
    const blob = capturedBlob;
    submitQuickToAI(blob);
  });
  $('#qf-queue-btn').addEventListener('click', () => {
    const blob = capturedBlob;
    submitQuickToQueue(blob);
  });

  $('#qf-input').focus();
}

function _getQuickFormData() {
  return {
    type:  $('#qf-type')?.value || 'word',
    input: $('#qf-input')?.value.trim() || '',
  };
}

function showQuickMsg(text, type) {
  const el = $('#quick-form-msg');
  if (!el) return;
  el.className = 'form-msg form-msg-' + type;
  el.textContent = text;
}

/* ======================================================
   快速添加 → AI 实时补全
   ====================================================== */
async function submitQuickToAI(imageBlob) {
  const { type, input } = _getQuickFormData();
  if (!input && !imageBlob) { showQuickMsg('请填写内容或添加截图', 'error'); return; }

  if (!hasAiKey()) {
    _openAiKeySetup();
    return;
  }

  const aiBtn = $('#qf-ai-btn');
  const queueBtn = $('#qf-queue-btn');
  if (aiBtn) aiBtn.disabled = true;
  if (queueBtn) queueBtn.disabled = true;
  showQuickMsg('🤖 AI 分析中，请稍候…', 'info');

  try {
    const aiNote = await fillNoteWithAI(type, input, imageBlob);
    _openNoteForm({ mode: 'ai-review', note: aiNote, imageBlob });
  } catch (e) {
    if (aiBtn) aiBtn.disabled = false;
    if (queueBtn) queueBtn.disabled = false;
    const isCors = e.message === 'Load failed' || e.message === 'Failed to fetch' || e instanceof TypeError;
    showQuickMsg(
      isCors
        ? '当前浏览器不支持直连 AI（CORS 限制，常见于 iPhone Safari）。可点「先暂存 →」，回家后让 Claude Code 补全。'
        : 'AI 补全失败：' + (e.message || String(e)),
      'error'
    );
  }
}

/* ======================================================
   快速添加 → 暂存到 pending 队列
   ====================================================== */
async function submitQuickToQueue(imageBlob) {
  const { type, input } = _getQuickFormData();
  if (!input && !imageBlob) { showQuickMsg('请填写内容或添加截图', 'error'); return; }

  const aiBtn = $('#qf-ai-btn');
  const queueBtn = $('#qf-queue-btn');
  if (aiBtn) aiBtn.disabled = true;
  if (queueBtn) queueBtn.disabled = true;
  showQuickMsg('正在保存…', 'info');

  try {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    let existingPending = [];
    try {
      const { json } = await getFile('data/pending.json');
      existingPending = json?.pending || [];
    } catch {}
    const sameDay = existingPending.filter(p => p.id.includes(today));
    const pendingId = `pending-${today}-${String(sameDay.length + 1).padStart(3, '0')}`;

    let imagePath;
    if (imageBlob) {
      imagePath = `data/pending-images/${pendingId}.webp`;
      await putBinaryFile(imagePath, imageBlob, `add pending image: ${pendingId}`);
    }

    const entry = {
      id: pendingId, type, input,
      ...(imagePath ? { image: imagePath } : {}),
      created_at: new Date().toISOString(),
    };

    await updateFile('data/pending.json', data => {
      data.pending = [...(data.pending || []), entry];
      data.updated_at = new Date().toISOString();
      return data;
    }, `add pending: ${truncate(input, 40) || '(image)'} (${type})`);

    state.pending = [...state.pending, entry];
    renderActionBar();
    showQuickMsg('✓ 已暂存！打开 Claude Code 说「处理待办笔记」来补全。', 'ok');
    setTimeout(closeEditModal, 2000);
  } catch (e) {
    if (aiBtn) aiBtn.disabled = false;
    if (queueBtn) queueBtn.disabled = false;
    showQuickMsg('保存失败：' + (e.message || String(e)), 'error');
  }
}

/* ======================================================
   AI Key 设置界面
   ====================================================== */
function _openAiKeySetup() {
  const curKey   = getAiKey();
  const curProxy = getProxyUrl();

  $('#add-modal-content').innerHTML = `
    <button class="modal-close" id="add-modal-close">×</button>
    <h2 style="margin-bottom:1.25rem;">✨ AI 设置</h2>
    <div class="add-form">
      <div class="form-row">
        <label class="form-label">Anthropic API Key <span class="req">*</span></label>
        <input type="password" id="ai-key-input" class="form-input" placeholder="sk-ant-api03-..."
               value="${esc(curKey)}">
        <div class="form-hint">
          在 <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">Anthropic Console</a> 创建 Key，只保存在本设备浏览器里。
        </div>
      </div>
      <div class="form-row" style="margin-top:.25rem;">
        <label class="form-label">Cloudflare Worker 代理 URL <span class="form-hint-inline">iPhone 必填</span></label>
        <input type="text" id="ai-proxy-input" class="form-input" placeholder="https://xxx.workers.dev"
               value="${esc(curProxy)}">
        <div class="form-hint" style="line-height:1.6;">
          iPhone/iOS 浏览器受 CORS 限制，需要先部署代理：<br>
          1. 打开 <a href="https://workers.cloudflare.com" target="_blank" rel="noopener">workers.cloudflare.com</a>（免费注册）<br>
          2. 创建 Worker → 粘贴 <code>assets/cf-worker.js</code> 里的代码 → Deploy<br>
          3. 把 Worker 域名填入此处
        </div>
      </div>
      <div id="ai-key-msg"></div>
      <div class="form-actions">
        <button type="button" class="btn-primary" id="ai-key-save">保存</button>
        <button type="button" class="btn-link" id="ai-key-back">← 返回</button>
      </div>
    </div>
  `;
  $('#add-modal-close').addEventListener('click', closeEditModal);
  $('#ai-key-back').addEventListener('click', () => _openQuickAddForm());
  $('#ai-key-save').addEventListener('click', () => {
    const k = $('#ai-key-input').value.trim();
    const p = $('#ai-proxy-input').value.trim();
    if (!k) { $('#ai-key-msg').innerHTML = '<span style="color:var(--akane)">请输入 API Key</span>'; return; }
    setAiKey(k);
    setProxyUrl(p);
    $('#ai-key-msg').innerHTML = `<span style="color:var(--moegi)">✓ 已保存${p ? '（含代理）' : ''}</span>`;
    setTimeout(() => _openQuickAddForm(), 700);
  });
  $('#ai-key-input').addEventListener('keydown', e => { if (e.key === 'Enter') $('#ai-proxy-input').focus(); });
}

/* ======================================================
   通用表单（编辑 / AI 预览共用）
   ====================================================== */
function _openNoteForm({ mode, note, imageBlob }) {
  const isEdit     = mode === 'edit';
  const isAiReview = mode === 'ai-review';

  const title    = isEdit ? '✏️ 编辑笔记' : '🤖 AI 补全结果 — 确认后保存';
  const btnLabel = isEdit ? '保存修改' : '确认保存';

  const prefill = note || {};
  const prefillExamples = (prefill.examples || []).length > 0
    ? (prefill.examples || []).map((e, i) => `
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
               value="${esc(prefill.front || '')}" autocomplete="off">
      </div>
      <div class="form-row">
        <label class="form-label">中文释义 <span class="req">*</span></label>
        <input type="text" id="f-back" class="form-input" placeholder="例：完善、打磨（已有方案）"
               value="${esc(prefill.back || '')}">
      </div>
      <div class="form-row form-row-half">
        <div>
          <label class="form-label">类型 <span class="req">*</span></label>
          <select id="f-type" class="form-input">${
            VALID_TYPES.map(t =>
              `<option value="${t}" ${prefill.type === t ? 'selected' : ''}>${TYPE_LABELS[t].zh}（${TYPE_LABELS[t].en}）</option>`
            ).join('')
          }</select>
        </div>
        <div>
          <label class="form-label">词性</label>
          <input type="text" id="f-pos" class="form-input" placeholder="名詞・サ変"
                 value="${esc(prefill.pos || '')}">
        </div>
      </div>
      <div class="form-row form-row-half">
        <div>
          <label class="form-label">假名读法</label>
          <input type="text" id="f-kana" class="form-input" placeholder="ぶらっしゅあっぷ"
                 value="${esc(prefill.kana || '')}">
        </div>
        <div>
          <label class="form-label">罗马音</label>
          <input type="text" id="f-romaji" class="form-input" placeholder="burasshuappu"
                 value="${esc(prefill.romaji || '')}">
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
               value="${esc((prefill.tags || []).join(', '))}">
        <div class="form-hint">常用：ビジネス · IT · ゲーム · N1~N5 · 外来語 · 和製英語 · 日常</div>
      </div>
      <div class="form-row">
        <label class="form-label">备注 / 记忆点</label>
        <textarea id="f-note" class="form-input" rows="2"
                  placeholder="用法陷阱、关联词、语感差异…">${esc(prefill.context_note || '')}</textarea>
      </div>
      <div class="form-row">
        <label class="form-label">来源</label>
        <input type="text" id="f-source" class="form-input" placeholder="会议、文档、影视…"
               value="${esc(prefill.source || '')}">
      </div>

      <div id="add-form-msg"></div>

      <div class="form-actions">
        <button type="button" class="btn-primary" id="add-submit-btn">${btnLabel}</button>
        ${isAiReview ? `<button type="button" class="btn-link" id="add-back-btn">← 重新输入</button>` : ''}
        <button type="button" class="btn-link" id="add-cancel-btn">取消</button>
      </div>
    </div>
  `;

  $('#add-modal').classList.add('open');
  $('#add-modal-close').addEventListener('click', closeEditModal);
  $('#add-cancel-btn').addEventListener('click', closeEditModal);
  $('#add-modal').addEventListener('click', e => { if (e.target.id === 'add-modal') closeEditModal(); });
  $('#add-back-btn')?.addEventListener('click', () => _openQuickAddForm());

  $$('#examples-list .btn-remove-ex').forEach(btn =>
    btn.addEventListener('click', () => btn.closest('.example-row').remove())
  );
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

  $('#add-submit-btn').addEventListener('click', () =>
    isEdit ? submitEditNote(note.id) : submitAddNote(imageBlob ?? null)
  );

  $('#f-front').focus();
}

/* ======================================================
   添加（新条目）— 含可选图片上传
   ====================================================== */
async function submitAddNote(imageBlob = null) {
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
    // Pre-read to generate a stable ID before uploading image
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    let currentNotes = [];
    try {
      const { json } = await getFile('data/notes.json');
      currentNotes = json?.notes || [];
    } catch {}
    const seq = currentNotes.filter(n => n.id.startsWith(today)).length + 1;
    const newId = `${today}-${String(seq).padStart(3, '0')}`;

    let imagePath = null;
    if (imageBlob) {
      imagePath = `data/images/${newId}.webp`;
      showFormMsg('正在上传截图…', 'info');
      await putBinaryFile(imagePath, imageBlob, `add image: ${newId}`);
    }

    showFormMsg('正在保存笔记…', 'info');
    await updateFile('data/notes.json', data => {
      const note = {
        id: newId, type, front, back,
        kana:         $('#f-kana').value.trim() || front,
        romaji:       $('#f-romaji').value.trim(),
        pos:          $('#f-pos').value.trim(),
        examples, tags,
        source:       $('#f-source').value.trim() || '网页录入',
        context_note: $('#f-note').value.trim(),
        created_at:   new Date().toISOString(),
        srs:          initialSrs(),
      };
      if (imagePath) note.image = imagePath;
      data.notes = [...(data.notes || []), note];
      data.updated_at = new Date().toISOString();
      return data;
    }, `add: ${front} (${type}) via web`);

    showFormMsg(`✓ 已保存！ID: ${newId}`, 'ok');
    await reloadFromGitHub();
    setTimeout(closeEditModal, 900);
  } catch (e) {
    $('#add-submit-btn').disabled = false;
    showFormMsg('保存失败：' + (e.message || String(e)), 'error');
  }
}

/* ======================================================
   编辑（覆盖已有条目）
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
          ...n,
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
    await reloadFromGitHub();
    setTimeout(closeEditModal, 700);
  } catch (e) {
    $('#add-submit-btn').disabled = false;
    showFormMsg('保存失败：' + (e.message || String(e)), 'error');
  }
}

/* ======================================================
   待处理队列视图
   ====================================================== */
async function openPendingView() {
  if (!hasToken()) { openTokenSettings(); return; }
  try {
    const { json } = await getFile('data/pending.json');
    state.pending = json?.pending || [];
  } catch { state.pending = []; }
  _renderPendingModal();
}

function _renderPendingModal() {
  const items = state.pending;
  const itemsHtml = !items.length
    ? '<div class="empty" style="padding:2rem 0"><div class="em">✓</div>没有待处理的笔记</div>'
    : items.map(p => `
        <div class="pending-item" data-id="${esc(p.id)}">
          <div class="pending-item-header">
            <span class="pending-type-badge">${TYPE_LABELS[p.type]?.zh || p.type}</span>
            <button class="btn-delete pending-del-btn" data-id="${esc(p.id)}" title="删除">🗑</button>
          </div>
          <div class="pending-input">${esc(p.input || '（无文字内容）')}</div>
          ${p.image ? `<img class="pending-thumb" src="${RAW_BASE}${esc(p.image)}" loading="lazy" alt="" onerror="this.style.display='none'">` : ''}
          <div class="pending-date">${new Date(p.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
        </div>`).join('');

  $('#add-modal-content').innerHTML = `
    <button class="modal-close" id="add-modal-close">×</button>
    <h2 style="margin-bottom:.75rem;">⏳ 待处理 · ${items.length} 条</h2>
    <p class="form-hint" style="margin-bottom:1.25rem;font-size:.85rem;">
      打开 Claude Code 说「处理待办笔记」，逐条 AI 补全后供你确认保存。
    </p>
    <div id="pending-list">${itemsHtml}</div>
  `;

  $('#add-modal').classList.add('open');
  $('#add-modal-close').addEventListener('click', closeEditModal);
  $('#add-modal').addEventListener('click', e => { if (e.target.id === 'add-modal') closeEditModal(); });

  $$('#pending-list .pending-del-btn').forEach(btn =>
    btn.addEventListener('click', () => deletePendingItem(btn.dataset.id))
  );
}

async function deletePendingItem(id) {
  if (!confirm('确定删除这条待处理记录？')) return;
  try {
    await updateFile('data/pending.json', data => {
      data.pending = (data.pending || []).filter(p => p.id !== id);
      data.updated_at = new Date().toISOString();
      return data;
    }, `remove pending: ${id}`);
    state.pending = state.pending.filter(p => p.id !== id);
    renderActionBar();
    _renderPendingModal();
  } catch (e) {
    alert('删除失败：' + (e.message || String(e)));
  }
}

/* ======================================================
   图片压缩（Canvas → WebP）
   ====================================================== */
function compressImage(file, { maxSize = 1024, quality = 0.82 } = {}) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      if (width > maxSize || height > maxSize) {
        if (width >= height) { height = Math.round(height * maxSize / width); width = maxSize; }
        else { width = Math.round(width * maxSize / height); height = maxSize; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        blob => blob ? resolve(blob) : reject(new Error('压缩失败')),
        'image/webp',
        quality
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('图片读取失败')); };
    img.src = url;
  });
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
  $('#pending-btn')?.addEventListener('click', () => openPendingView());

  // Lightbox 关闭
  document.getElementById('lightbox')?.addEventListener('click', e => {
    if (e.target.id === 'lightbox' || e.target.id === 'lightbox-close') {
      document.getElementById('lightbox').classList.remove('open');
    }
  });

  loadNotes();
  loadPending();
}
document.addEventListener('DOMContentLoaded', init);

/* ===== SW 注册 ===== */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
