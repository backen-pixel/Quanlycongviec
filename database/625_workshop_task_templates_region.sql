-- 625: Bộ mẫu việc xưởng / VC gắn được KHU VỰC.
--
-- NULL = áp cho MỌI khu vực của công ty — đúng bằng hành vi hiện tại, nên 109 bộ mẫu
-- đang có không đổi một nét. Chỉ bộ mẫu do người dùng gắn khu vực mới bị lọc khi sinh
-- việc cho dự án (xem fetchActiveWorkshopTemplatesForArea).
--
-- Additive: chỉ thêm cột nullable + index một phần. Không sửa, không xoá dữ liệu.

BEGIN;

ALTER TABLE workshop_task_templates
  ADD COLUMN IF NOT EXISTS region_id UUID REFERENCES company_regions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_workshop_task_templates_region
  ON workshop_task_templates (company_id, region_id)
  WHERE region_id IS NOT NULL;

COMMENT ON COLUMN workshop_task_templates.region_id IS
  'Khu vực áp dụng bộ mẫu. NULL = mọi khu vực của công ty (mặc định).';

COMMIT;
