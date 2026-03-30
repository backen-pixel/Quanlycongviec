-- ═══════════════════════════════════════════════════════════════
-- 23_release_notes.sql — Thông báo cập nhật (Release Notes)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS release_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  version TEXT,                       -- VD: "1.5.0", "2026-03-30"
  title TEXT NOT NULL,                -- Tiêu đề: "Cập nhật tháng 3"
  content TEXT NOT NULL,              -- Nội dung markdown
  category TEXT DEFAULT 'feature',    -- feature, improvement, bugfix, announcement
  is_published BOOLEAN DEFAULT FALSE, -- Chỉ hiện khi published
  is_pinned BOOLEAN DEFAULT FALSE,    -- Ghim lên đầu
  created_by UUID REFERENCES users(id),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ai đã đọc thông báo nào
CREATE TABLE IF NOT EXISTS release_note_reads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  release_note_id UUID REFERENCES release_notes(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  read_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(release_note_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_release_notes_published ON release_notes(is_published, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_release_note_reads_user ON release_note_reads(user_id);
