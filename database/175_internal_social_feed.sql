-- Bảng tin nội bộ (MVP): bài viết, thích, bình luận — phạm vi theo company_id.

CREATE TABLE IF NOT EXISTS internal_social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  link_url text,
  link_title text,
  image_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT internal_social_posts_body_len CHECK (char_length(body) <= 8000)
);

CREATE INDEX IF NOT EXISTS idx_internal_social_posts_company_created
  ON internal_social_posts(company_id, created_at DESC)
  WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS internal_social_likes (
  post_id uuid NOT NULL REFERENCES internal_social_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_internal_social_likes_user ON internal_social_likes(user_id);

CREATE TABLE IF NOT EXISTS internal_social_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES internal_social_posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT internal_social_comments_body_len CHECK (char_length(body) <= 4000)
);

CREATE INDEX IF NOT EXISTS idx_internal_social_comments_post ON internal_social_comments(post_id, created_at);

COMMENT ON TABLE internal_social_posts IS 'Bảng tin nội bộ — bài đăng theo công ty';
COMMENT ON TABLE internal_social_likes IS 'Thích bài trên bảng tin nội bộ';
COMMENT ON TABLE internal_social_comments IS 'Bình luận bài trên bảng tin nội bộ';
