-- Bình luận bảng tin: trả lời (parent_id) + cảm xúc / user (internal_social_comment_reactions)
-- Idempotent.

BEGIN;

ALTER TABLE internal_social_comments
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES internal_social_comments(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_internal_social_comments_post_parent
  ON internal_social_comments (post_id, parent_id, created_at);

CREATE TABLE IF NOT EXISTS internal_social_comment_reactions (
  comment_id uuid NOT NULL REFERENCES internal_social_comments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction text NOT NULL DEFAULT 'like',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (comment_id, user_id),
  CONSTRAINT internal_social_comment_reactions_reaction_chk
    CHECK (reaction IN ('like', 'love', 'care', 'haha', 'wow', 'sad', 'angry'))
);

CREATE INDEX IF NOT EXISTS idx_internal_social_comment_reactions_comment
  ON internal_social_comment_reactions (comment_id);

COMMENT ON COLUMN internal_social_comments.parent_id IS 'NULL = bình luận gốc; khác NULL = trả lời comment id=parent_id (cùng post)';
COMMENT ON TABLE internal_social_comment_reactions IS 'Cảm xúc trên bình luận bảng tin nội bộ (1 loại / user / comment)';

COMMIT;
