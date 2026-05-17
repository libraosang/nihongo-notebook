import { getOpenAiKey, getProxyUrl } from './ai.js';

let currentAudio = null;

export async function speak(text) {
  if (!text) return;
  const key = getOpenAiKey();
  if (!key) { speakNative(text); return; }

  if (currentAudio) { currentAudio.pause(); currentAudio = null; }

  try {
    const proxy = getProxyUrl().replace(/\/$/, '');
    const url = proxy
      ? `${proxy}/openai/v1/audio/speech`
      : 'https://api.openai.com/v1/audio/speech';

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ model: 'tts-1-hd', input: text, voice: 'nova' }),
    });

    if (!res.ok) throw new Error(res.status);

    const blob = await res.blob();
    const objUrl = URL.createObjectURL(blob);
    currentAudio = new Audio(objUrl);
    currentAudio.onended = () => URL.revokeObjectURL(objUrl);
    currentAudio.play();
  } catch {
    speakNative(text);
  }
}

function speakNative(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ja-JP';
  u.rate = 0.9;
  window.speechSynthesis.speak(u);
}
