# Claude Code 操作手册 · Nihongo Notebook

## 处理待办笔记

**触发词**：「处理待办」「处理待办笔记」「process pending」

### 步骤

1. 读取 `data/pending.json`，检查 `pending` 数组。
2. 若数组为空，告知用户无待处理项目。
3. 对每条待处理项目（`{ id, type, input, image?, created_at }`）：
   a. 若有 `image` 字段，用 `Read` 工具读取该图片（支持 WebP/PNG/JPG）。
   b. 综合 `input` 文本 + 图片内容，分析日语词汇，生成完整笔记 JSON：
      ```json
      {
        "type": "...",
        "front": "（日文）",
        "back": "（中文释义）",
        "kana": "（假名读法）",
        "romaji": "（罗马音）",
        "pos": "（词性，如 名詞・サ変）",
        "examples": [{"ja": "...", "zh": "..."}],
        "tags": ["..."],
        "context_note": "（记忆要点/用法陷阱）",
        "image": "data/images/<pending-id>.webp"
      }
      ```
      注意：不要在 JSON 里带 `id`、`created_at`、`srs`，脚本自动生成。
   c. 在聊天里展示提议，**逐条等用户确认**（用户可说「把假名改成 XX」「标签加 N3」等微调）。

4. 用户确认某条后：
   a. 若原 pending 有图片 `data/pending-images/<pending-id>.webp`：
      - 读取该文件内容，写入 `data/images/<pending-id>.webp`
      - 用 `scripts/delete_pending_image.py` 或直接通过 GitHub API 删除旧文件
      - 笔记 JSON 里带 `"image": "data/images/<pending-id>.webp"`
   b. 运行脚本添加笔记：
      ```bash
      cd /home/user/nihongo-notebook && python scripts/add_note.py --json '{ ...完整 JSON... }'
      ```
   c. 从 `data/pending.json` 的 `pending` 数组中移除该条（用 Edit 工具）。

5. 全部处理完毕后，一次性 commit + push：
   ```bash
   git add data/notes.json data/pending.json data/images/ data/pending-images/
   git commit -m "process pending: X 条笔记补全"
   git push -u origin claude/add-vocab-conversation-IUkEp
   ```

---

## 直接对话添加单词

用户说「帮我加单词 XX」时：
1. 分析该词汇，在聊天里展示拟写入的 JSON（含 front/back/kana/romaji/pos/examples/tags）
2. 用户确认后：`python scripts/add_note.py --json '...'`
3. `git add data/notes.json && git commit -m "add: XX" && git push -u origin <branch>`

---

## 图片路径规范

| 状态 | 路径 |
|---|---|
| 待处理（用户刚上传） | `data/pending-images/<pending-id>.webp` |
| 已归档（笔记保存后） | `data/images/<note-id 或 pending-id>.webp` |
| 笔记 JSON 引用字段 | `"image": "data/images/<id>.webp"` |

---

## 数据 schema 参考

`type` 可选值：`word` | `phrase` | `grammar` | `expression` | `culture`

`data/pending.json` 结构：
```json
{
  "schema_version": 1,
  "updated_at": "...",
  "pending": [
    {
      "id": "pending-20260516-001",
      "type": "word",
      "input": "ブラッシュアップ — 刚才会议里同事说的",
      "image": "data/pending-images/pending-20260516-001.webp",
      "created_at": "2026-05-16T22:30:00+09:00"
    }
  ]
}
```
