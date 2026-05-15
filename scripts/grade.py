"""答題結果を反映するスクリプト · skill が答題後に呼ぶ。

使用法:
  python scripts/grade.py --id 20260515-001 --score 4 [--via chat|web] [--question-type cn2jp|jp2cn|knowledge]

- 該当笔记の SRS を SM-2 アルゴリズムで更新する
- log.json に履歴を追加する
- public か private かは id から自動判定する
"""

from __future__ import annotations
import argparse
import sys
from datetime import datetime

from common import (
    load_notes,
    save_public_notes,
    save_private_notes,
    append_log,
)
from srs import grade as srs_grade


def find_note(notes: list[dict], note_id: str) -> int | None:
    for i, n in enumerate(notes):
        if n["id"] == note_id:
            return i
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--id", required=True, help="笔记 ID")
    ap.add_argument("--score", type=int, required=True, choices=[0, 1, 2, 3, 4, 5])
    ap.add_argument("--via", default="chat", choices=["chat", "web"], help="答題チャネル")
    ap.add_argument("--question-type", default="auto",
                    help="出題タイプ: cn2jp / jp2cn / knowledge / auto")
    args = ap.parse_args()

    # public で探す
    public_data = load_notes("public")
    idx = find_note(public_data["notes"], args.id)

    if idx is not None:
        public_data["notes"][idx]["srs"] = srs_grade(public_data["notes"][idx].get("srs", {}), args.score)
        save_public_notes(public_data)
        is_private = False
    else:
        # private で探す
        private_data = load_notes("private")
        idx = find_note(private_data["notes"], args.id)
        if idx is None:
            print(f"ERROR: id={args.id} not found in public or private", file=sys.stderr)
            sys.exit(1)
        private_data["notes"][idx]["srs"] = srs_grade(private_data["notes"][idx].get("srs", {}), args.score)
        save_private_notes(private_data)
        is_private = True

    log_entry = {
        "id": args.id,
        "date": datetime.now().astimezone().isoformat(timespec="seconds"),
        "score": args.score,
        "via": args.via,
        "question_type": args.question_type,
    }
    append_log(log_entry, private=is_private)

    location = "private" if is_private else "public"
    print(f"OK: 採点完了 · id={args.id} score={args.score} ({location})")
    if is_private:
        print("NOTE: private データを更新しました（commit/push 不要）")


if __name__ == "__main__":
    main()
