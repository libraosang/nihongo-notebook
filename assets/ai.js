/* ========================================================
   Claude API — ブラウザ内 AI ノート補完クライアント
   ======================================================== */

const AI_KEY_STORAGE   = 'nihongo:ai:key';
const AI_PROXY_STORAGE = 'nihongo:ai:proxy';
const DIRECT_ENDPOINT  = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5-20251001';

export function getAiKey()    { return localStorage.getItem(AI_KEY_STORAGE) || ''; }
export function setAiKey(k)   { k ? localStorage.setItem(AI_KEY_STORAGE, k.trim()) : localStorage.removeItem(AI_KEY_STORAGE); }
export function hasAiKey()    { return !!getAiKey(); }
export function getProxyUrl() { return localStorage.getItem(AI_PROXY_STORAGE) || ''; }
export function setProxyUrl(u) {
  const clean = (u || '').trim().replace(/\/$/, '');
  clean ? localStorage.setItem(AI_PROXY_STORAGE, clean) : localStorage.removeItem(AI_PROXY_STORAGE);
}

const OPENAI_KEY_STORAGE = 'nihongo:openai:key';
export const getOpenAiKey = () => localStorage.getItem(OPENAI_KEY_STORAGE) || '';
export const setOpenAiKey = k => k ? localStorage.setItem(OPENAI_KEY_STORAGE, k.trim()) : localStorage.removeItem(OPENAI_KEY_STORAGE);
export const hasOpenAiKey = () => !!localStorage.getItem(OPENAI_KEY_STORAGE);

const SYSTEM = `You are a Japanese language expert helping a game localizer in Tokyo build a personal vocabulary notebook.
Given a word, phrase, grammar point, or expression — plus optional screenshot context — return ONLY a valid JSON object with these fields:
- type: REQUIRED. Must be exactly "word" (a single vocabulary item — a single noun, verb, adjective, adverb, or compound noun) or "expression" (a multi-word phrase, idiom, grammar pattern such as 〜てしまう, set expression, or business set phrase)
- front: the Japanese word/phrase/grammar (string, required)
- back: concise Chinese translation or explanation (string, required)
- kana: hiragana/katakana reading (string; omit if identical to front or not applicable)
- romaji: romanization using Hepburn system (string, optional)
- pos: part of speech in Japanese notation, e.g. 名詞、動詞(自)、形容詞、副詞、接続詞、慣用句 (string, optional)
- examples: array of 1-3 example sentences, each {ja: string, zh: string} (array)
- tags: relevant tag array, e.g. ["ビジネス","外来語","N3","ゲーム","文化"] — include JLPT level if you know it; use "文化" tag for culturally-rooted terms (array)
- context_note: memory tip, usage nuance, or common mistake in Chinese (string, optional)

If the user's input already contains a Chinese translation, use and refine it.
If there is a screenshot, use it to understand the visual context (game UI, meeting document, etc.) when generating examples and notes.
Return ONLY the JSON object. No markdown fences, no explanation.`;

export async function fillNoteWithAI(input, imageBlob = null, { onRetry } = {}) {
  const key = getAiKey();
  if (!key) throw new Error('NO_AI_KEY');
  const endpoint = getProxyUrl() || DIRECT_ENDPOINT;

  const contentBlocks = [];

  if (imageBlob) {
    const b64 = await blobToBase64(imageBlob);
    contentBlocks.push({
      type: 'image',
      source: { type: 'base64', media_type: 'image/webp', data: b64 },
    });
  }

  contentBlocks.push({
    type: 'text',
    text: `内容：${input || '（请从截图中提取）'}`,
  });

  const body = JSON.stringify({
    model: MODEL,
    max_tokens: 1024,
    system: SYSTEM,
    messages: [{ role: 'user', content: contentBlocks }],
  });

  const MAX_RETRIES = 3;
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = 1000 * 2 ** (attempt - 1); // 1s, 2s, 4s
      onRetry?.(attempt, MAX_RETRIES, delay);
      await new Promise(r => setTimeout(r, delay));
    }

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body,
    });

    if (!res.ok) {
      const raw = await res.text();
      let errMsg, errType;
      try { ({ message: errMsg, type: errType } = JSON.parse(raw)?.error ?? {}); } catch {}
      // 529 overloaded_error: retry with backoff
      if (res.status === 529 || errType === 'overloaded_error') {
        lastError = new Error(errMsg || 'API 过载，请稍候重试');
        continue;
      }
      throw new Error(errMsg || `API 错误 ${res.status}`);
    }

    const data = await res.json();
    const text = data.content?.[0]?.text || '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('AI 没有返回有效 JSON，请重试');
    const parsed = parseAiJson(m[0]);
    if (parsed.type !== 'word' && parsed.type !== 'expression') {
      parsed.type = 'word';
    }
    return parsed;
  }

  throw lastError;
}

function parseAiJson(raw) {
  // First try parsing as-is
  try { return JSON.parse(raw); } catch {}
  // Strip trailing commas before } or ] (common AI mistake)
  const cleaned = raw.replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(cleaned);
}

async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
