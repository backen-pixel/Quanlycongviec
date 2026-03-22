-- 28: CRM Tasks — Công việc cho Lead/Deal
-- Chạy trên Supabase SQL Editor

-- Bảng tasks cho CRM lead/deal
CREATE TABLE IF NOT EXISTS crm_tasks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','completed','cancelled')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  stage_slug TEXT, -- consulting, design, quotation, contract
  order_index INT DEFAULT 0,
  assignee_id UUID REFERENCES users(id) ON DELETE SET NULL,
  supervisor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  deadline TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  checklist JSONB DEFAULT '[]', -- [{label, is_completed}]
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crm_tasks_lead ON crm_tasks(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_assignee ON crm_tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_crm_tasks_status ON crm_tasks(status);

-- Bộ nhiệm vụ mẫu CRM
CREATE TABLE IF NOT EXISTS crm_task_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL, -- "Bộ mẫu Tư vấn", "Bộ mẫu Thiết kế"...
  stage_slug TEXT NOT NULL, -- consulting, design, quotation, contract
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  order_index INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chi tiết tasks trong mỗi bộ mẫu
CREATE TABLE IF NOT EXISTS crm_task_template_items (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  template_id UUID NOT NULL REFERENCES crm_task_templates(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'medium',
  deadline_days INT DEFAULT 0, -- số ngày sau khi tạo
  order_index INT DEFAULT 0,
  checklist JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed: Bộ mẫu mặc định cho 4 giai đoạn KD
INSERT INTO crm_task_templates (name, stage_slug, is_default, order_index) VALUES
  ('Bộ mẫu Tư vấn', 'consulting', true, 1),
  ('Bộ mẫu Thiết kế', 'design', true, 2),
  ('Bộ mẫu Báo giá', 'quotation', true, 3),
  ('Bộ mẫu Hợp đồng', 'contract', true, 4)
ON CONFLICT DO NOTHING;

-- Seed tasks cho Tư vấn
INSERT INTO crm_task_template_items (template_id, title, priority, deadline_days, order_index)
SELECT t.id, item.title, item.priority, item.deadline_days, item.order_index
FROM crm_task_templates t,
(VALUES
  ('Tiếp nhận yêu cầu khách hàng', 'high', 0, 1),
  ('Tư vấn sản phẩm & vật liệu', 'high', 1, 2),
  ('Khảo sát thực tế (nếu cần)', 'medium', 2, 3),
  ('Ghi nhận nhu cầu chi tiết', 'medium', 2, 4)
) AS item(title, priority, deadline_days, order_index)
WHERE t.stage_slug = 'consulting' AND t.is_default = true;

-- Seed tasks cho Thiết kế
INSERT INTO crm_task_template_items (template_id, title, priority, deadline_days, order_index)
SELECT t.id, item.title, item.priority, item.deadline_days, item.order_index
FROM crm_task_templates t,
(VALUES
  ('Thiết kế bản vẽ sơ bộ', 'high', 3, 1),
  ('Gửi bản vẽ cho KH duyệt', 'high', 4, 2),
  ('Chỉnh sửa theo feedback KH', 'medium', 5, 3),
  ('Hoàn thiện bản vẽ kỹ thuật', 'high', 7, 4)
) AS item(title, priority, deadline_days, order_index)
WHERE t.stage_slug = 'design' AND t.is_default = true;

-- Seed tasks cho Báo giá
INSERT INTO crm_task_template_items (template_id, title, priority, deadline_days, order_index)
SELECT t.id, item.title, item.priority, item.deadline_days, item.order_index
FROM crm_task_templates t,
(VALUES
  ('Tính toán chi phí vật liệu', 'high', 1, 1),
  ('Lập báo giá chi tiết', 'high', 2, 2),
  ('Gửi báo giá cho KH', 'high', 2, 3),
  ('Thương lượng & chốt giá', 'medium', 5, 4)
) AS item(title, priority, deadline_days, order_index)
WHERE t.stage_slug = 'quotation' AND t.is_default = true;

-- Seed tasks cho Hợp đồng
INSERT INTO crm_task_template_items (template_id, title, priority, deadline_days, order_index)
SELECT t.id, item.title, item.priority, item.deadline_days, item.order_index
FROM crm_task_templates t,
(VALUES
  ('Soạn hợp đồng', 'high', 1, 1),
  ('KH review hợp đồng', 'high', 3, 2),
  ('Ký hợp đồng', 'urgent', 5, 3),
  ('Thu tiền đặt cọc', 'urgent', 5, 4)
) AS item(title, priority, deadline_days, order_index)
WHERE t.stage_slug = 'contract' AND t.is_default = true;
