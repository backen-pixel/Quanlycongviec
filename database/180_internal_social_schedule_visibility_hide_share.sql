-- Lên lịch đăng, phạm vi hiển thị (công ty / nhân viên chọn), ẩn bài (toàn công ty / ẩn với tôi)
-- Chạy sau 175–179. Idempotent khi có thể.

-- Cột bài viết
ALTER TABLE internal_social_posts
  ADD COLUMN IF NOT EXISTS published_at timestamptz NOT NULL DEFAULT now();

UPDATE internal_social_posts
SET published_at = created_at
WHERE published_at IS NULL;

ALTER TABLE internal_social_posts
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'company';

ALTER TABLE internal_social_posts
  ADD COLUMN IF NOT EXISTS hidden_at timestamptz;

DO $$
BEGIN
  ALTER TABLE internal_social_posts
    ADD CONSTRAINT internal_social_posts_visibility_chk
    CHECK (visibility IN ('company', 'selected_users'));
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN internal_social_posts.published_at IS 'Thời điểm bài hiển thị trên bảng tin (lên lịch = tương lai)';
COMMENT ON COLUMN internal_social_posts.visibility IS 'company = cả công ty; selected_users = chỉ danh sách audience';
COMMENT ON COLUMN internal_social_posts.hidden_at IS 'Ẩn với cả công ty (tác giả / quản lý); NULL = hiển thị bình thường';

-- Ai được xem bài (khi visibility = selected_users)
CREATE TABLE IF NOT EXISTS internal_social_post_audience (
  post_id uuid NOT NULL REFERENCES internal_social_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_internal_social_post_audience_user
  ON internal_social_post_audience(user_id);

COMMENT ON TABLE internal_social_post_audience IS 'Người được xem bài khi visibility = selected_users (luôn gồm tác giả ở tầng ứng dụng)';

-- Ẩn khỏi dòng thời gian cá nhân (không ảnh hưởng người khác)
CREATE TABLE IF NOT EXISTS internal_social_post_user_hides (
  post_id uuid NOT NULL REFERENCES internal_social_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_internal_social_post_user_hides_user
  ON internal_social_post_user_hides(user_id);

COMMENT ON TABLE internal_social_post_user_hides IS 'Người dùng ẩn bài khỏi bảng tin của chính họ';

CREATE INDEX IF NOT EXISTS idx_internal_social_posts_company_feed
  ON internal_social_posts(company_id, created_at DESC)
  WHERE deleted_at IS NULL AND hidden_at IS NULL;

DROP FUNCTION IF EXISTS internal_social_feed_posts(uuid, uuid, int, int);
DROP FUNCTION IF EXISTS internal_social_feed_posts(uuid, uuid, boolean, int, int);

CREATE OR REPLACE FUNCTION internal_social_feed_posts(
  p_company_id uuid,
  p_user_id uuid,
  p_can_moderate boolean,
  p_limit int,
  p_offset int
)
RETURNS SETOF internal_social_posts
LANGUAGE sql
STABLE
AS $$
  SELECT p.*
  FROM internal_social_posts p
  WHERE p.company_id = p_company_id
    AND p.deleted_at IS NULL
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
    )
  ORDER BY p.created_at DESC
  LIMIT GREATEST(1, LEAST(p_limit, 100))
  OFFSET GREATEST(0, LEAST(p_offset, 5000));
$$;

COMMENT ON FUNCTION internal_social_feed_posts IS 'Bài bảng tin nội bộ sau lọc lịch, ẩn, phạm vi, ẩn cá nhân';
