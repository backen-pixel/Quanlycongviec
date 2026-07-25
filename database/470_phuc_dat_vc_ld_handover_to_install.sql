-- 470: Chuẩn hóa pipeline VC/LĐ Phúc Đạt + bật «Chuyển LĐ» trên cột Giao hàng.
-- Khi kéo dự án vào cột Giao hàng (is_handover_to_install) → nhảy sang cột Lắp đặt đầu tiên
-- («Nhận hàng và kiểm tra»).
-- Idempotent.

BEGIN;

-- Phúc Đạt: 29677f68-967e-4256-92fd-492bb580e888

-- ═══════════════════════════════════════════════════════════
-- 1) Đảm bảo đủ cột VC (tab Vận chuyển)
-- ═══════════════════════════════════════════════════════════
INSERT INTO logistics_pipeline_stages (name, color, icon, order_index, is_active, bucket_slug, company_id, is_handover_to_install)
SELECT 'Chờ xác nhận', '#f97316', '📦', 1, true, 'delivery_pending', '29677f68-967e-4256-92fd-492bb580e888', false
WHERE NOT EXISTS (
  SELECT 1 FROM logistics_pipeline_stages
  WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Chờ xác nhận'
);

-- «Nhận hàng» = cột VC #2 (đã rename từ «Xác nhận» trên môi trường live)
INSERT INTO logistics_pipeline_stages (name, color, icon, order_index, is_active, bucket_slug, company_id, is_handover_to_install)
SELECT 'Nhận hàng', '#fb923c', '✔️', 2, true, NULL, '29677f68-967e-4256-92fd-492bb580e888', false
WHERE NOT EXISTS (
  SELECT 1 FROM logistics_pipeline_stages
  WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888'
    AND name IN ('Nhận hàng', 'Xác nhận')
);

INSERT INTO logistics_pipeline_stages (name, color, icon, order_index, is_active, bucket_slug, company_id, is_handover_to_install)
SELECT 'Đang vận chuyển', '#ea580c', '🚚', 3, true, NULL, '29677f68-967e-4256-92fd-492bb580e888', false
WHERE NOT EXISTS (
  SELECT 1 FROM logistics_pipeline_stages
  WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Đang vận chuyển'
);

INSERT INTO logistics_pipeline_stages (name, color, icon, order_index, is_active, bucket_slug, company_id, is_handover_to_install)
SELECT 'Giao hàng', '#c2410c', '📬', 4, true, NULL, '29677f68-967e-4256-92fd-492bb580e888', true
WHERE NOT EXISTS (
  SELECT 1 FROM logistics_pipeline_stages
  WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Giao hàng'
);

INSERT INTO logistics_pipeline_stages (name, color, icon, order_index, is_active, bucket_slug, company_id, is_handover_to_install)
SELECT 'Có vấn đề', '#dc2626', '⚠️', 5, true, 'delivery_issue', '29677f68-967e-4256-92fd-492bb580e888', false
WHERE NOT EXISTS (
  SELECT 1 FROM logistics_pipeline_stages
  WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Có vấn đề'
);

-- ═══════════════════════════════════════════════════════════
-- 2) Đảm bảo đủ cột LĐ (tab Lắp đặt) — bucket_slug chứa «install»
-- ═══════════════════════════════════════════════════════════
INSERT INTO logistics_pipeline_stages (name, color, icon, order_index, is_active, bucket_slug, company_id, is_handover_to_install)
SELECT 'Nhận hàng và kiểm tra', '#d97706', '📥', 10, true, 'install_receive', '29677f68-967e-4256-92fd-492bb580e888', false
WHERE NOT EXISTS (
  SELECT 1 FROM logistics_pipeline_stages
  WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Nhận hàng và kiểm tra'
);

INSERT INTO logistics_pipeline_stages (name, color, icon, order_index, is_active, bucket_slug, company_id, is_handover_to_install)
SELECT 'Đang lắp đặt', '#b45309', '🔧', 11, true, 'install_in_progress', '29677f68-967e-4256-92fd-492bb580e888', false
WHERE NOT EXISTS (
  SELECT 1 FROM logistics_pipeline_stages
  WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Đang lắp đặt'
);

INSERT INTO logistics_pipeline_stages (name, color, icon, order_index, is_active, bucket_slug, company_id, is_handover_to_install)
SELECT 'Nghiệm thu', '#0d9488', '📋', 12, true, 'install_acceptance', '29677f68-967e-4256-92fd-492bb580e888', false
WHERE NOT EXISTS (
  SELECT 1 FROM logistics_pipeline_stages
  WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Nghiệm thu'
);

INSERT INTO logistics_pipeline_stages (name, color, icon, order_index, is_active, bucket_slug, company_id, is_handover_to_install)
SELECT 'Hoàn thành và bàn giao', '#16a34a', '✅', 13, true, 'install_completed', '29677f68-967e-4256-92fd-492bb580e888', false
WHERE NOT EXISTS (
  SELECT 1 FROM logistics_pipeline_stages
  WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Hoàn thành và bàn giao'
);

INSERT INTO logistics_pipeline_stages (name, color, icon, order_index, is_active, bucket_slug, company_id, is_handover_to_install)
SELECT 'Có lỗi', '#dc2626', '❗', 14, true, 'install_issue', '29677f68-967e-4256-92fd-492bb580e888', false
WHERE NOT EXISTS (
  SELECT 1 FROM logistics_pipeline_stages
  WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Có lỗi'
);

-- ═══════════════════════════════════════════════════════════
-- 3) Đồng bộ thứ tự / màu / slug + tắt cờ LĐ trên mọi cột
-- ═══════════════════════════════════════════════════════════
UPDATE logistics_pipeline_stages
SET is_active = true, order_index = 1, color = '#f97316', icon = '📦',
    bucket_slug = 'delivery_pending', is_handover_to_install = false
WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Chờ xác nhận';

UPDATE logistics_pipeline_stages
SET is_active = true, order_index = 2, color = '#fb923c', icon = '✔️',
    bucket_slug = NULL, is_handover_to_install = false
WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888'
  AND name IN ('Nhận hàng', 'Xác nhận');

UPDATE logistics_pipeline_stages
SET is_active = true, order_index = 3, color = '#ea580c', icon = '🚚',
    bucket_slug = NULL, is_handover_to_install = false
WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Đang vận chuyển';

UPDATE logistics_pipeline_stages
SET is_active = true, order_index = 4, color = '#c2410c', icon = '📬',
    bucket_slug = NULL, is_handover_to_install = false
WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Giao hàng';

UPDATE logistics_pipeline_stages
SET is_active = true, order_index = 5, color = '#dc2626', icon = '⚠️',
    bucket_slug = 'delivery_issue', is_handover_to_install = false
WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Có vấn đề';

UPDATE logistics_pipeline_stages
SET is_active = true, order_index = 10, color = '#d97706', icon = '📥',
    bucket_slug = 'install_receive', is_handover_to_install = false
WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Nhận hàng và kiểm tra';

UPDATE logistics_pipeline_stages
SET is_active = true, order_index = 11, color = '#b45309', icon = '🔧',
    bucket_slug = 'install_in_progress', is_handover_to_install = false
WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Đang lắp đặt';

UPDATE logistics_pipeline_stages
SET is_active = true, order_index = 12, color = '#0d9488', icon = '📋',
    bucket_slug = 'install_acceptance', is_handover_to_install = false
WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Nghiệm thu';

UPDATE logistics_pipeline_stages
SET is_active = true, order_index = 13, color = '#16a34a', icon = '✅',
    bucket_slug = 'install_completed', is_handover_to_install = false
WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Hoàn thành và bàn giao';

UPDATE logistics_pipeline_stages
SET is_active = true, order_index = 14, color = '#dc2626', icon = '❗',
    bucket_slug = 'install_issue', is_handover_to_install = false
WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Có lỗi';

-- ═══════════════════════════════════════════════════════════
-- 4) Bật «Chuyển LĐ» trên cột Giao hàng (cổng VC → LĐ)
-- ═══════════════════════════════════════════════════════════
UPDATE logistics_pipeline_stages
SET is_handover_to_install = true
WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888'
  AND name = 'Giao hàng'
  AND is_active = true;

COMMIT;
