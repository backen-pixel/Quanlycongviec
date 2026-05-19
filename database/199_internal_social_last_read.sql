-- Theo dõi lần cuối user xem bảng tin nội bộ (theo công ty) — badge tin mới trên sidebar.

CREATE TABLE IF NOT EXISTS internal_social_last_read (
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id    uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  last_read_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_internal_social_last_read_user
  ON internal_social_last_read(user_id);

COMMENT ON TABLE internal_social_last_read IS 'Mốc đã đọc bảng tin nội bộ — dùng đếm bài mới trên sidebar';

-- Đếm bài mới (cùng bộ lọc với internal_social_feed_posts), không tính bài của chính user.
CREATE OR REPLACE FUNCTION internal_social_unread_count(
  p_company_id uuid,
  p_user_id uuid,
  p_can_moderate boolean,
  p_since timestamptz
)
RETURNS bigint
LANGUAGE sql
STABLE
AS $$
  SELECT COUNT(*)::bigint
  FROM internal_social_posts p
  WHERE p.company_id = p_company_id
    AND p.deleted_at IS NULL
    AND p.author_id <> p_user_id
    AND GREATEST(p.created_at, COALESCE(p.published_at, p.created_at)) > p_since
    AND (
      p.hidden_at IS NULL
      OR p.author_id = p_user_id
      OR COALESCE(p_can_moderate, false) = true
    )
    AND (p.published_at <= now() OR p.author_id = p_user_id OR COALESCE(p_can_moderate, false) = true)
    AND NOT EXISTS (
      SELECT 1 FROM internal_social_post_user_hides h
      WHERE h.post_id = p.id AND h.user_id = p_user_id
    )
    AND (
      p.visibility = 'company'
      OR p.author_id = p_user_id
      OR COALESCE(p_can_moderate, false) = true
      OR EXISTS (
        SELECT 1 FROM internal_social_post_audience a
        WHERE a.post_id = p.id AND a.user_id = p_user_id
      )
    );
$$;

COMMENT ON FUNCTION internal_social_unread_count IS 'Số bài bảng tin nội bộ mới kể từ p_since';
