-- 415: Cài đặt bàn giao SX → VC/LĐ + Nguyễn Ngọc Linh admin VC/LĐ (Phúc Đạt)
-- Chạy sau 414_phuc_dat_logistics_ngoc_linh.sql

BEGIN;

CREATE TABLE IF NOT EXISTS logistics_handover_settings (
  logistics_company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  responsible_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  installer_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE logistics_handover_settings IS
  'Khi deal bàn giao sang VC/LĐ: người phụ trách vận chuyển + lắp đặt mặc định theo công ty VC';
COMMENT ON COLUMN logistics_handover_settings.responsible_user_id IS
  'Người chịu trách nhiệm VC — đồng bộ logistics_person_id khi bàn giao';
COMMENT ON COLUMN logistics_handover_settings.installer_user_id IS
  'Người lắp đặt mặc định — đồng bộ installer_person_id khi bàn giao';

UPDATE users SET
  role = 'logistics_admin',
  updated_at = NOW()
WHERE id = '5e07fb3b-3286-4ca3-a167-4edef16f3866';

DELETE FROM user_roles ur
USING roles r, users u
WHERE ur.role_id = r.id
  AND ur.user_id = u.id
  AND u.id = '5e07fb3b-3286-4ca3-a167-4edef16f3866'
  AND r.name IN ('installer', 'logistics', 'staff');

INSERT INTO user_roles (user_id, role_id, ecosystem_unit_id, granted_at)
SELECT u.id, r.id, NULL, NOW()
FROM users u
CROSS JOIN roles r
WHERE u.id = '5e07fb3b-3286-4ca3-a167-4edef16f3866'
  AND r.name = 'logistics_admin'
  AND NOT EXISTS (
    SELECT 1 FROM user_roles ur2
    WHERE ur2.user_id = u.id AND ur2.role_id = r.id AND ur2.ecosystem_unit_id IS NULL
  );

INSERT INTO logistics_handover_settings (logistics_company_id, responsible_user_id, installer_user_id, updated_at)
VALUES (
  '29677f68-967e-4256-92fd-492bb580e888',
  '5e07fb3b-3286-4ca3-a167-4edef16f3866',
  '5e07fb3b-3286-4ca3-a167-4edef16f3866',
  NOW()
)
ON CONFLICT (logistics_company_id) DO UPDATE SET
  responsible_user_id = EXCLUDED.responsible_user_id,
  installer_user_id = EXCLUDED.installer_user_id,
  updated_at = NOW();

-- Bộ mẫu VC/LĐ riêng cho Phúc Đạt (fallback global vẫn dùng được nếu chưa có)
INSERT INTO workshop_task_templates (name, workshop_area, description, company_id, is_active, order_index)
SELECT
  'Bộ mẫu Vận chuyển & Lắp đặt — Phúc Đạt',
  'logistics',
  'Quy trình VC/LĐ công ty Nhôm Kính Phúc Đạt',
  '29677f68-967e-4256-92fd-492bb580e888',
  true,
  1
WHERE NOT EXISTS (
  SELECT 1 FROM workshop_task_templates
  WHERE workshop_area = 'logistics'
    AND company_id = '29677f68-967e-4256-92fd-492bb580e888'
    AND name = 'Bộ mẫu Vận chuyển & Lắp đặt — Phúc Đạt'
);

INSERT INTO workshop_task_template_items (template_id, title, description, priority, deadline_days, order_index, default_assignee_id)
SELECT t.id, v.title, v.description, v.priority, v.deadline_days, v.order_index, '5e07fb3b-3286-4ca3-a167-4edef16f3866'::uuid
FROM workshop_task_templates t,
(VALUES
  ('Bộ mẫu Vận chuyển & Lắp đặt — Phúc Đạt', 'Xác nhận lịch giao / lắp với khách', 'Địa chỉ, giờ làm việc, thang máy / chỗ đỗ xe', 'high', 0, 1),
  ('Bộ mẫu Vận chuyển & Lắp đặt — Phúc Đạt', 'Kiểm tra đủ kiện & biên bản xuất kho', 'Đối chiếu packing list với thực tế', 'high', 1, 2),
  ('Bộ mẫu Vận chuyển & Lắp đặt — Phúc Đạt', 'Vận chuyển an toàn tới công trình', 'Bảo vệ góc cạnh, chống trầy', 'high', 2, 3),
  ('Bộ mẫu Vận chuyển & Lắp đặt — Phúc Đạt', 'Lắp đặt theo bản vẽ hiện trường', 'Ghi nhận sai lệch so với khảo sát', 'high', 2, 4),
  ('Bộ mẫu Vận chuyển & Lắp đặt — Phúc Đạt', 'Nghiệm thu với khách', 'Ký biên bản, hẹn xử lý phát sinh', 'high', 1, 5),
  ('Bộ mẫu Vận chuyển & Lắp đặt — Phúc Đạt', 'Bàn giao bảo hành & hướng dẫn sử dụng', 'Giao tài liệu, hotline CSKH', 'medium', 0, 6)
) AS v(tpl_name, title, description, priority, deadline_days, order_index)
WHERE t.name = v.tpl_name
  AND t.company_id = '29677f68-967e-4256-92fd-492bb580e888'
  AND NOT EXISTS (
    SELECT 1 FROM workshop_task_template_items i
    WHERE i.template_id = t.id AND i.title = v.title
  );

COMMIT;
