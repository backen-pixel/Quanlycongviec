# -*- coding: utf-8 -*-
"""Sinh database/554-556: 3 khoá từng nút trang chi tiết CRM / SX / VC."""
from __future__ import annotations
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DB = ROOT / "database"

def img(name: str) -> str:
    return f"/uploads/knowledge-screenshots/{name}"

def esc(s: str | None) -> str:
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"

def dollar(tag: str, body: str) -> str:
    return f"${tag}${body}${tag}$"

def arr(tags: list[str]) -> str:
    if not tags:
        return "ARRAY[]::text[]"
    return "ARRAY[" + ", ".join(esc(t) for t in tags) + "]"

def att_sql(tag: str, items: list[dict]) -> str:
    return dollar(tag, json.dumps(items, ensure_ascii=False)) + "::jsonb"

def qitem(qid, question, options, correct, explanation, image=None):
    item = {
        "id": qid,
        "question": question,
        "type": "single",
        "options": options,
        "correct": [correct] if not isinstance(correct, list) else correct,
        "explanation": explanation,
    }
    if image:
        item["image_url"] = img(image) if not str(image).startswith("/") else image
    return item

def lesson_sql(L):
    att = att_sql(f"att_{L['id'].replace('-', '_')}", L.get("attachments") or [])
    md_tag = f"md_{L['id'].replace('-', '_')}"
    cover = esc(L.get("cover")) if L.get("cover") else "NULL"
    sql = f'''INSERT INTO knowledge_lessons (
  id, category_id, title, summary, content_md,
  cover_image_url, attachments,
  duration_minutes, tags, is_required, sort_order, is_published, published_at
) VALUES (
  {esc(L["id"])},
  {esc(L["category_id"])},
  {esc(L["title"])},
  {esc(L["summary"])},
  {dollar(md_tag, L["content_md"])},
  {cover},
  {att},
  {L.get("duration", 12)},
  {arr(L.get("tags") or [])},
  true,
  {L["sort_order"]},
  true,
  now()
) ON CONFLICT (id) DO UPDATE SET
  category_id = EXCLUDED.category_id, title = EXCLUDED.title, summary = EXCLUDED.summary,
  content_md = EXCLUDED.content_md, cover_image_url = EXCLUDED.cover_image_url,
  attachments = EXCLUDED.attachments, duration_minutes = EXCLUDED.duration_minutes,
  tags = EXCLUDED.tags, is_required = EXCLUDED.is_required, sort_order = EXCLUDED.sort_order,
  is_published = true, updated_at = now();
'''
    if L.get("final"):
        sql += f"\nUPDATE knowledge_lessons SET is_final_exam = true WHERE id = {esc(L['id'])};\n"
    return sql

def quiz_sql(ex):
    tag = f"j_{ex['id'].replace('-', '_')}"
    att = att_sql(f"eax_{ex['id'].replace('-', '_')}", ex.get("attachments") or [])
    image = esc(ex["image_url"]) if ex.get("image_url") else "NULL"
    time_limit = ex["time_limit"] if ex.get("time_limit") is not None else "NULL"
    return f'''INSERT INTO knowledge_exercises (
  id, lesson_id, title, instructions, type, questions,
  passing_score, max_attempts, time_limit_minutes, sort_order,
  image_url, attachments
) VALUES (
  {esc(ex["id"])},
  {esc(ex["lesson_id"])},
  {esc(ex["title"])},
  {esc(ex.get("instructions"))},
  {esc(ex["type"])},
  {dollar(tag, json.dumps(ex["questions"], ensure_ascii=False))}::jsonb,
  {ex.get("passing", 70)},
  {ex.get("max_attempts", 3) if ex.get("max_attempts") is not None else "NULL"},
  {time_limit},
  {ex.get("sort_order", 1)},
  {image},
  {att}
) ON CONFLICT (id) DO UPDATE SET
  lesson_id = EXCLUDED.lesson_id, title = EXCLUDED.title, instructions = EXCLUDED.instructions,
  type = EXCLUDED.type, questions = EXCLUDED.questions, passing_score = EXCLUDED.passing_score,
  max_attempts = EXCLUDED.max_attempts, time_limit_minutes = EXCLUDED.time_limit_minutes,
  sort_order = EXCLUDED.sort_order, image_url = EXCLUDED.image_url,
  attachments = EXCLUDED.attachments, updated_at = now();
'''

def category_sql(cat):
    ct = dollar("ct", json.dumps(cat["certificate_template"], ensure_ascii=False))
    return f'''INSERT INTO knowledge_categories (id, name, slug, description, icon, sort_order, is_active)
VALUES (
  {esc(cat["id"])},
  {esc(cat["name"])},
  {esc(cat["slug"])},
  {esc(cat["description"])},
  {esc(cat["icon"])},
  {cat["sort_order"]},
  true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, slug = EXCLUDED.slug, description = EXCLUDED.description,
  icon = EXCLUDED.icon, sort_order = EXCLUDED.sort_order, is_active = true;

UPDATE knowledge_categories SET
  require_all_exercises_passed = true,
  deadline_mode = 'relative',
  deadline_duration_days = 14,
  deadline_note = {esc(cat["deadline_note"])},
  certificate_template = {ct}::jsonb
WHERE id = {esc(cat["id"])};
'''

def course_sql(header, cat, lessons, exercises):
    parts = [header, "BEGIN;\n", category_sql(cat), "\n-- BAI HOC\n"]
    for L in lessons:
        parts.append(lesson_sql(L))
        parts.append("\n")
    parts.append("-- BAI TAP\n")
    for ex in exercises:
        parts.append(quiz_sql(ex))
        parts.append("\n")
    parts.append("COMMIT;\n")
    return "".join(parts)

def att(*pairs):
    out = []
    for p in pairs:
        if isinstance(p, tuple):
            out.append({"type": "image", "url": img(p[0]), "caption": p[1]})
        else:
            out.append({"type": "image", "url": img(p), "caption": ""})
    return out

