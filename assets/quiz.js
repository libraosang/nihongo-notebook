/* ========================================================
   答題機能 · クイズ UI コントローラー
   - 今日の due 笔记をシャッフルしてカードスタックに
   - 表 → 翻面 → 4 段階評点（5 / 4 / 3 / 0）
   - SM-2 で SRS を更新し、log.json に履歴を追加
   - すべて GitHub Contents API 経由で書き戻す
   ======================================================== */

import { grade as srsGrade } from './srs.js';
import { hasToken, getFile, updateFile, verifyToken } from './github.js';

const TYPE_LABELS_EN = {
  word: 'WORD', phrase: 'PHRASE', grammar: 'GRAMMAR',
  expression: 'EXPRESSION', culture: 'CULTURE',
};

const state = {
  queue: [],
  index: 0,
  results: [],          // [{id, score, ts, ...}]
  flipped: false,
  noteSha: null,
  logSha: null,
};

const $ = (s) => document.querySelector(s);

/* ---------- 起動 ---------- */
export async function startQuiz() {
  // Token 検証
  if (!hasToken()) {
    return showSetup('GitHub トークンが必要です');
  }
  const v = await verifyToken();
  if (!v.ok) {
    return showSetup('トークンが無効です: ' + (v.error || ''));
  }
  if (!v.permissions?.push) {
    return showSetup('このトークンには書き込み権限がありません。Contents: Read & Write を有効にしてください。');
  }

  // データ取得
  showOverlay('<div class="quiz-loading">📚 復習問題を準備中…</div>');
  let notesData;
  try {
    const res = await getFile('data/notes.json');
    notesData = res.json;
    state.noteSha = res.sha;
  } catch (e) {
    return showOverlay(
      `<div class="quiz-error">⚠ データの取得に失敗しました<br><small>${e.message}</small><br><br>` +
      `<button class="btn-primary" onclick="document.getElementById('quiz-overlay').classList.remove('open')">閉じる</button></div>`
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const due = (notesData.notes || []).filter((n) =>
    (n.srs?.next_review || '9999-12-31') <= today
  );

  if (due.length === 0) {
    return showOverlay(`
      <div class="quiz-empty">
        <div class="em">🌸</div>
        <h3>今日は復習対象がありません</h3>
        <p>お疲れ様でした！</p>
        <button class="btn-primary" onclick="document.getElementById('quiz-overlay').classList.remove('open')">閉じる</button>
      </div>`);
  }

  // シャッフルして state に積む
  shuffle(due);
  state.queue = due;
  state.index = 0;
  state.results = [];
  state.flipped = false;
  renderCard();
}

/* ---------- カード描画 ---------- */
function renderCard() {
  const note = state.queue[state.index];
  if (!note) return finishQuiz();

  const total = state.queue.length;
  const idx = state.index + 1;
  const qType = chooseQuestionType(note);

  $('#quiz-overlay').classList.add('open');
  $('#quiz-overlay').innerHTML = `
    <div class="quiz-stage">
      <div class="quiz-header">
        <div class="quiz-progress">
          <span class="progress-text">${idx} / ${total}</span>
          <span class="progress-bar"><span class="progress-fill" style="width:${(idx/total)*100}%"></span></span>
        </div>
        <button class="quiz-close" aria-label="やめる">×</button>
      </div>
      <div class="quiz-meta">
        <span class="badge">${TYPE_LABELS_EN[note.type] || note.type}</span>
        <span class="badge badge-q">${qType.label}</span>
      </div>
      <div class="quiz-card ${state.flipped ? 'flipped' : ''}">
        <div class="quiz-front">
          <div class="quiz-prompt">${escapeHtml(qType.prompt)}</div>
          <div class="quiz-question">${escapeHtml(qType.question)}</div>
          <button class="quiz-flip-btn">答えを見る ⤵</button>
        </div>
        <div class="quiz-back">
          <div class="quiz-answer-label">正答</div>
          <div class="quiz-answer">${escapeHtml(qType.answer)}</div>
          ${qType.kana && qType.kana !== qType.answer ? `<div class="quiz-answer-kana">${escapeHtml(qType.kana)}</div>` : ''}
          ${note.examples?.[0] ? `
            <div class="quiz-example">
              <div class="ja">${escapeHtml(note.examples[0].ja || '')}</div>
              ${note.examples[0].zh ? `<div class="zh">${escapeHtml(note.examples[0].zh)}</div>` : ''}
            </div>` : ''}
          ${note.context_note ? `<div class="quiz-note">💡 ${escapeHtml(note.context_note)}</div>` : ''}
          <div class="quiz-grades">
            <div class="quiz-grade-label">どうでしたか？</div>
            <div class="quiz-grade-buttons">
              <button class="grade-btn grade-0" data-score="0">0<br><small>忘れた</small></button>
              <button class="grade-btn grade-3" data-score="3">3<br><small>考えた</small></button>
              <button class="grade-btn grade-4" data-score="4">4<br><small>普通</small></button>
              <button class="grade-btn grade-5" data-score="5">5<br><small>秒答</small></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  $('.quiz-flip-btn').addEventListener('click', () => {
    state.flipped = true;
    renderCard();
  });
  $('.quiz-close').addEventListener('click', () => {
    if (confirm('途中でやめますか？ここまでの結果は保存されます。')) finishQuiz();
  });
  document.querySelectorAll('.grade-btn').forEach((btn) => {
    btn.addEventListener('click', () => onGrade(parseInt(btn.dataset.score, 10), qType));
  });
}

/* ---------- 出題タイプの選択 ---------- */
function chooseQuestionType(note) {
  // grammar / culture は知識点考查（簡易版：意味と例文を問う）
  if (note.type === 'grammar' || note.type === 'culture') {
    return {
      label: '知識点',
      prompt: '次の項目について、意味と使い方を思い出してください。',
      question: note.front,
      answer: note.back,
      kana: note.kana,
    };
  }
  // word / phrase / expression は中訳日 / 日訳中 を交互に
  const direction = state.index % 2 === 0 ? 'cn2jp' : 'jp2cn';
  if (direction === 'cn2jp') {
    return {
      label: '中訳日',
      prompt: '中国語に対応する日本語は？',
      question: note.back,
      answer: note.front,
      kana: note.kana,
    };
  }
  return {
    label: '日訳中',
    prompt: 'この日本語の意味は？',
    question: note.front + (note.kana && note.kana !== note.front ? `\n（${note.kana}）` : ''),
    answer: note.back,
    kana: '',
  };
}

/* ---------- 採点処理 ---------- */
async function onGrade(score, qType) {
  const note = state.queue[state.index];
  state.results.push({
    id: note.id,
    score,
    ts: new Date().toISOString(),
    question_type: qType.label === '中訳日' ? 'cn2jp' : qType.label === '日訳中' ? 'jp2cn' : 'knowledge',
  });
  state.index++;
  state.flipped = false;
  if (state.index >= state.queue.length) {
    finishQuiz();
  } else {
    renderCard();
  }
}

/* ---------- 終了処理（GitHub に書き戻す） ---------- */
async function finishQuiz() {
  if (state.results.length === 0) {
    $('#quiz-overlay').classList.remove('open');
    return;
  }
  showOverlay('<div class="quiz-loading">💾 結果を GitHub に保存中…</div>');

  let saveError = null;
  try {
    // 1) notes.json の SRS を更新
    await updateFile('data/notes.json', (data) => {
      const today = new Date().toISOString().slice(0, 10);
      const idMap = new Map(state.results.map((r) => [r.id, r]));
      data.notes = data.notes.map((n) => {
        const r = idMap.get(n.id);
        if (!r) return n;
        return { ...n, srs: srsGrade(n.srs || {}, r.score, today) };
      });
      data.updated_at = new Date().toISOString();
      return data;
    }, `quiz: ${new Date().toISOString().slice(0,10)} (${countOk(state.results)}/${state.results.length} via web)`);

    // 2) log.json に履歴を追加
    await updateFile('data/log.json', (data) => {
      data.entries = data.entries || [];
      for (const r of state.results) {
        data.entries.push({
          id: r.id,
          date: r.ts,
          score: r.score,
          via: 'web',
          question_type: r.question_type,
        });
      }
      return data;
    }, `log: web quiz ${new Date().toISOString().slice(0,10)} (+${state.results.length} entries)`);
  } catch (e) {
    saveError = e;
  }

  showSummary(saveError);
}

function countOk(results) {
  return results.filter((r) => r.score >= 3).length;
}

function showSummary(err) {
  const ok = countOk(state.results);
  const total = state.results.length;
  const pct = Math.round((ok / total) * 100);
  const avg = (state.results.reduce((a, r) => a + r.score, 0) / total).toFixed(1);

  const errBlock = err ? `
    <div class="quiz-warn">
      ⚠ GitHub への保存に失敗しました: ${escapeHtml(err.message || '')}<br>
      <small>結果はローカルに保持されています。再試行: <button class="btn-link" id="retry-save">保存しなおす</button></small>
    </div>` : '<div class="quiz-saved">✓ GitHub に保存しました</div>';

  $('#quiz-overlay').innerHTML = `
    <div class="quiz-stage quiz-summary-stage">
      <div class="quiz-summary">
        <h2>🎯 お疲れ様でした</h2>
        <div class="summary-stats">
          <div class="stat"><div class="stat-num">${ok}/${total}</div><div class="stat-label">正解</div></div>
          <div class="stat"><div class="stat-num">${pct}%</div><div class="stat-label">正解率</div></div>
          <div class="stat"><div class="stat-num">${avg}</div><div class="stat-label">平均評点</div></div>
        </div>
        ${errBlock}
        <button class="btn-primary" id="quiz-done">閉じる</button>
      </div>
    </div>`;
  $('#quiz-done').addEventListener('click', () => {
    $('#quiz-overlay').classList.remove('open');
    // データを再読み込み（メイン画面の表示を更新）
    if (window._reloadNotes) window._reloadNotes();
  });
  if (err) {
    $('#retry-save')?.addEventListener('click', finishQuiz);
  }
}

/* ---------- セットアップガイド ---------- */
function showSetup(msg = '') {
  showOverlay(`
    <div class="quiz-stage">
      <div class="quiz-setup">
        <h2>🔑 GitHub トークン設定</h2>
        ${msg ? `<div class="quiz-warn">${escapeHtml(msg)}</div>` : ''}
        <p>答題結果を GitHub に保存するために、Fine-grained Personal Access Token が必要です。</p>
        <ol class="setup-steps">
          <li><a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">こちらをクリック</a> して新しい Fine-grained PAT を作成します。</li>
          <li><strong>Repository access</strong>: "Only select repositories" → <code>libraosang/nihongo-notebook</code> のみ選択</li>
          <li><strong>Permissions → Repository permissions</strong>:<br>
            ・<code>Contents</code>: <strong>Read and write</strong></li>
          <li>有効期限はお好み（30 日 / 90 日 / 無期限）</li>
          <li>「Generate token」ボタンを押し、表示された <code>github_pat_…</code> をコピー</li>
          <li>↓ に貼り付けて保存</li>
        </ol>
        <input type="password" id="pat-input" class="search-input" placeholder="github_pat_..." style="width:100%;margin-top:1rem;">
        <div style="margin-top:0.75rem;display:flex;gap:0.5rem;">
          <button class="btn-primary" id="pat-save">検証して保存</button>
          <button class="btn-link" id="pat-cancel">キャンセル</button>
        </div>
        <div id="pat-msg" style="margin-top:0.75rem;font-family:var(--sans);font-size:0.85rem;"></div>
      </div>
    </div>`);
  $('#pat-save').addEventListener('click', async () => {
    const t = $('#pat-input').value.trim();
    if (!t) { $('#pat-msg').innerHTML = '<span style="color:var(--akane);">トークンを入力してください</span>'; return; }
    $('#pat-msg').innerHTML = '🔍 検証中…';
    const v = await verifyToken(t);
    if (!v.ok) {
      $('#pat-msg').innerHTML = `<span style="color:var(--akane);">⚠ ${escapeHtml(v.error)}</span>`;
      return;
    }
    if (!v.permissions?.push) {
      $('#pat-msg').innerHTML = `<span style="color:var(--akane);">⚠ 書き込み権限がありません</span>`;
      return;
    }
    // 保存
    localStorage.setItem('nihongo:gh:pat', t);
    $('#pat-msg').innerHTML = '<span style="color:var(--moegi);">✓ 保存しました。クイズを開始します…</span>';
    setTimeout(() => startQuiz(), 600);
  });
  $('#pat-cancel').addEventListener('click', () => {
    $('#quiz-overlay').classList.remove('open');
  });
}

/* ---------- ヘルパー ---------- */
function showOverlay(html) {
  const el = $('#quiz-overlay');
  el.innerHTML = html;
  el.classList.add('open');
}
function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/* ---------- 設定画面（既存トークンの管理） ---------- */
export function openTokenSettings() {
  const current = localStorage.getItem('nihongo:gh:pat');
  const masked = current ? current.slice(0, 12) + '…' + current.slice(-4) : '（未設定）';
  showOverlay(`
    <div class="quiz-stage">
      <div class="quiz-setup">
        <h2>🔑 トークン管理</h2>
        <p>現在のトークン: <code>${escapeHtml(masked)}</code></p>
        <div style="display:flex;gap:0.5rem;flex-wrap:wrap;">
          <button class="btn-primary" id="pat-renew">新しいトークンを設定</button>
          <button class="btn-link" id="pat-delete">削除</button>
          <button class="btn-link" id="pat-close">閉じる</button>
        </div>
      </div>
    </div>`);
  $('#pat-renew').addEventListener('click', () => showSetup());
  $('#pat-delete').addEventListener('click', () => {
    if (confirm('トークンを削除しますか？')) {
      localStorage.removeItem('nihongo:gh:pat');
      $('#quiz-overlay').classList.remove('open');
    }
  });
  $('#pat-close').addEventListener('click', () => $('#quiz-overlay').classList.remove('open'));
}
