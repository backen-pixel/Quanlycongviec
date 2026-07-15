-- 435: Pipeline VC/LĐ Phúc Đạt — Vận chuyển (5) + Lắp đặt (5)
-- Tab Kanban tách theo isInstallVcStage: tên có "lắp" hoặc bucket_slug chứa "install".
-- Idempotent.

BEGIN;

-- Phúc Đạt: 29677f68-967e-4256-92fd-492bb580e888

-- ═══════════════════════════════════════════════════════════
-- 1) Tắt cột pipeline cũ + giải phóng bucket_slug (unique theo company)
-- ═══════════════════════════════════════════════════════════
UPDATE logistics_pipeline_stages
SET is_active = false,
    bucket_slug = NULL
WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888'
  AND name NOT IN (
    'Chờ xác nhận', 'Xác nhận', 'Đang vận chuyển', 'Giao hàng', 'Có vấn đề',
    'Nhận hàng và kiểm tra', 'Đang lắp đặt', 'Nghiệm thu',
    'Hoàn thành và bàn giao', 'Có lỗi'
  );

-- ═══════════════════════════════════════════════════════════
-- 2) Vận chuyển (tab VC) — order 1..5
-- ═══════════════════════════════════════════════════════════
INSERT INTO logistics_pipeline_stages (name, color, icon, order_index, is_active, bucket_slug, company_id)
SELECT 'Chờ xác nhận', '#f97316', '📦', 1, true, 'delivery_pending', '29677f68-967e-4256-92fd-492bb580e888'
WHERE NOT EXISTS (
  SELECT 1 FROM logistics_pipeline_stages
  WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Chờ xác nhận'
);

INSERT INTO logistics_pipeline_stages (name, color, icon, order_index, is_active, bucket_slug, company_id)
SELECT 'Xác nhận', '#fb923c', '✔️', 2, true, NULL, '29677f68-967e-4256-92fd-492bb580e888'
WHERE NOT EXISTS (
  SELECT 1 FROM logistics_pipeline_stages
  WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Xác nhận'
);

INSERT INTO logistics_pipeline_stages (name, color, icon, order_index, is_active, bucket_slug, company_id)
SELECT 'Đang vận chuyển', '#ea580c', '🚚', 3, true, NULL, '29677f68-967e-4256-92fd-492bb580e888'
WHERE NOT EXISTS (
  SELECT 1 FROM logistics_pipeline_stages
  WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Đang vận chuyển'
);

INSERT INTO logistics_pipeline_stages (name, color, icon, order_index, is_active, bucket_slug, company_id)
SELECT 'Giao hàng', '#c2410c', '📬', 4, true, NULL, '29677f68-967e-4256-92fd-492bb580e888'
WHERE NOT EXISTS (
  SELECT 1 FROM logistics_pipeline_stages
  WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Giao hàng'
);

INSERT INTO logistics_pipeline_stages (name, color, icon, order_index, is_active, bucket_slug, company_id)
SELECT 'Có vấn đề', '#dc2626', '⚠️', 5, true, 'delivery_issue', '29677f68-967e-4256-92fd-492bb580e888'
WHERE NOT EXISTS (
  SELECT 1 FROM logistics_pipeline_stages
  WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Có vấn đề'
);

-- ═══════════════════════════════════════════════════════════
-- 3) Lắp đặt (tab Lắp đặt) — order 10..14
-- bucket_slug chứa "install" để tab nhận đúng cả cột không có chữ "lắp"
-- ═══════════════════════════════════════════════════════════
INSERT INTO logistics_pipeline_stages (name, color, icon, order_index, is_active, bucket_slug, company_id)
SELECT 'Nhận hàng và kiểm tra', '#d97706', '📥', 10, true, 'install_receive', '29677f68-967e-4256-92fd-492bb580e888'
WHERE NOT EXISTS (
  SELECT 1 FROM logistics_pipeline_stages
  WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Nhận hàng và kiểm tra'
);

INSERT INTO logistics_pipeline_stages (name, color, icon, order_index, is_active, bucket_slug, company_id)
SELECT 'Đang lắp đặt', '#b45309', '🔧', 11, true, 'install_in_progress', '29677f68-967e-4256-92fd-492bb580e888'
WHERE NOT EXISTS (
  SELECT 1 FROM logistics_pipeline_stages
  WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Đang lắp đặt'
);

INSERT INTO logistics_pipeline_stages (name, color, icon, order_index, is_active, bucket_slug, company_id)
SELECT 'Nghiệm thu', '#0d9488', '📋', 12, true, 'install_acceptance', '29677f68-967e-4256-92fd-492bb580e888'
WHERE NOT EXISTS (
  SELECT 1 FROM logistics_pipeline_stages
  WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Nghiệm thu'
);

INSERT INTO logistics_pipeline_stages (name, color, icon, order_index, is_active, bucket_slug, company_id)
SELECT 'Hoàn thành và bàn giao', '#16a34a', '✅', 13, true, 'install_completed', '29677f68-967e-4256-92fd-492bb580e888'
WHERE NOT EXISTS (
  SELECT 1 FROM logistics_pipeline_stages
  WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Hoàn thành và bàn giao'
);

INSERT INTO logistics_pipeline_stages (name, color, icon, order_index, is_active, bucket_slug, company_id)
SELECT 'Có lỗi', '#dc2626', '❗', 14, true, 'install_issue', '29677f68-967e-4256-92fd-492bb580e888'
WHERE NOT EXISTS (
  SELECT 1 FROM logistics_pipeline_stages
  WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Có lỗi'
);

-- ═══════════════════════════════════════════════════════════
-- 4) Đồng bộ lại nếu đã tồn tại (bật + đúng thứ tự / màu / slug)
-- ═══════════════════════════════════════════════════════════
UPDATE logistics_pipeline_stages SET is_active = true, order_index = 1, color = '#f97316', icon = '📦', bucket_slug = 'delivery_pending'
WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Chờ xác nhận';

UPDATE logistics_pipeline_stages SET is_active = true, order_index = 2, color = '#fb923c', icon = '✔️', bucket_slug = NULL
WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Xác nhận';

UPDATE logistics_pipeline_stages SET is_active = true, order_index = 3, color = '#ea580c', icon = '🚚', bucket_slug = NULL
WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Đang vận chuyển';

UPDATE logistics_pipeline_stages SET is_active = true, order_index = 4, color = '#c2410c', icon = '📬', bucket_slug = NULL
WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Giao hàng';

UPDATE logistics_pipeline_stages SET is_active = true, order_index = 5, color = '#dc2626', icon = '⚠️', bucket_slug = 'delivery_issue'
WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Có vấn đề';

UPDATE logistics_pipeline_stages SET is_active = true, order_index = 10, color = '#d97706', icon = '📥', bucket_slug = 'install_receive'
WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Nhận hàng và kiểm tra';

UPDATE logistics_pipeline_stages SET is_active = true, order_index = 11, color = '#b45309', icon = '🔧', bucket_slug = 'install_in_progress'
WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Đang lắp đặt';

UPDATE logistics_pipeline_stages SET is_active = true, order_index = 12, color = '#0d9488', icon = '📋', bucket_slug = 'install_acceptance'
WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Nghiệm thu';

UPDATE logistics_pipeline_stages SET is_active = true, order_index = 13, color = '#16a34a', icon = '✅', bucket_slug = 'install_completed'
WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Hoàn thành và bàn giao';

UPDATE logistics_pipeline_stages SET is_active = true, order_index = 14, color = '#dc2626', icon = '❗', bucket_slug = 'install_issue'
WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Có lỗi';

-- ═══════════════════════════════════════════════════════════
-- 5) Chuyển dự án Phúc Đạt đang ở cột cũ → «Chờ xác nhận»
-- ═══════════════════════════════════════════════════════════
UPDATE projects p
SET vc_kanban_column_id = s.id,
    updated_at = now()
FROM logistics_pipeline_stages s
WHERE s.company_id = '29677f68-967e-4256-92fd-492bb580e888'
  AND s.name = 'Chờ xác nhận'
  AND s.is_active = true
  AND p.logistics_company_id = '29677f68-967e-4256-92fd-492bb580e888'
  AND (
    p.vc_kanban_column_id IS NULL
    OR p.vc_kanban_column_id IN (
      SELECT id FROM logistics_pipeline_stages
      WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888'
        AND is_active = false
    )
    OR p.vc_kanban_column_id IN (
      SELECT id FROM logistics_pipeline_stages WHERE company_id IS NULL
    )
  );

COMMIT;
