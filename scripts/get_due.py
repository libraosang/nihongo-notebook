"""今日復習すべき笔记を取り出す · WorkBuddy skill nihongo-quiz が呼ぶ。

使用法:
  python scripts/get_due.py [--limit 15] [--include-private]

next_review <= today のものを random で limit 件返す。
出力は JSON Lines（1 行 1 笔记）—— skill が読みやすいように。
"""

from __future__ import annotations
import argparse
import json
import random
from datetime import date

from common import load_notes


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--limit", type=int, default=15, help="最大出題数")
    ap.add_argument("--include-private", action="store_true", help="本地 private データも含める")
    ap.add_argument("--seed", type=int, default=None, help="乱数シード（テスト用）")
    args = ap.parse_args()

    if args.seed is not None:
        random.seed(args.seed)

    visibility = "all" if args.include_private else "public"
    data = load_notes(visibility)
    today = date.today().isoformat()

    due = [
        n for n in data["notes"]
        if (n.get("srs", {}).get("next_review") or "9999-12-31") <= today
    ]

    if not due:
        print(json.dumps({"_meta": True, "due_count": 0, "today": today}, ensure_ascii=False))
        return

    random.shuffle(due)
    selected = due[: args.limit]

    print(json.dumps({
        "_meta": True,
        "due_count": len(due),
        "selected_count": len(selected),
        "today": today,
    }, ensure_ascii=False))

    for n in selected:
        print(json.dumps(n, ensure_ascii=False))


if __name__ == "__main__":
    main()
