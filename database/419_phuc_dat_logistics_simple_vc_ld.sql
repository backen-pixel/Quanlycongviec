-- 419: Đơn giản hóa bộ nhiệm vụ VC/LĐ Phúc Đạt (7 bước) + thêm cột pipeline Hoàn thành (global)
-- Chạy sau 418_phuc_dat_logistics_vc_ld_task_template.sql
-- Idempotent.

BEGIN;

-- Phúc Đạt: 29677f68-967e-4256-92fd-492bb580e888
-- Nguyễn Ngọc Linh: 5e07fb3b-3286-4ca3-a167-4edef16f3866

-- Cột pipeline «Hoàn thành» (global — Phúc Đạt dùng pipeline global)
INSERT INTO logistics_pipeline_stages (name, color, icon, order_index, is_active, bucket_slug, company_id)
SELECT 'Hoàn thành', '#16a34a', '✅', 5, true, 'completed', NULL
WHERE NOT EXISTS (
  SELECT 1 FROM logistics_pipeline_stages
  WHERE company_id IS NULL AND bucket_slug = 'completed'
);

UPDATE logistics_pipeline_stages
SET order_index = 5, is_active = true, bucket_slug = COALESCE(bucket_slug, 'completed')
WHERE company_id IS NULL AND name = 'Hoàn thành';

-- Tắt bộ mẫu cũ (13 bước + bộ 6 bước)
UPDATE workshop_task_templates
SET is_active = false, is_default = false
WHERE workshop_area = 'logistics'
  AND company_id = '29677f68-967e-4256-92fd-492bb580e888'
  AND name IN (
    'Quy trình VC/LĐ Phúc Đạt — Giao hàng & bàn giao',
    'Bộ mẫu Vận chuyển & Lắp đặt — Phúc Đạt'
  );

INSERT INTO workshop_task_templates (name, workshop_area, description, company_id, is_active, is_default, order_index)
SELECT
  'Quy trình VC/LĐ Phúc Đạt — Đơn giản',
  'logistics',
  'Bộ vận chuyển (4 bước) + bộ lắp đặt (3 bước) cho Phúc Đạt.',
  '29677f68-967e-4256-92fd-492bb580e888',
  true,
  true,
  1
WHERE NOT EXISTS (
  SELECT 1 FROM workshop_task_templates
  WHERE workshop_area = 'logistics'
    AND company_id = '29677f68-967e-4256-92fd-492bb580e888'
    AND name = 'Quy trình VC/LĐ Phúc Đạt — Đơn giản'
);

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
  (
    'Quy trình VC/LĐ Phúc Đạt — Đơn giản',
    'Kiểm tra đơn hàng',
    'Đối chiếu mã dự án, packing list và số kiện trước khi lập lệnh giao.',
    'high', 0, 1,
    '[{"text":"Đối chiếu mã dự án / mã đơn trên phiếu và thùng hàng"},{"text":"Xác nhận tổng số kiện và phụ kiện đi kèm"},{"text":"Ghi nhận hạng mục thiếu / cần bổ sung (nếu có)"}]',
    false
  ),
  (
    'Quy trình VC/LĐ Phúc Đạt — Đơn giản',
    'Xác nhận nhận hàng',
    'Xác nhận đã nhận đủ hàng tại kho / trước khi xuất đi giao.',
    'high', 0, 2,
    '[{"text":"Kiểm đếm kiện thực tế so với packing list"},{"text":"Chụp ảnh tổng quan hàng trước xuất kho"},{"text":"Ký / tick xác nhận đã nhận đủ hàng"}]',
    true
  ),
  (
    'Quy trình VC/LĐ Phúc Đạt — Đơn giản',
    'Kiểm tra sau vận chuyển',
    'Kiểm tra tình trạng hàng sau khi vận chuyển đến công trình.',
    'high', 1, 3,
    '[{"text":"Kiểm tra kiện hàng có va quệt / hư hỏng trên đường"},{"text":"Đối chiếu số kiện đến công trình"},{"text":"Chụp ảnh hiện trường sau vận chuyển"}]',
    false
  ),
  (
    'Quy trình VC/LĐ Phúc Đạt — Đơn giản',
    'Xác nhận đã vận chuyển',
    'Biên bản giao hàng tại công trình (POD).',
    'high', 1, 4,
    '[{"text":"Khách ký biên bản giao hàng hoặc OTP xác nhận"},{"text":"Chụp ảnh proof of delivery (POD)"},{"text":"Ghi nhận khu vực tập kết hàng trên công trình"}]',
    true
  ),
  (
    'Quy trình VC/LĐ Phúc Đạt — Đơn giản',
    'Kiểm tra nhận hàng',
    'Kiểm tra hàng và mặt bằng trước khi bắt đầu lắp đặt.',
    'high', 0, 5,
    '[{"text":"Kiểm tra kiện / phụ kiện trước lắp"},{"text":"Kiểm tra mặt bằng trống, sạch, đủ điều kiện thi công"},{"text":"Đo lại kích thước thực tế so với bản vẽ"}]',
    false
  ),
  (
    'Quy trình VC/LĐ Phúc Đạt — Đơn giản',
    'Quá trình lắp đặt',
    'Thi công lắp đặt theo bản vẽ tại công trình.',
    'high', 2, 6,
    '[{"text":"Lắp theo bản vẽ hiện trường đã duyệt"},{"text":"Ghi nhận phát sinh / sai lệch (nếu có)"},{"text":"Thu gom rác thi công, giữ vệ sinh công trình"}]',
    false
  ),
  (
    'Quy trình VC/LĐ Phúc Đạt — Đơn giản',
    'Nghiệm thu',
    'Nghiệm thu và bàn giao với khách.',
    'high', 1, 7,
    '[{"text":"Khách kiểm tra và ký biên bản nghiệm thu"},{"text":"Ghi rõ hạng mục tồn / hẹn xử lý (nếu có)"},{"text":"Chụp ảnh công trình hoàn thiện"}]',
    true
  )
) AS v(tpl_name, title, description, priority, deadline_days, order_index, checklist, blocks_stage_advance)
WHERE t.name = v.tpl_name
  AND t.company_id = '29677f68-967e-4256-92fd-492bb580e888'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_task_template_items i
    WHERE i.template_id = t.id AND i.title = v.title
  );

COMMIT;
