-- File / media đính kèm bài bảng tin nội bộ (URL sau upload Storage).

CREATE TABLE IF NOT EXISTS internal_social_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES internal_social_posts(id) ON DELETE CASCADE,
  file_url text NOT NULL,
  file_name text,
  mime_type text,
  file_size bigint,
  sort_index int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT internal_social_attachments_url_len CHECK (char_length(file_url) <= 2500)
);

CREATE INDEX IF NOT EXISTS idx_internal_social_attachments_post
  ON internal_social_attachments(post_id, sort_index);

COMMENT ON TABLE internal_social_attachments IS 'File/ảnh/video đính kèm bài bảng tin nội bộ';
