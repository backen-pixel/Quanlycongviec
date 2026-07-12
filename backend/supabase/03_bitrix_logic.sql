-- TuBep Pro - Migration 03: Bitrix24 Logic
-- Thêm vai trò Bitrix24, checklist, time tracking, comments

-- 1. Task roles: observer, participant (Bitrix24 4 vai trò)
CREATE TABLE IF NOT EXISTS task_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'participant', -- 'participant' | 'observer'
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(task_id, user_id)
);

-- 2. Checklists
CREATE TABLE IF NOT EXISTS task_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  title VARCHAR(500) NOT NULL,
  is_completed BOOLEAN DEFAULT false,
  completed_by UUID REFERENCES users(id),
  completed_at TIMESTAMPTZ,
  order_index INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Comments
CREATE TABLE IF NOT EXISTS task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Time tracking
CREATE TABLE IF NOT EXISTS task_time_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID REFERENCES tasks(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_minutes INT, -- tự tính hoặc nhập tay
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Project comments
CREATE TABLE IF NOT EXISTS project_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Thêm cột mới cho tasks
DO $$ BEGIN
  -- Người tạo/giao việc đã có: created_by_id
  -- Thêm deferred status
  ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'pending' BEFORE 'todo';
  ALTER TYPE task_status ADD VALUE IF NOT EXISTS 'deferred' AFTER 'blocked';
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_task_participants_task ON task_participants(task_id);
CREATE INDEX IF NOT EXISTS idx_task_checklists_task ON task_checklists(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_time_logs_task ON task_time_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_project_comments_project ON project_comments(project_id);

-- RLS
ALTER TABLE task_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_checklists ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_time_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow_all" ON task_participants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON task_checklists FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON task_comments FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON task_time_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON project_comments FOR ALL USING (true) WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE task_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE task_checklists;
