# -*- coding: utf-8 -*-
"""Sinh database/567 khoá Đặt xưởng khác."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from _detail_seed_helpers import course_sql
from _detail_seed_place_workshop import place_workshop_bundle

DB = HERE.parents[1] / "database"

HEADER = """-- 567
-- Khoá «Đặt xưởng khác» — nút indigo trên trang chi tiết SX (ProductionDetail)
-- 5 bài (bài 5 = thi cuối + checklist). Bài tập dựa trên khoá 534 Kế hoạch SX & VC/LĐ
-- (cùng form ngày/VC). Ảnh tái sử dụng screenshot sx-vc-*.
-- Idempotent: ON CONFLICT DO UPDATE
-- Sinh: python scripts/knowledge/build_place_workshop_seed.py

"""


def main():
    cat, lessons, exs = place_workshop_bundle()
    sql = course_sql(HEADER, cat, lessons, exs)
    out = DB / "567_knowledge_seed_dat_xuong_khac.sql"
    out.write_text(sql, encoding="utf-8")
    print(f"Wrote {out} ({len(lessons)} lessons, {len(exs)} exercises, {out.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
