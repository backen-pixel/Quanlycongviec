-- 431: Thêm mô tả (gợi ý) cho phân loại dự án xưởng (workshop_project_types)
-- Hiển thị ở bước "Chuyển Deal sang Sản xuất" / "Tạo dự án" để hướng dẫn chọn đúng phân loại.
-- Idempotent: dùng IF NOT EXISTS cho cột, UPDATE theo tên (không tạo lại nếu đã có mô tả).

BEGIN;

ALTER TABLE workshop_project_types
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Metalla: 2 phân loại "Data đầu vào" (tiếp nhận B2B/báo giá) và "Data đầu ra" (sản xuất).
-- Khi chuyển Deal CRM sang Sản xuất, nhân sự nên chọn "Data đầu ra".
DO $$
DECLARE
  v_metala_id UUID;
BEGIN
  SELECT id INTO v_metala_id FROM companies
  WHERE name ILIKE '%Metall%' OR short_name ILIKE '%Metall%'
  ORDER BY name LIMIT 1;

  IF v_metala_id IS NULL THEN
    RAISE NOTICE '431: Không tìm thấy công ty Metalla — bỏ qua seed mô tả.';
    RETURN;
  END IF;

  UPDATE workshop_project_types
  SET description = 'Khi chuyển Deal từ CRM sang Sản xuất, hãy chọn phân loại "Data đầu ra" (đây là pipeline tiếp nhận/báo giá B2B, không dùng cho bước sản xuất).'
  WHERE company_id = v_metala_id AND lower(trim(name)) = lower('Data đầu vào');

  UPDATE workshop_project_types
  SET description = 'Sản xuất nên chọn phân loại này khi chuyển Deal từ CRM sang Sản xuất.'
  WHERE company_id = v_metala_id AND lower(trim(name)) = lower('Data đầu ra');
END $$;

COMMIT;
