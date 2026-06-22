-- Bộ ảnh gửi Messenger Facebook — nguồn từ thư mục Google Drive (Drive module).
CREATE TABLE IF NOT EXISTS facebook_image_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  drive_folder_id UUID NOT NULL REFERENCES drive_folders(id) ON DELETE CASCADE,
  company_id UUID REFERENCES companies(id) ON DELETE SET NULL,
  sort_index INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fb_image_sets_company_sort
  ON facebook_image_sets (company_id, sort_index ASC, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_fb_image_sets_folder
  ON facebook_image_sets (drive_folder_id);

ALTER TABLE facebook_image_sets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_all" ON facebook_image_sets;
CREATE POLICY "service_all" ON facebook_image_sets FOR ALL USING (true) WITH CHECK (true);
