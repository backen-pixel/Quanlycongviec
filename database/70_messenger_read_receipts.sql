-- ============================================================
-- 70_messenger_read_receipts.sql
-- Theo dõi tin chưa đọc per user per group + preview tin cuối
-- ============================================================

-- Bảng lưu thời điểm user đọc mỗi nhóm lần cuối
CREATE TABLE IF NOT EXISTS messenger_read_receipts (
  group_id   UUID NOT NULL REFERENCES messenger_groups(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_mrr_user ON messenger_read_receipts(user_id);

ALTER TABLE messenger_read_receipts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mrr_all" ON messenger_read_receipts;
CREATE POLICY "mrr_all" ON messenger_read_receipts FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- Thêm cột last_message vào messenger_group_messages (nội dung ngắn cho preview)
-- Không cần thêm cột — chỉ cần đọc từ query.
-- ============================================================

-- Cập nhật RPC: trả thêm last_message + unread_count per user
CREATE OR REPLACE FUNCTION public.messenger_group_list_stats_v2(
  p_group_ids uuid[],
  p_user_id   uuid
)
RETURNS TABLE (
  group_id      uuid,
  message_count bigint,
  last_message_at timestamptz,
  last_message  text,
  unread_count  bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    m.group_id,
    COUNT(*)::bigint                          AS message_count,
    MAX(m.created_at)                         AS last_message_at,
    -- Preview: lấy nội dung tin cuối (max 100 ký tự)
    (
      SELECT COALESCE(LEFT(mm.content, 100), '')
      FROM messenger_group_messages mm
      WHERE mm.group_id = m.group_id
        AND mm.is_system = false
      ORDER BY mm.created_at DESC
      LIMIT 1
    )                                         AS last_message,
    -- Unread: số tin sau lần đọc cuối của user (hoặc toàn bộ nếu chưa đọc lần nào)
    COUNT(*) FILTER (
      WHERE m.created_at > COALESCE(
        (SELECT r.last_read_at FROM messenger_read_receipts r
         WHERE r.group_id = m.group_id AND r.user_id = p_user_id),
        '1970-01-01'::timestamptz
      )
      AND m.user_id <> p_user_id
    )::bigint                                 AS unread_count
  FROM messenger_group_messages m
  WHERE p_group_ids IS NOT NULL
    AND cardinality(p_group_ids) > 0
    AND m.group_id = ANY(p_group_ids)
  GROUP BY m.group_id;
$$;
