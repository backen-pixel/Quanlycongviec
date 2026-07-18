-- 443: Tách Doanh thu (CRM/SX tạo tay) vs Chi phí sản xuất; cờ created_from_sx.
-- Công nợ SX = production_value − deposit_amount (không lấy estimated_value CRM).

BEGIN;

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS created_from_sx BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN projects.created_from_sx IS
  'TRUE: deal/dự án tạo thủ công từ module Sản xuất (workshop-intake). FALSE: chuyển từ CRM thắng. SX chỉ hiện cột Doanh thu khi TRUE.';

COMMENT ON COLUMN projects.estimated_value IS
  'Doanh thu / giá trị đơn (CRM hoặc đơn tạo từ SX). Không dùng làm chi phí SX / công nợ SX.';

COMMENT ON COLUMN projects.production_value IS
  'Chi phí sản xuất (module SX). Công nợ SX = production_value − deposit_amount.';

-- Backfill: tạo từ xưởng (mô tả [Xưởng] …)
UPDATE projects
SET created_from_sx = true
WHERE created_from_sx = false
  AND (
    description ILIKE '[Xưởng]%'
    OR description ILIKE '[Xuong]%'
    OR description ILIKE '%Tạo trực tiếp từ module Sản xuất%'
  );

-- Deal CRM chuyển qua: nếu chi phí bị copy = doanh thu thì xóa chi phí (để nhập lại đúng)
UPDATE projects
SET production_value = NULL
WHERE COALESCE(created_from_sx, false) = false
  AND production_value IS NOT NULL
  AND estimated_value IS NOT NULL
  AND production_value::numeric = estimated_value::numeric;

COMMIT;
