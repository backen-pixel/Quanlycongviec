# -*- coding: utf-8 -*-
"""Sinh database/554-556 khoá từng nút chi tiết CRM / SX / VC."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from _detail_seed_helpers import course_sql
from _detail_seed_crm import crm_bundle
from _detail_seed_workshop import workshop_bundle

DB = HERE.parents[1] / "database"

HEADERS = {
    "554": """-- 554
-- Khoá «Thao tác chi tiết CRM» — từng nút trên trang Lead/Deal
-- 6 bài (bài 6 = thi cuối + checklist). Ảnh tái sử dụng screenshot Kiến thức đã có.
-- Idempotent: ON CONFLICT DO UPDATE
-- Sinh: python scripts/knowledge/build_detail_button_seeds.py

""",
    "555": """-- 555
-- Khoá «Thao tác chi tiết Sản xuất» — từng nút trên trang dự án xưởng
-- Cùng khung 6 bài với CRM và VC. Idempotent ON CONFLICT DO UPDATE
-- Sinh: python scripts/knowledge/build_detail_button_seeds.py

""",
    "556": """-- 556
-- Khoá «Thao tác chi tiết VC/LĐ» — từng nút trên trang dự án lắp đặt
-- Cùng khung 6 bài với CRM và SX. Idempotent ON CONFLICT DO UPDATE
-- Sinh: python scripts/knowledge/build_detail_button_seeds.py

""",
}

def write_course(num, filename, cat, lessons, exercises):
    sql = course_sql(HEADERS[num], cat, lessons, exercises)
    out = DB / filename
    out.write_text(sql, encoding="utf-8")
    print(f"Wrote {out} ({len(lessons)} lessons, {len(exercises)} exercises, {out.stat().st_size} bytes)")

def main():
    cat, lessons, exs = crm_bundle()
    write_course("554", "554_knowledge_seed_crm_detail_buttons.sql", cat, lessons, exs)
    cat, lessons, exs = workshop_bundle("sx")
    write_course("555", "555_knowledge_seed_sx_detail_buttons.sql", cat, lessons, exs)
    cat, lessons, exs = workshop_bundle("vc")
    write_course("556", "556_knowledge_seed_vc_detail_buttons.sql", cat, lessons, exs)

if __name__ == "__main__":
    main()