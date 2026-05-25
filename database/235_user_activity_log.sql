-- 235_user_activity_log.sql
-- Ghi nhận hành vi UI của user để AI Chat Bot "học" cách giao tiếp:
--   • User vào trang nào, lọc gì, click gì, search gì
--   • Phân loại theo action_type chuẩn (taxonomy) để AI rút insight
--   • Có entity_type + entity_id để cross-reference với CRM data
--
-- Đặt riêng KHÔNG dùng activity_logs cũ vì:
--   • activity_logs cũ chuyên cho project audit (server-side write)
--   • Bảng này client-side write (insert qua /api/user-activity)
--
-- Idempotent — safe chạy lại.

BEGIN;

CREATE TABLE IF NOT EXISTS user_activity_log (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id    TEXT,                       -- nhóm các action trong 1 phiên (sinh từ client)

  -- TAXONOMY: phân loại hành vi để AI hiểu
  action_type   TEXT NOT NULL,              -- 'view' | 'filter' | 'search' | 'sort' | 'navigate'
                                            -- 'click' | 'create' | 'update' | 'delete'
                                            -- 'export' | 'open_modal' | 'submit_form'
                                            -- 'chat_open' | 'chat_send'
  module        TEXT,                       -- 'crm' | 'tasks' | 'projects' | 'kpi' | 'reports' | 'messenger' | 'admin' | ...
  feature       TEXT,                       -- 'leads_list' | 'lead_detail' | 'deal_pipeline' | ... (con của module)

  -- ĐỐI TƯỢNG tác động (optional)
  entity_type   TEXT,                       -- 'lead' | 'deal' | 'task' | 'company' | 'user' | 'report' | ...
  entity_id     UUID,                       -- id đối tượng (nếu có)

  -- ĐƯỜNG DẪN UI
  path          TEXT,                       -- vd: /crm/leads
  query         JSONB,                      -- query params + filter state (jsonb để search được)
  referrer_path TEXT,                       -- trang trước đó

  -- NHÃN HIỂN THỊ (giúp AI đọc cho dễ, không cần map từ slug)
  label         TEXT,                       -- vd: "Xem danh sách Lead · Cty Phúc Đạt · 7 ngày qua"

  -- METADATA mở rộng
  metadata      JSONB,                      -- mọi thứ khác (vd: ms_spent, click target, ...)

  -- ĐỘ QUAN TRỌNG (để AI lọc khi học)
  importance    SMALLINT NOT NULL DEFAULT 1 CHECK (importance BETWEEN 0 AND 3),
                                            -- 0: noise (view list thuần)
                                            -- 1: bình thường (filter, click)
                                            -- 2: quan trọng (create/update/delete, export)
                                            -- 3: critical (xoá, đổi cấu hình lớn)

  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- INDEX cho AI query nhanh
CREATE INDEX IF NOT EXISTS idx_user_activity_user_time
  ON user_activity_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_activity_module_time
  ON user_activity_log (module, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_activity_action_time
  ON user_activity_log (action_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_activity_entity
  ON user_activity_log (entity_type, entity_id)
  WHERE entity_id IS NOT NULL;

-- GIN cho jsonb query (filter / metadata)
CREATE INDEX IF NOT EXISTS idx_user_activity_query_gin
  ON user_activity_log USING GIN (query);

-- Auto-prune log cũ > 90 ngày (chạy ngoài giờ qua cron / pg_cron)
-- Tham khảo: DELETE FROM user_activity_log WHERE created_at < now() - interval '90 days';

COMMENT ON TABLE user_activity_log IS
  'Log hành vi UI user (page view, filter, click, CRUD). AI Chat Bot đọc để hiểu thói quen / câu hỏi sếp đang quan tâm.';

COMMENT ON COLUMN user_activity_log.action_type IS
  'Phân loại hành vi: view, filter, search, sort, navigate, click, create, update, delete, export, open_modal, submit_form, chat_open, chat_send';

COMMENT ON COLUMN user_activity_log.label IS
  'Mô tả human-readable cho AI đọc trực tiếp, vd: "Lọc Lead · Cty Phúc Đạt · NV Nhiên · tháng 5"';

COMMENT ON COLUMN user_activity_log.importance IS
  '0=noise, 1=normal, 2=important (CRUD/export), 3=critical (delete/config). AI mặc định lọc >=1.';

ALTER TABLE user_activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_activity_log_all ON user_activity_log;
CREATE POLICY user_activity_log_all ON user_activity_log FOR ALL USING (true) WITH CHECK (true);

COMMIT;
