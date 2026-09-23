-- 626: Tách «Giá vốn» thành nhóm chi phí riêng, và chuyển nguồn giá vốn CRM sang nhóm đó.
--
-- Trước: nguồn crm.product_cogs («Giá vốn dòng báo giá / ĐH») rơi vào nhóm «Nguyên vật liệu».
-- Sai về kế toán: NVL là vật tư xưởng mua về, còn giá vốn là giá vốn của hàng đã báo giá /
-- đã bán. Gộp chung thì biến cat.nvl trong công thức cộng lẫn hai thứ khác nhau.
--
-- Additive: chỉ THÊM nhóm gia_von cho từng phạm vi setup (công ty, khu vực) đang có, rồi
-- trỏ lại default_category_id của đúng một nguồn. Không xoá nhóm nào, không đụng cost_entries
-- (bảng đang trống — nếu sau này có dòng cũ trỏ nhóm nvl thì vẫn giữ nguyên, không sửa ngược).

BEGIN;

-- 1. Thêm nhóm «Giá vốn» cho mọi phạm vi setup đã tồn tại (chạy lại nhiều lần vẫn an toàn).
INSERT INTO cost_categories (company_id, region_id, code, name, sort_order, is_active)
SELECT DISTINCT c.company_id, c.region_id, 'gia_von', 'Giá vốn', 5, TRUE
FROM cost_categories c
WHERE NOT EXISTS (
  SELECT 1 FROM cost_categories x
  WHERE x.company_id = c.company_id
    AND x.region_id IS NOT DISTINCT FROM c.region_id
    AND lower(x.code) = 'gia_von'
);

-- 2. Nguồn giá vốn CRM trỏ sang nhóm mới, đúng theo từng phạm vi.
UPDATE cost_source_defs s
SET default_category_id = c.id,
    updated_at = now()
FROM cost_categories c
WHERE s.source_key = 'crm.product_cogs'
  AND c.company_id = s.company_id
  AND c.region_id IS NOT DISTINCT FROM s.region_id
  AND lower(c.code) = 'gia_von'
  AND s.default_category_id IS DISTINCT FROM c.id;

COMMIT;
