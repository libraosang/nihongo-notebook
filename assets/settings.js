/* ========================================================
   统一 API 设置面板
   - GitHub PAT
   - Anthropic API Key
   - Cloudflare Worker 代理 URL
   ======================================================== */

import { getToken, setToken, hasToken, verifyToken } from './github.js';
import { getAiKey, setAiKey, hasAiKey, getProxyUrl, setProxyUrl } from './ai.js';

const $ = s => document.querySelector(s);

let _onSavedCallback = null;

function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function maskedValue(v) {
  if (!v) return '';
  if (v.length <= 12) return v.slice(0, 4) + '…';
  return v.slice(0, 10) + '…' + v.slice(-4);
}

export function openSettings({ focus, reason, onSaved } = {}) {
  _onSavedCallback = onSaved || null;

  const overlay = $('#settings-overlay');
  overlay.innerHTML = `
    <div class="quiz-stage settings-stage">
      <button class="modal-close" id="settings-close" aria-label="关闭">×</button>
      <h2 style="margin-bottom:.35rem;">⚙ API 设置</h2>
      <p class="settings-subtitle">三个凭据都只保存在本设备浏览器的 localStorage 里。</p>
      <div id="settings-banner"></div>
      ${renderSection('github')}
      ${renderSection('ai')}
      ${renderSection('proxy')}
    </div>
  `;
  overlay.classList.add('open');

  wireSection('github');
  wireSection('ai');
  wireSection('proxy');

  $('#settings-close').addEventListener('click', closeSettings);
  overlay.addEventListener('click', e => { if (e.target.id === 'settings-overlay') closeSettings(); });
  document.addEventListener('keydown', onEscKey);

  if (reason) showBanner(reason);

  validateGithubInBackground();

  if (focus) focusSection(focus);
}

export function closeSettings() {
  const overlay = $('#settings-overlay');
  if (overlay) {
    overlay.classList.remove('open');
    overlay.innerHTML = '';
  }
  document.removeEventListener('keydown', onEscKey);
  _onSavedCallback = null;
}

function onEscKey(e) {
  if (e.key === 'Escape') closeSettings();
}

function showBanner(text) {
  const el = $('#settings-banner');
  if (!el) return;
  el.innerHTML = `<div class="settings-banner">⚠ ${esc(text)}</div>`;
}

function clearBanner() {
  const el = $('#settings-banner');
  if (el) el.innerHTML = '';
}

/* ============== Section 渲染 ============== */

function renderSection(kind) {
  if (kind === 'github') return renderGithubSection();
  if (kind === 'ai')     return renderAiSection();
  if (kind === 'proxy')  return renderProxySection();
  return '';
}

function renderGithubSection() {
  const cur = getToken();
  const hasVal = !!cur;
  const pill = hasVal
    ? `<span class="settings-pill settings-pill-checking" id="gh-pill">🔍 验证中…</span>`
    : `<span class="settings-pill settings-pill-empty">○ 未设置</span>`;

  return `
    <section class="settings-section" data-kind="github">
      <div class="settings-section-head">
        <h3>GitHub Personal Access Token</h3>
        ${pill}
      </div>
      ${hasVal ? `<div class="settings-current">当前：<code>${esc(maskedValue(cur))}</code></div>` : ''}
      <div class="form-row">
        <input type="password" id="gh-input" class="form-input" placeholder="github_pat_..." value="${esc(cur)}" autocomplete="off">
      </div>
      <details class="settings-details" ${hasVal ? '' : 'open'}>
        <summary>查看获取方式</summary>
        <ol class="setup-steps">
          <li>打开 <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">GitHub Personal Access Tokens 页面</a></li>
          <li><strong>Repository access</strong>：仅选择 <code>libraosang/nihongo-notebook</code></li>
          <li><strong>Repository permissions</strong> → <strong>Contents</strong>：设为 <strong>Read and write</strong></li>
          <li>点击 Generate token，复制 <code>github_pat_…</code> 开头的 Token</li>
          <li>粘贴到上方输入框</li>
        </ol>
      </details>
      <div class="form-actions">
        <button type="button" class="btn-primary" id="gh-save">验证并保存</button>
        ${hasVal ? '<button type="button" class="btn-link" id="gh-clear">删除</button>' : ''}
      </div>
      <div class="form-msg" id="gh-msg"></div>
    </section>
  `;
}

function renderAiSection() {
  const cur = getAiKey();
  const hasVal = !!cur;
  const pill = hasVal
    ? `<span class="settings-pill settings-pill-ok">✓ 已填写</span>`
    : `<span class="settings-pill settings-pill-empty">○ 未设置</span>`;

  return `
    <section class="settings-section" data-kind="ai">
      <div class="settings-section-head">
        <h3>Anthropic API Key</h3>
        ${pill}
      </div>
      ${hasVal ? `<div class="settings-current">当前：<code>${esc(maskedValue(cur))}</code></div>` : ''}
      <div class="form-row">
        <input type="password" id="ai-input" class="form-input" placeholder="sk-ant-api03-..." value="${esc(cur)}" autocomplete="off">
      </div>
      <details class="settings-details" ${hasVal ? '' : 'open'}>
        <summary>查看获取方式</summary>
        <div class="form-hint" style="line-height:1.6;">
          在 <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noopener">Anthropic Console</a> 创建 Key，只保存在本设备浏览器里。
        </div>
      </details>
      <div class="form-actions">
        <button type="button" class="btn-primary" id="ai-save">保存</button>
        ${hasVal ? '<button type="button" class="btn-link" id="ai-clear">删除</button>' : ''}
      </div>
      <div class="form-msg" id="ai-msg"></div>
    </section>
  `;
}

function renderProxySection() {
  const cur = getProxyUrl();
  const hasVal = !!cur;
  const pill = hasVal
    ? `<span class="settings-pill settings-pill-ok">✓ 已填写</span>`
    : `<span class="settings-pill settings-pill-empty">○ 未设置</span>`;

  return `
    <section class="settings-section" data-kind="proxy">
      <div class="settings-section-head">
        <h3>Cloudflare Worker 代理 URL <span class="form-hint-inline">iPhone 必填</span></h3>
        ${pill}
      </div>
      ${hasVal ? `<div class="settings-current">当前：<code>${esc(cur)}</code></div>` : ''}
      <div class="form-row">
        <input type="text" id="proxy-input" class="form-input" placeholder="https://xxx.workers.dev" value="${esc(cur)}" autocomplete="off">
      </div>
      <details class="settings-details" ${hasVal ? '' : 'open'}>
        <summary>查看部署方式</summary>
        <div class="form-hint" style="line-height:1.6;">
          iPhone/iOS 浏览器受 CORS 限制，需要先部署代理：<br>
          1. 打开 <a href="https://workers.cloudflare.com" target="_blank" rel="noopener">workers.cloudflare.com</a>（免费注册）<br>
          2. 创建 Worker → 粘贴 <code>assets/cf-worker.js</code> 里的代码 → Deploy<br>
          3. 把 Worker 域名填入此处
        </div>
      </details>
      <div class="form-actions">
        <button type="button" class="btn-primary" id="proxy-save">保存</button>
        ${hasVal ? '<button type="button" class="btn-link" id="proxy-clear">删除</button>' : ''}
      </div>
      <div class="form-msg" id="proxy-msg"></div>
    </section>
  `;
}

/* ============== Section 绑定 ============== */

function wireSection(kind) {
  if (kind === 'github') {
    $('#gh-save')?.addEventListener('click', saveGithub);
    $('#gh-clear')?.addEventListener('click', clearGithub);
    $('#gh-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') saveGithub(); });
  } else if (kind === 'ai') {
    $('#ai-save')?.addEventListener('click', saveAi);
    $('#ai-clear')?.addEventListener('click', clearAi);
    $('#ai-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') saveAi(); });
  } else if (kind === 'proxy') {
    $('#proxy-save')?.addEventListener('click', saveProxy);
    $('#proxy-clear')?.addEventListener('click', clearProxy);
    $('#proxy-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') saveProxy(); });
  }
}

function rerenderSection(kind) {
  const sec = document.querySelector(`.settings-section[data-kind="${kind}"]`);
  if (!sec) return;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = renderSection(kind);
  sec.replaceWith(wrapper.firstElementChild);
  wireSection(kind);
}

/* ============== 保存 / 清除 ============== */

async function saveGithub() {
  const t = $('#gh-input').value.trim();
  const msg = $('#gh-msg');
  if (!t) { msg.innerHTML = '<span style="color:var(--akane);">请输入 Token</span>'; return; }
  msg.innerHTML = '🔍 验证中…';
  const v = await verifyToken(t);
  if (!v.ok) { msg.innerHTML = `<span style="color:var(--akane);">⚠ ${esc(v.error)}</span>`; return; }
  if (!v.permissions?.push) { msg.innerHTML = `<span style="color:var(--akane);">⚠ 该 Token 没有写权限，请开启 Contents: Read & Write</span>`; return; }
  setToken(t);
  msg.innerHTML = '<span style="color:var(--moegi);">✓ 已保存并验证生效</span>';
  rerenderSection('github');
  setPill('github', 'ok', '✓ 已生效');
  clearBanner();
  notifySaved('github');
}

function clearGithub() {
  if (!confirm('确认删除 GitHub Token？')) return;
  setToken('');
  rerenderSection('github');
}

function saveAi() {
  const k = $('#ai-input').value.trim();
  const msg = $('#ai-msg');
  if (!k) { msg.innerHTML = '<span style="color:var(--akane);">请输入 API Key</span>'; return; }
  setAiKey(k);
  msg.innerHTML = '<span style="color:var(--moegi);">✓ 已保存</span>';
  rerenderSection('ai');
  clearBanner();
  notifySaved('ai');
}

function clearAi() {
  if (!confirm('确认删除 Anthropic API Key？')) return;
  setAiKey('');
  rerenderSection('ai');
}

function saveProxy() {
  const p = $('#proxy-input').value.trim();
  const msg = $('#proxy-msg');
  setProxyUrl(p);
  msg.innerHTML = p
    ? '<span style="color:var(--moegi);">✓ 已保存</span>'
    : '<span style="color:var(--usuzumi);">已清空（将直连 api.anthropic.com）</span>';
  rerenderSection('proxy');
  clearBanner();
  notifySaved('proxy');
}

function clearProxy() {
  if (!confirm('确认删除代理 URL？将直连 api.anthropic.com（iPhone 上会因 CORS 失败）。')) return;
  setProxyUrl('');
  rerenderSection('proxy');
}

/* ============== 状态徽标 + 后台验证 ============== */

function setPill(kind, status, text) {
  const sec = document.querySelector(`.settings-section[data-kind="${kind}"]`);
  if (!sec) return;
  const pill = sec.querySelector('.settings-pill');
  if (!pill) return;
  pill.className = `settings-pill settings-pill-${status}`;
  pill.textContent = text;
}

async function validateGithubInBackground() {
  if (!hasToken()) return;
  const v = await verifyToken();
  if (!document.querySelector('.settings-section[data-kind="github"]')) return;
  if (!v.ok) {
    setPill('github', 'warn', `⚠ 验证失败`);
    const msg = $('#gh-msg');
    if (msg && !msg.textContent) msg.innerHTML = `<span style="color:var(--akane);">⚠ ${esc(v.error)}</span>`;
  } else if (!v.permissions?.push) {
    setPill('github', 'warn', '⚠ 无写权限');
  } else {
    setPill('github', 'ok', '✓ 已生效');
  }
}

/* ============== focus / 回调 ============== */

function focusSection(kind) {
  const sec = document.querySelector(`.settings-section[data-kind="${kind}"]`);
  if (!sec) return;
  sec.scrollIntoView({ block: 'start', behavior: 'instant' });
  const details = sec.querySelector('details');
  if (details) details.open = true;
  const input = sec.querySelector('input');
  if (input) setTimeout(() => input.focus(), 50);
}

function notifySaved(kind) {
  const cb = _onSavedCallback;
  if (!cb) return;
  setTimeout(() => {
    closeSettings();
    cb(kind);
  }, 500);
}
