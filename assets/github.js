/* ========================================================
   GitHub Contents API クライアント
   - Fine-grained Personal Access Token を localStorage で保管
   - JSON ファイルを SHA 楽観ロックで安全に書き戻す
   - 競合時は最新を pull → merge → retry（最大 3 回）
   ======================================================== */

const REPO_OWNER = 'libraosang';
const REPO_NAME  = 'nihongo-notebook';
const API_BASE   = `https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`;
const TOKEN_KEY  = 'nihongo:gh:pat';

/* ---------- Token 管理 ---------- */
export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}
export function setToken(t) {
  if (t) localStorage.setItem(TOKEN_KEY, t.trim());
  else   localStorage.removeItem(TOKEN_KEY);
}
export function hasToken() {
  return !!getToken();
}

/* ---------- 認証ヘッダ ---------- */
function authHeaders() {
  const t = getToken();
  if (!t) throw new Error('NO_TOKEN');
  return {
    'Authorization': `Bearer ${t}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

/* ---------- ユーザー検証（Token テスト用） ---------- */
export async function verifyToken(t = getToken()) {
  if (!t) return { ok: false, error: 'NO_TOKEN' };
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}`, {
      headers: {
        'Authorization': `Bearer ${t}`,
        'Accept': 'application/vnd.github+json',
      },
    });
    if (!res.ok) {
      const body = await res.text();
      return { ok: false, error: `HTTP ${res.status}: ${body.slice(0, 120)}` };
    }
    const repo = await res.json();
    return {
      ok: true,
      repo: repo.full_name,
      permissions: repo.permissions || {},
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

/* ---------- ファイル取得（content + sha） ---------- */
export async function getFile(path) {
  const res = await fetch(`${API_BASE}/contents/${path}?t=${Date.now()}`, {
    headers: authHeaders(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`getFile failed: ${res.status}`);
  const data = await res.json();
  // base64 デコード（UTF-8 対応）
  const bytes = Uint8Array.from(atob(data.content.replace(/\s/g, '')), c => c.charCodeAt(0));
  const text = new TextDecoder('utf-8').decode(bytes);
  return { sha: data.sha, text, json: tryParseJson(text) };
}

function tryParseJson(s) {
  try { return JSON.parse(s); } catch { return null; }
}

/* ---------- ファイル更新（PUT、SHA で楽観ロック） ---------- */
export async function putFile(path, jsonObject, sha, message) {
  const text = JSON.stringify(jsonObject, null, 2) + '\n';
  // UTF-8 → base64
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = btoa(binary);

  const res = await fetch(`${API_BASE}/contents/${path}`, {
    method: 'PUT',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: b64, sha }),
  });
  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`putFile ${res.status}: ${body.slice(0, 200)}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  return { sha: data.content.sha };
}

/* ---------- 楽観ロック付き更新（自動 retry） ---------- */
export async function updateFile(path, mutator, message, maxRetries = 3) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const { sha, json } = await getFile(path);
    const next = mutator(json);
    if (!next) return { ok: true, skipped: true };
    try {
      const result = await putFile(path, next, sha, message);
      return { ok: true, sha: result.sha };
    } catch (e) {
      // 409 / 422 は SHA conflict、retry
      if ((e.status === 409 || e.status === 422) && attempt < maxRetries - 1) {
        await sleep(400 * (attempt + 1));
        continue;
      }
      throw e;
    }
  }
  throw new Error('updateFile: max retries exceeded');
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/* ---------- バイナリファイルアップロード（画像用） ---------- */
export async function putBinaryFile(path, blob, message) {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const b64 = btoa(binary);

  // 既存 SHA を取得（ファイルが存在する場合の上書き用）
  let sha;
  try {
    const check = await fetch(`${API_BASE}/contents/${encodeURIComponent(path)}`, {
      headers: authHeaders(),
      cache: 'no-store',
    });
    if (check.ok) sha = (await check.json()).sha;
  } catch {}

  const res = await fetch(`${API_BASE}/contents/${encodeURIComponent(path)}`, {
    method: 'PUT',
    headers: { ...authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, content: b64, ...(sha ? { sha } : {}) }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`putBinaryFile ${res.status}: ${body.slice(0, 200)}`);
  }
  return await res.json();
}
