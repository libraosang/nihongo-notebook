/* ========================================================
   SM-2 间隔重复算法 · JS 纯函数实装
   Python 版（scripts/srs.py）と完全に同一の挙動を保証する
   ======================================================== */

/**
 * 新規笔记の初期 SRS 状態 — 即時に復習対象。
 * @param {string} [today] - YYYY-MM-DD
 */
export function initialSrs(today = todayIso()) {
  return {
    interval: 0,
    ease: 2.5,
    reps: 0,
    lapses: 0,
    next_review: today,
    last_review: null,
  };
}

/**
 * 採点による SRS 更新（純関数 · 元オブジェクトは変更しない）。
 * @param {object} srs - 現在の SRS 状態
 * @param {number} score - 0..5
 * @param {string} [today] - YYYY-MM-DD
 */
export function grade(srs, score, today = todayIso()) {
  if (![0, 1, 2, 3, 4, 5].includes(score)) {
    throw new Error(`score must be in 0..5, got ${score}`);
  }
  let interval = srs.interval ?? 0;
  let ease = srs.ease ?? 2.5;
  let reps = srs.reps ?? 0;
  let lapses = srs.lapses ?? 0;

  if (score < 3) {
    reps = 0;
    interval = 1;
    lapses += 1;
  } else {
    if (reps === 0)      interval = 1;
    else if (reps === 1) interval = 6;
    else                 interval = Math.max(1, Math.round(interval * ease));
    reps += 1;
  }

  ease = ease + 0.1 - (5 - score) * (0.08 + (5 - score) * 0.02);
  ease = Math.max(1.3, ease);

  const nextReview = addDays(today, interval);

  return {
    interval,
    ease: round4(ease),
    reps,
    lapses,
    next_review: nextReview,
    last_review: today,
  };
}

/* ---------- 小ユーティリティ ---------- */
function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function addDays(iso, days) {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
function round4(x) {
  return Math.round(x * 10000) / 10000;
}
