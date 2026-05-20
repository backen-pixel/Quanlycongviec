-- Bảng tin nội bộ: cho phép chia sẻ một bài tới NHIỀU công ty.
-- Phụ thuộc 175_internal_social_feed.sql, 180_internal_social_schedule_visibility_hide_share.sql,
-- 199_internal_social_last_read.sql.

BEGIN;

-- ─── 1) Cho phép visibility = 'selected_companies' ────────────────────────────
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'internal_social_posts_visibility_chk'
      AND conrelid = 'internal_social_posts'::regclass
  ) THEN
    ALTER TABLE internal_social_posts
      DROP CONSTRAINT internal_social_posts_visibility_chk;
  END IF;
END $$;

ALTER TABLE internal_social_posts
  ADD CONSTRAINT internal_social_posts_visibility_chk
  CHECK (visibility IN ('company', 'selected_users', 'selected_companies'));

COMMENT ON COLUMN internal_social_posts.visibility IS
  'company = cả công ty của tác giả; selected_users = chỉ user trong audience; selected_companies = công ty của tác giả + danh sách công ty trong internal_social_post_companies';

-- ─── 2) Bảng map bài → công ty thêm (chỉ chứa CÔNG TY THÊM, không lặp lại công ty gốc) ─
CREATE TABLE IF NOT EXISTS internal_social_post_companies (
  post_id    uuid NOT NULL REFERENCES internal_social_posts(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_internal_social_post_companies_company
  ON internal_social_post_companies(company_id);

COMMENT ON TABLE internal_social_post_companies IS
  'Bài bảng tin nội bộ được chia sẻ tới các công ty khác ngoài công ty của tác giả';

-- ─── 3) Cập nhật RPC feed: hiển thị bài cho công ty X nếu (a) X là công ty gốc HOẶC (b) X nằm trong map ─
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

COMMENT ON FUNCTION internal_social_feed_posts IS
  'Bài bảng tin nội bộ — lọc lịch/ẩn/phạm vi/ẩn cá nhân; hỗ trợ chia sẻ tới nhiều công ty';

-- ─── 4) Cập nhật RPC đếm chưa đọc (cùng phạm vi như feed) ────────────────────
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
