-- 421: Phúc Đạt VC/LĐ — xóa bộ mẫu cũ, tạo pipeline + nhiệm vụ mới
-- Pipeline: Nhận hàng → Lắp đặt → Hoàn thành
-- Nhiệm vụ (6):
--   Nhận hàng: Kiểm tra trước khi lấy hàng | Hàng lên xe và vận chuyển | Kiểm tra trước khi giao hàng
--   Lắp đặt:   Kiểm tra và nhận hàng | Quy trình lắp đặt | Nghiệm thu sau khi lắp
-- Idempotent (theo company_id + tên).

BEGIN;

-- Phúc Đạt: 29677f68-967e-4256-92fd-492bb580e888
-- Nguyễn Ngọc Linh: 5e07fb3b-3286-4ca3-a167-4edef16f3866

-- ═══════════════════════════════════════════════════════════
-- 1) Xóa bộ mẫu VC/LĐ cũ của Phúc Đạt
-- ═══════════════════════════════════════════════════════════
DELETE FROM workshop_task_template_items
WHERE template_id IN (
  SELECT id FROM workshop_task_templates
  WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888'
    AND workshop_area = 'logistics'
);

DELETE FROM workshop_task_templates
WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888'
  AND workshop_area = 'logistics';

-- ═══════════════════════════════════════════════════════════
-- 2) Pipeline riêng công ty Phúc Đạt (3 cột)
-- ═══════════════════════════════════════════════════════════
-- Tắt cột cũ cùng tên (nếu từng tạo)
UPDATE logistics_pipeline_stages
SET is_active = false
WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888';

INSERT INTO logistics_pipeline_stages (name, color, icon, order_index, is_active, bucket_slug, company_id)
SELECT 'Nhận hàng', '#f97316', '📦', 1, true, 'delivery_pending', '29677f68-967e-4256-92fd-492bb580e888'
WHERE NOT EXISTS (
  SELECT 1 FROM logistics_pipeline_stages
  WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888'
    AND name = 'Nhận hàng'
);

INSERT INTO logistics_pipeline_stages (name, color, icon, order_index, is_active, bucket_slug, company_id)
SELECT 'Lắp đặt', '#d97706', '🔧', 2, true, NULL, '29677f68-967e-4256-92fd-492bb580e888'
WHERE NOT EXISTS (
  SELECT 1 FROM logistics_pipeline_stages
  WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888'
    AND name = 'Lắp đặt'
);

INSERT INTO logistics_pipeline_stages (name, color, icon, order_index, is_active, bucket_slug, company_id)
SELECT 'Hoàn thành', '#16a34a', '✅', 3, true, 'completed', '29677f68-967e-4256-92fd-492bb580e888'
WHERE NOT EXISTS (
  SELECT 1 FROM logistics_pipeline_stages
  WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888'
    AND name = 'Hoàn thành'
);

-- Đồng bộ lại nếu đã tồn tại
UPDATE logistics_pipeline_stages
SET is_active = true, order_index = 1, color = '#f97316', icon = '📦', bucket_slug = 'delivery_pending'
WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Nhận hàng';

UPDATE logistics_pipeline_stages
SET is_active = true, order_index = 2, color = '#d97706', icon = '🔧', bucket_slug = NULL
WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Lắp đặt';

UPDATE logistics_pipeline_stages
SET is_active = true, order_index = 3, color = '#16a34a', icon = '✅', bucket_slug = 'completed'
WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888' AND name = 'Hoàn thành';

-- Dự án Phúc Đạt đang ở cột global → chuyển sang «Nhận hàng» công ty
UPDATE projects p
SET vc_kanban_column_id = s.id,
    updated_at = now()
FROM logistics_pipeline_stages s
WHERE s.company_id = '29677f68-967e-4256-92fd-492bb580e888'
  AND s.name = 'Nhận hàng'
  AND p.logistics_company_id = '29677f68-967e-4256-92fd-492bb580e888'
  AND (
    p.vc_kanban_column_id IS NULL
    OR p.vc_kanban_column_id IN (
      SELECT id FROM logistics_pipeline_stages WHERE company_id IS NULL
    )
  );

-- ═══════════════════════════════════════════════════════════
-- 3) Bộ mẫu nhiệm vụ mới (6 việc) — mặc định
-- ═══════════════════════════════════════════════════════════
INSERT INTO workshop_task_templates (
  name, workshop_area, description, company_id, is_active, is_default, order_index
)
VALUES (
  'Bộ mẫu VC/LĐ Phúc Đạt',
  'logistics',
  'Nhận hàng (3) → Lắp đặt (3). Pipeline: Nhận hàng → Lắp đặt → Hoàn thành.',
  '29677f68-967e-4256-92fd-492bb580e888',
  true,
  true,
  0
);

-- Gắn template vào cột Nhận hàng (áp dụng khi vào intake)
UPDATE workshop_task_templates t
SET logistics_stage_id = s.id
FROM logistics_pipeline_stages s
WHERE t.company_id = '29677f68-967e-4256-92fd-492bb580e888'
  AND t.name = 'Bộ mẫu VC/LĐ Phúc Đạt'
  AND s.company_id = '29677f68-967e-4256-92fd-492bb580e888'
  AND s.name = 'Nhận hàng';

INSERT INTO workshop_task_template_items (
  template_id, title, description, priority, deadline_days, order_index,
  checklist, default_assignee_id, blocks_stage_advance
)
SELECT t.id, v.title, v.description, v.priority, v.deadline_days, v.order_index,
       v.checklist::jsonb,
       '5e07fb3b-3286-4ca3-a167-4edef16f3866'::uuid,
       v.blocks_stage_advance
FROM workshop_task_templates t,
(VALUES
  -- ── Nhận hàng ──
  (
    'Kiểm tra trước khi lấy hàng',
    'Đối chiếu đơn, kiện hàng và điều kiện trước khi lấy hàng tại kho.',
    'high', 0, 1,
    '[{"text":"Đối chiếu mã dự án / mã đơn"},{"text":"Kiểm tra số kiện và phụ kiện"},{"text":"Xác nhận đủ điều kiện lấy hàng"}]',
    false
  ),
  (
    'Hàng lên xe và vận chuyển',
    'Xếp hàng lên xe và vận chuyển tới công trình.',
    'high', 1, 2,
    '[{"text":"Xếp hàng lên xe an toàn"},{"text":"Chụp ảnh hàng trên xe"},{"text":"Xuất phát và theo dõi hành trình"}]',
    false
  ),
  (
    'Kiểm tra trước khi giao hàng',
    'Kiểm tra tình trạng hàng trước khi bàn giao tại công trình.',
    'high', 1, 3,
    '[{"text":"Kiểm tra kiện hàng khi đến công trình"},{"text":"Đối chiếu số lượng với packing list"},{"text":"Ghi nhận hư hỏng / thiếu (nếu có)"}]',
    true
  ),
  -- ── Lắp đặt ──
  (
    'Kiểm tra và nhận hàng',
    'Kiểm tra và xác nhận nhận hàng tại công trình trước khi lắp.',
    'high', 0, 4,
    '[{"text":"Kiểm đếm kiện / phụ kiện tại công trình"},{"text":"Kiểm tra mặt bằng trước lắp"},{"text":"Xác nhận đã nhận đủ hàng để lắp"}]',
    false
  ),
  (
    'Quy trình lắp đặt',
    'Thi công lắp đặt theo bản vẽ / hiện trường.',
    'high', 2, 5,
    '[{"text":"Lắp theo bản vẽ hiện trường"},{"text":"Ghi nhận phát sinh (nếu có)"},{"text":"Vệ sinh khu vực thi công"}]',
    false
  ),
  (
    'Nghiệm thu sau khi lắp',
    'Nghiệm thu với khách sau khi hoàn tất lắp đặt.',
    'high', 1, 6,
    '[{"text":"Khách kiểm tra và ký nghiệm thu"},{"text":"Ghi hạng mục tồn / hẹn xử lý (nếu có)"},{"text":"Chụp ảnh công trình hoàn thiện"}]',
    true
  )
) AS v(title, description, priority, deadline_days, order_index, checklist, blocks_stage_advance)
WHERE t.company_id = '29677f68-967e-4256-92fd-492bb580e888'
  AND t.name = 'Bộ mẫu VC/LĐ Phúc Đạt'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_task_template_items i
    WHERE i.template_id = t.id AND i.title = v.title
  );

COMMIT;
