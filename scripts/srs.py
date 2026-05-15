"""SM-2 间隔重复算法 · 纯函数实现

参考：Anki 经典 SM-2，简化版本，对个人项目足够。
评分定义：
  0 = 完全忘记
  3 = 想了一下答对
  4 = 正常答对
  5 = 秒答
< 3 触发重置间隔。
"""

from __future__ import annotations
from datetime import date, timedelta
from typing import TypedDict


class SrsState(TypedDict):
    interval: int        # 当前间隔（天数）
    ease: float          # SM-2 难度因子，初值 2.5
    reps: int            # 复习次数
    lapses: int          # 答错次数
    next_review: str     # 下次复习日期 (YYYY-MM-DD)
    last_review: str | None  # 上次复习日期


def initial_srs(today: str | None = None) -> SrsState:
    """新建笔记时的初始 SRS 状态——立即可被复习。"""
    if today is None:
        today = date.today().isoformat()
    return {
        "interval": 0,
        "ease": 2.5,
        "reps": 0,
        "lapses": 0,
        "next_review": today,
        "last_review": None,
    }


def grade(srs: SrsState, score: int, today: str | None = None) -> SrsState:
    """根据评分更新 SRS 状态，返回新状态（不修改原对象）。

    Args:
        srs: 当前 SRS 状态
        score: 0-5 的评分
        today: 复习日期，默认今天
    """
    if today is None:
        today = date.today().isoformat()

    if score not in (0, 1, 2, 3, 4, 5):
        raise ValueError(f"score must be in 0..5, got {score}")

    interval = srs.get("interval", 0)
    ease = srs.get("ease", 2.5)
    reps = srs.get("reps", 0)
    lapses = srs.get("lapses", 0)

    if score < 3:
        # 答错：重置 reps、间隔回到 1 天
        reps = 0
        interval = 1
        lapses += 1
    else:
        if reps == 0:
            interval = 1
        elif reps == 1:
            interval = 6
        else:
            interval = max(1, round(interval * ease))
        reps += 1

    # SM-2 ease 调整公式
    ease = ease + 0.1 - (5 - score) * (0.08 + (5 - score) * 0.02)
    ease = max(1.3, ease)

    next_review = (date.fromisoformat(today) + timedelta(days=interval)).isoformat()

    return {
        "interval": interval,
        "ease": round(ease, 4),
        "reps": reps,
        "lapses": lapses,
        "next_review": next_review,
        "last_review": today,
    }


if __name__ == "__main__":
    # 自检
    srs = initial_srs("2026-05-15")
    print("Initial:", srs)
    s = grade(srs, 4, "2026-05-15");          print("After 4:", s)  # interval=1
    s = grade(s, 5, "2026-05-16");             print("After 5:", s)  # interval=6
    s = grade(s, 4, "2026-05-22");             print("After 4:", s)  # ~15d
    s = grade(s, 0, "2026-06-06");             print("After 0:", s)  # reset
