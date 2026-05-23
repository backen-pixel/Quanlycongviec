-- 223_ai_chat_bot.sql
-- AI Chat Bot: bot user ảo + bảng lịch tự động đẩy tin nhắn vào chat phòng ban / nhóm.
-- Idempotent — an toàn chạy lại.
--
-- Thành phần:
--   1) Cột is_system trên department_messages (nếu chưa có)
--   2) Cột is_bot trên users (nhận diện user kiểu bot)
--   3) Seed bot user cố định (id = 00000000-0000-0000-0000-0000000000a1)
--   4) Bảng ai_chat_bot_schedules: cấu hình từng "lịch đẩy tin AI"
--   5) Bảng ai_chat_bot_runs: log các lần chạy (đếm số lần/ngày, debug)

-- ───────────────────────── 1) department_messages.is_system ─────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'department_messages' AND column_name = 'is_system'
  ) THEN
    ALTER TABLE department_messages ADD COLUMN is_system BOOLEAN DEFAULT false;
  END IF;
END $$;

-- ───────────────────────── 2) users.is_bot ─────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'is_bot'
  ) THEN
    ALTER TABLE users ADD COLUMN is_bot BOOLEAN DEFAULT false;
  END IF;
END $$;

-- ───────────────────────── 3) Seed bot user ─────────────────────────
-- Bot có UUID cố định để code backend dùng làm sender_id không cần lookup.
-- Email random + mật khẩu rỗng → KHÔNG đăng nhập được (auth.js sẽ chặn).
INSERT INTO users (id, full_name, email, password, role, is_active, is_bot)
VALUES (
  '00000000-0000-0000-0000-0000000000a1',
  '🤖 AI Assistant',
  'ai-bot@tubeppro.local',
  '',  -- password trống — bot không đăng nhập
  'staff',
  true,
  true
)
ON CONFLICT (id) DO UPDATE SET
  full_name = EXCLUDED.full_name,
  is_bot = true,
  is_active = true;

-- ───────────────────────── 4) ai_chat_bot_schedules ─────────────────────────
-- Mỗi hàng = 1 "lịch đẩy" gắn vào 1 kênh chat.
CREATE TABLE IF NOT EXISTS ai_chat_bot_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Kênh: 'department' (phòng ban) hoặc 'group' (messenger_group)
  channel_type TEXT NOT NULL CHECK (channel_type IN ('department', 'group')),
  channel_id   UUID NOT NULL,           -- departments.id hoặc messenger_groups.id

  -- Loại nội dung AI sinh:
  --   'daily_brief'    — tóm tắt việc cần làm hôm nay cho phòng ban
  --   'overdue'        — danh sách task/lead quá hạn
  --   'kpi'            — tình hình KPI tháng
  --   'custom'         — chạy theo custom_prompt
  prompt_kind  TEXT NOT NULL DEFAULT 'daily_brief'
    CHECK (prompt_kind IN ('daily_brief', 'overdue', 'kpi', 'custom')),
  custom_prompt TEXT,                   -- prompt cho prompt_kind = 'custom'

  -- Tên hiển thị + ghi chú (admin tự đặt)
  title TEXT NOT NULL,
  note  TEXT,

  -- Lịch chạy (giờ Việt Nam):
  --   run_slots: mảng JSON [{"h":8,"m":0}, {"h":13,"m":30}]
  --   max_runs_per_day: chốt cứng số lần tối đa/ngày (kể cả nếu admin set nhiều slot hơn)
  --   weekdays: mảng [1..7], 1=T2, 7=CN (NULL = mọi ngày)
  run_slots JSONB NOT NULL DEFAULT '[{"h":8,"m":0}]',
  max_runs_per_day INT NOT NULL DEFAULT 2,
  weekdays INT[] DEFAULT NULL,

  enabled BOOLEAN NOT NULL DEFAULT true,

  -- Đếm/lưu lần chạy gần nhất (UTC)
  last_run_at TIMESTAMPTZ,
  last_run_status TEXT,                 -- 'ok' | 'error' | 'skipped'
  last_run_message TEXT,                -- preview nội dung gửi gần nhất

  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_bot_sched_enabled ON ai_chat_bot_schedules(enabled);
CREATE INDEX IF NOT EXISTS idx_ai_bot_sched_channel ON ai_chat_bot_schedules(channel_type, channel_id);

-- ───────────────────────── 5) ai_chat_bot_runs ─────────────────────────
-- Log từng lần bot bắn tin — dùng để đếm "đã chạy X lần trong ngày VN"
-- và để admin xem lịch sử trên UI.
CREATE TABLE IF NOT EXISTS ai_chat_bot_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  schedule_id UUID NOT NULL REFERENCES ai_chat_bot_schedules(id) ON DELETE CASCADE,

  -- Ngày VN (YYYY-MM-DD) — dùng để COUNT * WHERE vn_date = today
  vn_date DATE NOT NULL,
  slot_label TEXT,                      -- "08:00", "manual", "13:30"…

  status TEXT NOT NULL,                 -- 'ok' | 'error' | 'skipped'
  message_preview TEXT,
  error_text TEXT,
  message_id UUID,                      -- id tin nhắn vừa insert (department_messages | messenger_group_messages)
  triggered_by UUID REFERENCES users(id) ON DELETE SET NULL,  -- NULL = cron tự động
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_bot_runs_sched_date ON ai_chat_bot_runs(schedule_id, vn_date);
CREATE INDEX IF NOT EXISTS idx_ai_bot_runs_created ON ai_chat_bot_runs(created_at DESC);

-- RLS — ở repo này phần lớn dùng service-key bypass; mở policy ALL để không vướng:
ALTER TABLE ai_chat_bot_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_chat_bot_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_chat_bot_schedules_all" ON ai_chat_bot_schedules;
CREATE POLICY "ai_chat_bot_schedules_all" ON ai_chat_bot_schedules FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "ai_chat_bot_runs_all" ON ai_chat_bot_runs;
CREATE POLICY "ai_chat_bot_runs_all" ON ai_chat_bot_runs FOR ALL USING (true) WITH CHECK (true);
