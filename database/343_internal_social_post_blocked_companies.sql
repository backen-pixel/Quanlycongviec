-- Bảng tin nội bộ: chặn công ty không được xem bài (mọi nhân viên trong công ty đó).
-- Phụ thuộc 200_internal_social_post_companies.sql.

BEGIN;

CREATE TABLE IF NOT EXISTS internal_social_post_blocked_companies (
  post_id    uuid NOT NULL REFERENCES internal_social_posts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_internal_social_post_blocked_companies_company
  ON internal_social_post_blocked_companies(company_id);

COMMENT ON TABLE internal_social_post_blocked_companies IS
  'Công ty bị chặn xem bài — nhân viên thuộc công ty này không thấy bài (trừ tác giả)';

-- Cập nhật feed: loại bài nếu công ty viewer nằm trong danh sách chặn (tác giả vẫn thấy)
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
  WHERE (
      p.company_id = p_company_id
      OR (
        p.visibility = 'selected_companies'
        AND EXISTS (
          SELECT 1 FROM internal_social_post_companies pc
          WHERE pc.post_id = p.id AND pc.company_id = p_company_id
        )
      )
    )
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
    AND NOT (
      p.author_id <> p_user_id
      AND EXISTS (
        SELECT 1 FROM internal_social_post_blocked_companies bc
        WHERE bc.post_id = p.id AND bc.company_id = p_company_id
      )
    )
    AND (
      p.visibility IN ('company', 'selected_companies')
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
  WHERE (
      p.company_id = p_company_id
      OR (
        p.visibility = 'selected_companies'
        AND EXISTS (
          SELECT 1 FROM internal_social_post_companies pc
          WHERE pc.post_id = p.id AND pc.company_id = p_company_id
        )
      )
    )
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
    AND NOT (
      p.author_id <> p_user_id
      AND EXISTS (
        SELECT 1 FROM internal_social_post_blocked_companies bc
        WHERE bc.post_id = p.id AND bc.company_id = p_company_id
      )
    )
    AND (
      p.visibility IN ('company', 'selected_companies')
      OR p.author_id = p_user_id
      OR COALESCE(p_can_moderate, false) = true
      OR EXISTS (
        SELECT 1 FROM internal_social_post_audience a
        WHERE a.post_id = p.id AND a.user_id = p_user_id
      )
    );
$$;

COMMIT;
