"""共通ユーティリティ · データの読み書き、ID 生成、private データの併合。"""

from __future__ import annotations
import json
from datetime import datetime
from pathlib import Path
from typing import Any

# プロジェクトルート（このスクリプトの 1 つ上のディレクトリ）
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
NOTES_FILE = DATA_DIR / "notes.json"
LOG_FILE = DATA_DIR / "log.json"

# private データはルートの 1 つ上の `nihongo-private/` を探す（仓库外）
PRIVATE_ROOT = ROOT.parent / "nihongo-private"
PRIVATE_NOTES = PRIVATE_ROOT / "notes.json"
PRIVATE_LOG = PRIVATE_ROOT / "log.json"


def load_json(path: Path, default: Any) -> Any:
    if not path.exists():
        return default
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write("\n")


def load_notes(visibility: str = "all") -> dict:
    """笔记データを読み込む。

    visibility:
      'public'  → public 仓库のみ
      'private' → 本地 private のみ
      'all'     → 両方を併合（同じ id があれば private が優先）
    """
    public_data = load_json(NOTES_FILE, {"schema_version": 1, "notes": []})

    if visibility == "public":
        return public_data
    if visibility == "private":
        return load_json(PRIVATE_NOTES, {"schema_version": 1, "notes": []})

    # all: マージ
    private_data = load_json(PRIVATE_NOTES, {"schema_version": 1, "notes": []})
    notes = list(public_data.get("notes", []))
    note_ids = {n["id"] for n in notes}
    for n in private_data.get("notes", []):
        n_marked = dict(n)
        n_marked["_private"] = True
        if n["id"] in note_ids:
            # 同じ id があれば private で上書き
            notes = [n_marked if x["id"] == n["id"] else x for x in notes]
        else:
            notes.append(n_marked)
    return {"schema_version": 1, "notes": notes}


def save_public_notes(data: dict) -> None:
    """public 笔记を保存する（updated_at を更新）。"""
    data["updated_at"] = datetime.now().astimezone().isoformat(timespec="seconds")
    save_json(NOTES_FILE, data)


def save_private_notes(data: dict) -> None:
    PRIVATE_ROOT.mkdir(parents=True, exist_ok=True)
    data["updated_at"] = datetime.now().astimezone().isoformat(timespec="seconds")
    save_json(PRIVATE_NOTES, data)


def gen_id(notes: list[dict]) -> str:
    """今日の日付 + 連番で id を生成する（YYYYMMDD-NNN）。"""
    today_prefix = datetime.now().strftime("%Y%m%d")
    today_ids = [n["id"] for n in notes if n["id"].startswith(today_prefix)]
    if not today_ids:
        return f"{today_prefix}-001"
    last_seq = max(int(i.split("-")[1]) for i in today_ids if "-" in i)
    return f"{today_prefix}-{last_seq + 1:03d}"


def append_log(entry: dict, private: bool = False) -> None:
    """答題ログにエントリを追加する。"""
    path = PRIVATE_LOG if private else LOG_FILE
    log = load_json(path, {"schema_version": 1, "entries": []})
    log["entries"].append(entry)
    save_json(path, log)
