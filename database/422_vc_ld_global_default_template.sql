-- 422: Bộ mẫu chung VC/LĐ (global) — 6 việc mới, đặt mặc định
-- Bỏ mặc định bộ riêng công ty Phúc Đạt → dùng bộ chung.
-- Idempotent.

BEGIN;

-- 1) Tắt / bỏ mặc định bộ riêng Phúc Đạt (để resolve fallback về global)
UPDATE workshop_task_templates
SET is_default = false,
    is_active = false,
    updated_at = now()
WHERE company_id = '29677f68-967e-4256-92fd-492bb580e888'
  AND workshop_area = 'logistics';

-- 2) Cập nhật hoặc tạo bộ chung (company_id NULL)
UPDATE workshop_task_templates
SET is_active = true,
    is_default = true,
    logistics_stage_id = NULL,
    name = 'Bộ mẫu chung VC/LĐ',
    description = 'Bộ mẫu chung: Nhận hàng (3) → Lắp đặt (3).',
    order_index = 0,
    updated_at = now()
WHERE id = '26f5fcf7-bdd7-453b-8f55-1279b81dc9af'
  AND company_id IS NULL
  AND workshop_area = 'logistics';

-- Nếu chưa có bản ghi global (phòng khi id khác)
INSERT INTO workshop_task_templates (
  name, workshop_area, description, company_id, is_active, is_default, order_index, logistics_stage_id
)
SELECT
  'Bộ mẫu chung VC/LĐ',
  'logistics',
  'Bộ mẫu chung: Nhận hàng (3) → Lắp đặt (3).',
  NULL,
  true,
  true,
  0,
  NULL
WHERE NOT EXISTS (
  SELECT 1 FROM workshop_task_templates
  WHERE workshop_area = 'logistics' AND company_id IS NULL AND is_active = true
);

-- Chỉ 1 mặc định global logistics
UPDATE workshop_task_templates
SET is_default = false, updated_at = now()
WHERE workshop_area = 'logistics'
  AND company_id IS NULL
  AND name <> 'Bộ mẫu chung VC/LĐ'
  AND is_default = true;

UPDATE workshop_task_templates
SET is_default = true, is_active = true, updated_at = now()
WHERE workshop_area = 'logistics'
  AND company_id IS NULL
  AND name = 'Bộ mẫu chung VC/LĐ';

-- 3) Xóa item cũ của bộ chung, gắn 6 việc mới
DELETE FROM workshop_task_template_items
WHERE template_id IN (
  SELECT id FROM workshop_task_templates
  WHERE workshop_area = 'logistics'
    AND company_id IS NULL
    AND name = 'Bộ mẫu chung VC/LĐ'
);

INSERT INTO workshop_task_template_items (
  template_id, title, description, priority, deadline_days, order_index,
  checklist, blocks_stage_advance
)
SELECT t.id, v.title, v.description, v.priority, v.deadline_days, v.order_index,
       v.checklist::jsonb, v.blocks_stage_advance
FROM workshop_task_templates t,
(VALUES
  (
    'Kiểm tra trước khi lấy hàng',
    NULL,
    'high', 0, 1,
    '[{"text":"Đối chiếu mã dự án / mã đơn"},{"text":"Kiểm tra số kiện và phụ kiện"},{"text":"Xác nhận đủ điều kiện lấy hàng"}]',
    false
  ),
  (
    'Hàng lên xe và vận chuyển',
    NULL,
    'high', 1, 2,
    '[{"text":"Xếp hàng lên xe an toàn"},{"text":"Chụp ảnh hàng trên xe"},{"text":"Xuất phát và theo dõi hành trình"}]',
    false
  ),
  (
    'Kiểm tra trước khi giao hàng',
    NULL,
    'high', 1, 3,
    '[{"text":"Kiểm tra kiện hàng khi đến công trình"},{"text":"Đối chiếu số lượng với packing list"},{"text":"Ghi nhận hư hỏng / thiếu (nếu có)"}]',
    true
  ),
  (
    'Kiểm tra và nhận hàng',
    NULL,
    'high', 0, 4,
    '[{"text":"Kiểm đếm kiện / phụ kiện tại công trình"},{"text":"Kiểm tra mặt bằng trước lắp"},{"text":"Xác nhận đã nhận đủ hàng để lắp"}]',
    false
  ),
  (
    'Quy trình lắp đặt',
    NULL,
    'high', 2, 5,
    '[{"text":"Lắp theo bản vẽ hiện trường"},{"text":"Ghi nhận phát sinh (nếu có)"},{"text":"Vệ sinh khu vực thi công"}]',
    false
  ),
  (
    'Nghiệm thu sau khi lắp',
    NULL,
    'high', 1, 6,
    '[{"text":"Khách kiểm tra và ký nghiệm thu"},{"text":"Ghi hạng mục tồn / hẹn xử lý (nếu có)"},{"text":"Chụp ảnh công trình hoàn thiện"}]',
    true
  )
) AS v(title, description, priority, deadline_days, order_index, checklist, blocks_stage_advance)
WHERE t.workshop_area = 'logistics'
  AND t.company_id IS NULL
  AND t.name = 'Bộ mẫu chung VC/LĐ';

COMMIT;
