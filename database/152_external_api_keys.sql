-- ═══════════════════════════════════════════════════════════════════════════
-- 152: Bảng external_api_keys — lưu API key cho tích hợp ngoài
-- (thay thế file backend/data/api-keys.json — không bền trên Render/Vercel)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS external_api_keys (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        text NOT NULL,
  key                         text NOT NULL UNIQUE,
  active                      boolean NOT NULL DEFAULT true,
  default_assigned_to         uuid REFERENCES users(id) ON DELETE SET NULL,
  company_id                  uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  region_id                   uuid REFERENCES company_regions(id) ON DELETE SET NULL,
  default_source_category_id  uuid,
  default_lead_type_id        uuid REFERENCES crm_lead_types(id) ON DELETE SET NULL,
  default_pipeline_id         uuid REFERENCES crm_pipelines(id) ON DELETE SET NULL,
  webhook_url                 text,
  created_by                  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  rotated_at                  timestamptz,
  rotated_by                  uuid REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_external_api_keys_key      ON external_api_keys(key);
CREATE INDEX IF NOT EXISTS idx_external_api_keys_company  ON external_api_keys(company_id);
CREATE INDEX IF NOT EXISTS idx_external_api_keys_active   ON external_api_keys(active) WHERE active = true;

ALTER TABLE external_api_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "external_api_keys_all" ON external_api_keys;
CREATE POLICY "external_api_keys_all" ON external_api_keys FOR ALL USING (true) WITH CHECK (true);
