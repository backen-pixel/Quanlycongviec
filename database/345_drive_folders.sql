-- 345_drive_folders.sql
-- Module Drive: cây thư mục mirror từ Google Drive. parent_id NULL = nằm ngay dưới root.
-- Idempotent.

BEGIN;

-- pg_trgm để search ILIKE nhanh. Trên Supabase có sẵn, chỉ cần enable.
-- Phải đặt TRƯỚC khi tạo index dùng gin_trgm_ops.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS drive_folders (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  root_id            UUID NOT NULL REFERENCES drive_roots(id) ON DELETE CASCADE,
  parent_id          UUID REFERENCES drive_folders(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  google_folder_id   TEXT NOT NULL UNIQUE,
  created_by         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Soft delete: trashed_at = thời điểm chuyển vào thùng rác (xoá vĩnh viễn = DELETE row).
  trashed_at         TIMESTAMPTZ,
  trashed_by         UUID REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_drive_folders_root_parent
  ON drive_folders(root_id, parent_id) WHERE trashed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_drive_folders_parent
  ON drive_folders(parent_id) WHERE trashed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_drive_folders_trashed
  ON drive_folders(root_id, trashed_at) WHERE trashed_at IS NOT NULL;

-- Index trigram cho ILIKE search. Tạo bằng DO block để gracefully bỏ qua
-- nếu môi trường không có quyền cài pg_trgm (vd. shared DB không phải Supabase).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_opclass WHERE opcname = 'gin_trgm_ops') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_drive_folders_name_trgm
             ON drive_folders USING gin (name gin_trgm_ops)';
  ELSE
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_drive_folders_name
             ON drive_folders (lower(name))';
  END IF;
END $$;

COMMENT ON TABLE drive_folders IS
  'Module Drive: thư mục mirror, đệ quy theo parent_id, soft delete qua trashed_at.';

COMMIT;
