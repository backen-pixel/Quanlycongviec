-- Migration 11: Quản lý phòng ban + Trao đổi phòng ban
-- Chat nội bộ theo phòng ban

-- ═══ THÊM TRƯỜNG CHO departments ═══
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='departments' AND column_name='manager_id') THEN
    ALTER TABLE departments ADD COLUMN manager_id UUID REFERENCES users(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='departments' AND column_name='parent_id') THEN
    ALTER TABLE departments ADD COLUMN parent_id UUID REFERENCES departments(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='departments' AND column_name='is_active') THEN
    ALTER TABLE departments ADD COLUMN is_active BOOLEAN DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='departments' AND column_name='updated_at') THEN
    ALTER TABLE departments ADD COLUMN updated_at TIMESTAMPTZ DEFAULT now();
  END IF;
END $$;

-- ═══ TRAO ĐỔI PHÒNG BAN (Department Messages) ═══
CREATE TABLE IF NOT EXISTS department_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  reply_to_id UUID REFERENCES department_messages(id),
  attachments JSONB DEFAULT '[]',
  is_pinned BOOLEAN DEFAULT false,
  is_edited BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dept_msg_department ON department_messages(department_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dept_msg_sender ON department_messages(sender_id);

-- ═══ ĐÁNH DẤU ĐÃ ĐỌC ═══
CREATE TABLE IF NOT EXISTS department_message_reads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(department_id, user_id)
);
