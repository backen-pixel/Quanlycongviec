-- ═══════════════════════════════════════════════════════════════
-- 22_events.sql — Sự kiện / Feed (giống Bitrix24 Feed)
-- ═══════════════════════════════════════════════════════════════

-- Bảng loại sự kiện (quản lý được)
CREATE TABLE IF NOT EXISTS event_types (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,              -- Tên VN: Khảo sát, Đo đạc, ...
  slug TEXT NOT NULL UNIQUE,       -- site_visit, measurement, ...
  icon TEXT DEFAULT '📋',          -- Emoji icon
  color TEXT DEFAULT '#3B82F6',    -- Màu hiển thị (hex)
  stage_slug TEXT,                 -- Liên kết stage: consulting, design, ...
  description TEXT,
  is_system BOOLEAN DEFAULT FALSE, -- Loại mặc định không xóa được
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed loại sự kiện mặc định
INSERT INTO event_types (name, slug, icon, color, stage_slug, is_system, sort_order) VALUES
  ('Khảo sát',       'site_visit',     '🏠', '#F59E0B', 'consulting',   TRUE, 1),
  ('Đo đạc',         'measurement',    '📏', '#8B5CF6', 'design',       TRUE, 2),
  ('Gặp khách hàng', 'meeting',        '🤝', '#3B82F6', 'consulting',   TRUE, 3),
  ('Tư vấn',         'consultation',   '💬', '#10B981', 'consulting',   TRUE, 4),
  ('Duyệt thiết kế', 'design_review',  '📐', '#EC4899', 'design',       TRUE, 5),
  ('Giao hàng',      'delivery',       '🚚', '#F97316', 'shipping',     TRUE, 6),
  ('Lắp đặt',        'installation',   '🔧', '#EF4444', 'installation', TRUE, 7),
  ('Nghiệm thu',     'inspection',     '🔍', '#06B6D4', 'customer-care',TRUE, 8),
  ('Khác',           'other',          '📋', '#6B7280', NULL,           TRUE, 9),
  ('Đi quay hình',   'video_shoot',    '🎥', '#7C3AED', NULL,           TRUE, 10)
ON CONFLICT (slug) DO NOTHING;

-- Bảng sự kiện chính
CREATE TABLE IF NOT EXISTS crm_events (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Loại & nội dung
  event_type_id UUID REFERENCES event_types(id),
  event_type TEXT NOT NULL DEFAULT 'other',  -- slug fallback
  title TEXT NOT NULL,
  description TEXT,
  location TEXT,
  
  -- Thời gian
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  all_day BOOLEAN DEFAULT FALSE,
  
  -- Trạng thái
  status TEXT DEFAULT 'planned',  -- planned, in_progress, completed, cancelled
  result TEXT,                    -- Kết quả khi hoàn thành
  
  -- Liên kết CRM
  lead_id UUID REFERENCES crm_leads(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  
  -- Người tạo / thực hiện
  created_by UUID REFERENCES users(id),
  assignee_id UUID REFERENCES users(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Người tham gia sự kiện
CREATE TABLE IF NOT EXISTS crm_event_participants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID REFERENCES crm_events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  status TEXT DEFAULT 'pending',  -- pending, confirmed, declined
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);

-- Bình luận sự kiện (Feed comments)
CREATE TABLE IF NOT EXISTS crm_event_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID REFERENCES crm_events(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_crm_events_start ON crm_events(start_time);
CREATE INDEX IF NOT EXISTS idx_crm_events_lead ON crm_events(lead_id);
CREATE INDEX IF NOT EXISTS idx_crm_events_created_by ON crm_events(created_by);
CREATE INDEX IF NOT EXISTS idx_crm_events_status ON crm_events(status);
CREATE INDEX IF NOT EXISTS idx_crm_event_participants_event ON crm_event_participants(event_id);
CREATE INDEX IF NOT EXISTS idx_crm_event_participants_user ON crm_event_participants(user_id);

-- RLS (if needed, enable later)
-- ALTER TABLE crm_events ENABLE ROW LEVEL SECURITY;
