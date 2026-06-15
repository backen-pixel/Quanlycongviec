-- 346_drive_files.sql
-- Module Drive: metadata file mirror từ Google Drive.
-- File luôn nằm trong root; folder_id NULL = nằm ngay dưới root.
-- Idempotent.

BEGIN;

-- pg_trgm để search ILIKE nhanh. Đặt trước khi tạo index trgm bên dưới.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS drive_files (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  root_id             UUID NOT NULL REFERENCES drive_roots(id) ON DELETE CASCADE,
  folder_id           UUID REFERENCES drive_folders(id) ON DELETE SET NULL,
  name                TEXT NOT NULL,
  mime_type           VARCHAR(200),
  size_bytes          BIGINT NOT NULL DEFAULT 0,
  google_file_id      TEXT NOT NULL UNIQUE,
  -- Link xem trên Google Drive (webViewLink) và thumbnail (cache 1h).
  google_view_url     TEXT,
  thumbnail_url       TEXT,
  md5                 VARCHAR(64),
  -- Version increment mỗi lần file thay đổi (rename/upload mới đè).
  version             INTEGER NOT NULL DEFAULT 1,
  uploaded_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  trashed_at          TIMESTAMPTZ,
  trashed_by          UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_drive_files_root_folder
  ON drive_files(root_id, folder_id) WHERE trashed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_drive_files_folder
  ON drive_files(folder_id) WHERE trashed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_drive_files_uploader
  ON drive_files(uploaded_by) WHERE trashed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_drive_files_trashed
  ON drive_files(root_id, trashed_at) WHERE trashed_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_drive_files_mime
  ON drive_files(mime_type) WHERE trashed_at IS NULL;

-- Index trigram cho ILIKE search. Tạo bằng DO block để gracefully bỏ qua
-- nếu môi trường không có quyền cài pg_trgm.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_opclass WHERE opcname = 'gin_trgm_ops') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_drive_files_name_trgm
             ON drive_files USING gin (name gin_trgm_ops)';
  ELSE
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_drive_files_name
             ON drive_files (lower(name))';
  END IF;
END $$;

COMMENT ON TABLE drive_files IS
  'Module Drive: metadata file mirror từ Google Drive (file thật lưu trên GDrive qua service account).';

COMMIT;
