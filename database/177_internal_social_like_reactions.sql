-- Cảm xúc trên lượt thích bài bảng tin (giống Facebook: like, love, ...)

ALTER TABLE internal_social_likes
  ADD COLUMN IF NOT EXISTS reaction text NOT NULL DEFAULT 'like';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'internal_social_likes_reaction_chk'
  ) THEN
    ALTER TABLE internal_social_likes
      ADD CONSTRAINT internal_social_likes_reaction_chk
      CHECK (reaction IN ('like', 'love', 'care', 'haha', 'wow', 'sad', 'angry'));
  END IF;
END $$;

COMMENT ON COLUMN internal_social_likes.reaction IS 'Loại cảm xúc người dùng chọn cho bài viết';
