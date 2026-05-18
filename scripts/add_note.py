"""笔记を追加するスクリプト · WorkBuddy skill から呼ばれる。

使用法:
  python scripts/add_note.py --json '{...note JSON...}' [--private]

note JSON は schema に従う（front, type, kana, back, examples, tags ...）。
id, created_at, srs フィールドはこのスクリプトが自動生成する。

成功すると追加された id を出力する。
"""

from __future__ import annotations
import argparse
import json
import sys
from datetime import datetime

from common import (
    load_notes,
    save_public_notes,
    save_private_notes,
    gen_id,
    NOTES_FILE,
    PRIVATE_NOTES,
)
from srs import initial_srs

VALID_TYPES = {"word", "expression"}
PASSTHROUGH_FIELDS = {"image", "source", "context_note", "pos", "kana", "romaji", "tags", "examples"}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", required=True, help='笔记データ（JSON 文字列）')
    ap.add_argument("--private", action="store_true", help="本地 private 仓库に保存")
    args = ap.parse_args()

    try:
        note = json.loads(args.json)
    except json.JSONDecodeError as e:
        print(f"ERROR: invalid JSON: {e}", file=sys.stderr)
        sys.exit(1)

    # 必須フィールド検証
    if not note.get("front"):
        print("ERROR: 'front' is required", file=sys.stderr)
        sys.exit(1)
    if note.get("type") not in VALID_TYPES:
        print(f"ERROR: 'type' must be one of {VALID_TYPES}, got {note.get('type')}", file=sys.stderr)
        sys.exit(1)

    # 自動生成フィールド
    target_visibility = "private" if args.private else "public"

    # ID は public + private 両方の id とぶつからないようにする
    all_data = load_notes("all")
    note["id"] = gen_id(all_data["notes"])
    note["created_at"] = datetime.now().astimezone().isoformat(timespec="seconds")
    note["srs"] = initial_srs()

    # デフォルト値
    note.setdefault("examples", [])
    note.setdefault("tags", [])

    # ターゲット仓库に追加
    if args.private:
        data = load_notes("private")
        data["notes"].append(note)
        save_private_notes(data)
        print(f"OK: 追加しました (private) · id={note['id']}")
        print(f"PATH: {PRIVATE_NOTES}")
    else:
        data = load_notes("public")
        data["notes"].append(note)
        save_public_notes(data)
        print(f"OK: 追加しました (public) · id={note['id']}")
        print(f"PATH: {NOTES_FILE}")

    # 確認のため一部を返す
    print(f"FRONT: {note['front']}")
    print(f"TYPE: {note['type']}")


if __name__ == "__main__":
    main()
