/* ========================================================
   日语学习笔记本 · 答题 UI 控制器
   v1.1 — 简体中文 UI
   ======================================================== */

import { grade as srsGrade } from './srs.js';
import { hasToken, getFile, updateFile, verifyToken } from './github.js';

const i18n = () => window._quizI18n || {};

const TYPE_ZH = {
  word: '单词', phrase: '句型', grammar: '语法',
  expression: '表达', culture: '文化',
};

const state = {
  queue: [],
  index: 0,
  results: [],
  flipped: false,
};

const $ = s => document.querySelector(s);

/* ===== 启动 ===== */
export async function startQuiz() {
  if (!hasToken()) return showSetup('需要 GitHub Token 才能写回答题结果');
  const v = await verifyToken();
  if (!v.ok)          return showSetup('Token 无效：' + (v.error || ''));
  if (!v.permissions?.push) return showSetup('该 Token 没有写权限，请开启 Contents: Read & Write');

  showOverlay(`<div class="quiz-loading">📚 正在准备今日复习…</div>`);

  let notesData;
  try {
    const res = await getFile('data/notes.json');
    notesData = res.json;
  } catch (e) {
    return showOverlay(
      `<div class="quiz-error">⚠ 数据加载失败<br><small>${esc(e.message)}</small><br><br>` +
      `<button class="btn-primary" onclick="document.getElementById('quiz-overlay').classList.remove('open')">关闭</button></div>`
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const due = (notesData.notes || []).filter(n => (n.srs?.next_review || '9999-12-31') <= today);

  if (!due.length) {
    return showOverlay(`
      <div class="quiz-empty">
        <div class="em">🌸</div>
        <h3>今日没有待复习的内容</h3>
        <p>继续加油！</p>
        <button class="btn-primary" onclick="document.getElementById('quiz-overlay').classList.remove('open')">关闭</button>
      </div>`);
  }

  shuffle(due);
  Object.assign(state, { queue: due, index: 0, results: [], flipped: false });
  renderCard();
}

/* ===== 卡片渲染 ===== */
function renderCard() {
  const note = state.queue[state.index];
  if (!note) return finishQuiz();
  const total = state.queue.length;
  const idx   = state.index + 1;
  const qType = chooseQType(note);

  $('#quiz-overlay').classList.add('open');
  $('#quiz-overlay').innerHTML = `
    <div class="quiz-stage">
      <div class="quiz-header">
        <div class="quiz-progress">
          <span class="progress-text">${idx} / ${total}</span>
          <span class="progress-bar"><span class="progress-fill" style="width:${idx/total*100}%"></span></span>
        </div>
        <button class="quiz-close" aria-label="结束">×</button>
      </div>
      <div class="quiz-meta">
        <span class="badge">${TYPE_ZH[note.type] || note.type}</span>
        <span class="badge badge-q">${qType.label}</span>
      </div>
      <div class="quiz-card ${state.flipped ? 'flipped' : ''}">
        <div class="quiz-front">
          <div class="quiz-prompt">${esc(qType.prompt)}</div>
          <div class="quiz-question">${esc(qType.question)}</div>
          <button class="quiz-flip-btn">查看答案 ⤵</button>
        </div>
        <div class="quiz-back">
          <div class="quiz-answer-label">正确答案</div>
          <div class="quiz-answer">${esc(qType.answer)}</div>
          ${qType.kana && qType.kana !== qType.answer ? `<div class="quiz-answer-kana">${esc(qType.kana)}</div>` : ''}
          ${note.examples?.[0] ? `
            <div class="quiz-example">
              <div class="ja">${esc(note.examples[0].ja || '')}</div>
              ${note.examples[0].zh ? `<div class="zh">${esc(note.examples[0].zh)}</div>` : ''}
            </div>` : ''}
          ${note.context_note ? `<div class="quiz-note">💡 ${esc(note.context_note)}</div>` : ''}
          <div class="quiz-grades">
            <div class="quiz-grade-label">掌握程度？</div>
            <div class="quiz-grade-buttons">
              <button class="grade-btn grade-0" data-score="0">0<br><small>完全忘了</small></button>
              <button class="grade-btn grade-3" data-score="3">3<br><small>想起来了</small></button>
              <button class="grade-btn grade-4" data-score="4">4<br><small>正常</small></button>
              <button class="grade-btn grade-5" data-score="5">5<br><small>秒答</small></button>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  $('.quiz-flip-btn').addEventListener('click', () => { state.flipped = true; renderCard(); });
  $('.quiz-close').addEventListener('click', () => {
    if (confirm('中途退出？已答的结果会保存。')) finishQuiz();
  });
  document.querySelectorAll('.grade-btn').forEach(btn =>
    btn.addEventListener('click', () => onGrade(parseInt(btn.dataset.score, 10), qType))
  );
}

/* ===== 题型路由 ===== */
function chooseQType(note) {
  if (note.type === 'grammar' || note.type === 'culture') {
    return { label: '知识点', prompt: '请回忆该项目的含义与用法：', question: note.front, answer: note.back, kana: note.kana };
  }
  if (state.index % 2 === 0) {
    return { label: '中→日', prompt: '中文意思对应的日语是？', question: note.back, answer: note.front, kana: note.kana };
  }
  return { label: '日→中', prompt: '这个日语的意思是？', question: note.front + (note.kana && note.kana !== note.front ? `\n（${note.kana}）` : ''), answer: note.back, kana: '' };
}

/* ===== 评分 ===== */
async function onGrade(score, qType) {
  state.results.push({
    id: state.queue[state.index].id, score,
    ts: new Date().toISOString(),
    question_type: qType.label === '中→日' ? 'cn2jp' : qType.label === '日→中' ? 'jp2cn' : 'knowledge',
  });
  state.index++;
  state.flipped = false;
  state.index >= state.queue.length ? finishQuiz() : renderCard();
}

/* ===== 结束 & 写回 ===== */
async function finishQuiz() {
  if (!state.results.length) { $('#quiz-overlay').classList.remove('open'); return; }
  showOverlay('<div class="quiz-loading">💾 正在写回 GitHub…</div>');

  let err = null;
  try {
    await updateFile('data/notes.json', data => {
      const today  = new Date().toISOString().slice(0, 10);
      const idMap  = new Map(state.results.map(r => [r.id, r]));
      data.notes   = data.notes.map(n => {
        const r = idMap.get(n.id);
        return r ? { ...n, srs: srsGrade(n.srs || {}, r.score, today) } : n;
      });
      data.updated_at = new Date().toISOString();
      return data;
    }, `quiz: ${new Date().toISOString().slice(0,10)} (${countOk()}/${state.results.length} web)`);

    await updateFile('data/log.json', data => {
      data.entries = data.entries || [];
      state.results.forEach(r => data.entries.push({ id: r.id, date: r.ts, score: r.score, via: 'web', question_type: r.question_type }));
      return data;
    }, `log: web quiz ${new Date().toISOString().slice(0,10)} (+${state.results.length})`);
  } catch (e) { err = e; }

  showSummary(err);
}

function countOk() { return state.results.filter(r => r.score >= 3).length; }

function showSummary(err) {
  const ok    = countOk(), total = state.results.length;
  const pct   = Math.round(ok / total * 100);
  const avg   = (state.results.reduce((a, r) => a + r.score, 0) / total).toFixed(1);
  const saved = err
    ? `<div class="quiz-warn">⚠ 写回失败：${esc(err.message || '')}
         <br><small>结果仍在本地，可重试：<button class="btn-link" id="retry-save">重试保存</button></small></div>`
    : '<div class="quiz-saved">✓ 已同步到 GitHub</div>';

  $('#quiz-overlay').innerHTML = `
    <div class="quiz-stage quiz-summary-stage">
      <div class="quiz-summary">
        <h2>🎯 本次复习结果</h2>
        <div class="summary-stats">
          <div class="stat"><div class="stat-num">${ok}/${total}</div><div class="stat-label">正确</div></div>
          <div class="stat"><div class="stat-num">${pct}%</div><div class="stat-label">正确率</div></div>
          <div class="stat"><div class="stat-num">${avg}</div><div class="stat-label">平均分</div></div>
        </div>
        ${saved}
        <button class="btn-primary" id="quiz-done">关闭</button>
      </div>
    </div>`;
  $('#quiz-done').addEventListener('click', () => {
    $('#quiz-overlay').classList.remove('open');
    // 答题写回后从 API 直接刷新，绕过 Pages CDN 缓存
    if (window._reloadFromGitHub) window._reloadFromGitHub();
    else if (window._reloadNotes) window._reloadNotes();
  });
  if (err) $('#retry-save')?.addEventListener('click', finishQuiz);
}

/* ===== Token 设置 ===== */
export function openTokenSettings() {
  showOverlay(`
    <div class="quiz-stage">
      <div class="quiz-setup">
        <h2>🔑 GitHub Token 设置</h2>
        <p>需要 Fine-grained Personal Access Token 将答题结果写回 GitHub。</p>
        <ol class="setup-steps">
          <li>打开 <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHub Personal Access Tokens 页面</a></li>
          <li><strong>Repository access</strong>：仅选择 <code>libraosang/nihongo-notebook</code></li>
          <li><strong>Repository permissions</strong> → <strong>Contents</strong>：设为 <strong>Read and write</strong></li>
          <li>点击 Generate token，复制 <code>github_pat_…</code> 开头的 Token</li>
          <li>粘贴到下方</li>
        </ol>
        <input type="password" id="pat-input" class="search-input" placeholder="github_pat_..." style="width:100%;margin-top:1rem;">
        <div style="margin-top:.75rem;display:flex;gap:.5rem;">
          <button class="btn-primary" id="pat-save">验证并保存</button>
          <button class="btn-link"    id="pat-cancel">取消</button>
        </div>
        <div id="pat-msg" style="margin-top:.75rem;font-family:var(--sans);font-size:.85rem;"></div>
      </div>
    </div>`);

  $('#pat-save').addEventListener('click', async () => {
    const t = $('#pat-input').value.trim();
    if (!t) { $('#pat-msg').innerHTML = '<span style="color:var(--akane);">请输入 Token</span>'; return; }
    $('#pat-msg').innerHTML = '🔍 验证中…';
    const v = await verifyToken(t);
    if (!v.ok) { $('#pat-msg').innerHTML = `<span style="color:var(--akane);">⚠ ${esc(v.error)}</span>`; return; }
    if (!v.permissions?.push) { $('#pat-msg').innerHTML = `<span style="color:var(--akane);">⚠ 没有写权限</span>`; return; }
    localStorage.setItem('nihongo:gh:pat', t);
    $('#pat-msg').innerHTML = '<span style="color:var(--moegi);">✓ 已保存，正在跳转…</span>';
    setTimeout(() => startQuiz(), 600);
  });
  $('#pat-cancel').addEventListener('click', () => $('#quiz-overlay').classList.remove('open'));
}

export function openTokenManagement() {
  const cur    = localStorage.getItem('nihongo:gh:pat');
  const masked = cur ? cur.slice(0, 12) + '…' + cur.slice(-4) : '（未设置）';
  showOverlay(`
    <div class="quiz-stage">
      <div class="quiz-setup">
        <h2>🔑 Token 管理</h2>
        <p>当前 Token：<code>${esc(masked)}</code></p>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;">
          <button class="btn-primary" id="pat-renew">重新设置</button>
          <button class="btn-link"    id="pat-delete">删除</button>
          <button class="btn-link"    id="pat-close">关闭</button>
        </div>
      </div>
    </div>`);
  $('#pat-renew').addEventListener('click', () => openTokenSettings());
  $('#pat-delete').addEventListener('click', () => {
    if (confirm('确认删除 Token？')) { localStorage.removeItem('nihongo:gh:pat'); $('#quiz-overlay').classList.remove('open'); }
  });
  $('#pat-close').addEventListener('click', () => $('#quiz-overlay').classList.remove('open'));
}

/* ===== 工具 ===== */
function showOverlay(html) { const el = $('#quiz-overlay'); el.innerHTML = html; el.classList.add('open'); }
function esc(s) { return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function shuffle(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i+1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } }
