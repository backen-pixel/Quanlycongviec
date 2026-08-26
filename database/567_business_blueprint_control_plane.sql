-- ============================================================
-- 567: Business Blueprint Control Plane
-- Bộ mẫu có phiên bản để nhân bản cấu hình vận hành cho tenant.
-- Chỉ nhân bản cấu hình; tuyệt đối không sao chép dữ liệu giao dịch.
-- ============================================================

CREATE TABLE IF NOT EXISTS business_blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_key VARCHAR(120) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  industry VARCHAR(120) NOT NULL DEFAULT 'general',
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  published_version_id UUID,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS business_blueprint_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id UUID NOT NULL REFERENCES business_blueprints(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL CHECK (version_number > 0),
  status VARCHAR(30) NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'retired')),
  definition JSONB NOT NULL DEFAULT '{}'::jsonb,
  release_notes TEXT,
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (blueprint_id, version_number)
);

DO $$ BEGIN
  ALTER TABLE business_blueprints
    ADD CONSTRAINT business_blueprints_published_version_fk
    FOREIGN KEY (published_version_id)
    REFERENCES business_blueprint_versions(id)
    ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS tenant_blueprint_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  blueprint_id UUID NOT NULL REFERENCES business_blueprints(id) ON DELETE RESTRICT,
  blueprint_version_id UUID NOT NULL REFERENCES business_blueprint_versions(id) ON DELETE RESTRICT,
  status VARCHAR(30) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'applying', 'active', 'failed')),
  configuration JSONB NOT NULL DEFAULT '{}'::jsonb,
  applied_by UUID REFERENCES users(id) ON DELETE SET NULL,
  applied_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, blueprint_id)
);

CREATE INDEX IF NOT EXISTS idx_business_blueprint_versions_status
  ON business_blueprint_versions(blueprint_id, status, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_blueprint_installations_tenant
  ON tenant_blueprint_installations(tenant_id, status);

ALTER TABLE business_blueprints ENABLE ROW LEVEL SECURITY;
ALTER TABLE business_blueprint_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_blueprint_installations ENABLE ROW LEVEL SECURITY;

-- Control plane chỉ được truy cập qua backend dùng service_role. Không cho
-- anon/authenticated đọc chéo Blueprint installation giữa các tenant.
DROP POLICY IF EXISTS "service_all_business_blueprints" ON business_blueprints;
CREATE POLICY "service_all_business_blueprints"
  ON business_blueprints FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_all_business_blueprint_versions" ON business_blueprint_versions;
CREATE POLICY "service_all_business_blueprint_versions"
  ON business_blueprint_versions FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "service_all_tenant_blueprint_installations" ON tenant_blueprint_installations;
CREATE POLICY "service_all_tenant_blueprint_installations"
  ON tenant_blueprint_installations FOR ALL TO service_role USING (true) WITH CHECK (true);

REVOKE ALL ON business_blueprints FROM anon, authenticated;
REVOKE ALL ON business_blueprint_versions FROM anon, authenticated;
REVOKE ALL ON tenant_blueprint_installations FROM anon, authenticated;
GRANT ALL ON business_blueprints TO service_role;
GRANT ALL ON business_blueprint_versions TO service_role;
GRANT ALL ON tenant_blueprint_installations TO service_role;

-- Bộ mẫu đầu tiên: doanh nghiệp tủ bếp / nội thất theo đơn hàng.
INSERT INTO business_blueprints (
  blueprint_key,
  name,
  industry,
  description,
  is_active
)
VALUES (
  'cabinet-business-os',
  'Business OS ngành Tủ bếp & Nội thất',
  'cabinet_manufacturing',
  'Lead → Deal → Khảo sát → Thiết kế → Báo giá → Đơn hàng → Sản xuất → Lắp đặt → Bảo hành',
  true
)
ON CONFLICT (blueprint_key) DO UPDATE SET
  name = EXCLUDED.name,
  industry = EXCLUDED.industry,
  description = EXCLUDED.description,
  is_active = true,
  updated_at = now();

INSERT INTO business_blueprint_versions (
  blueprint_id,
  version_number,
  status,
  definition,
  release_notes,
  published_at
)
SELECT
  b.id,
  1,
  'published',
  jsonb_build_object(
    'schema_version', 1,
    'modules', jsonb_build_array(
      jsonb_build_object('key', 'business_os', 'enabled', true),
      jsonb_build_object('key', 'crm', 'enabled', true),
      jsonb_build_object('key', 'tasks', 'enabled', true),
      jsonb_build_object('key', 'projects', 'enabled', true),
      jsonb_build_object('key', 'production', 'enabled', true),
      jsonb_build_object('key', 'logistics', 'enabled', true),
      jsonb_build_object('key', 'procurement', 'enabled', true),
      jsonb_build_object('key', 'customers', 'enabled', true),
      jsonb_build_object('key', 'accounting', 'enabled', true),
      jsonb_build_object('key', 'drive', 'enabled', true),
      jsonb_build_object('key', 'knowledge', 'enabled', true),
      jsonb_build_object('key', 'ai_assistant', 'enabled', true)
    ),
    'department_templates', jsonb_build_array(
      'sales', 'design', 'production', 'delivery', 'customer-care', 'accounting'
    ),
    'processes', jsonb_build_array(
      jsonb_build_object(
        'key', 'sales_lifecycle_v1',
        'name', 'Vòng đời kinh doanh',
        'stages', jsonb_build_array(
          'lead', 'qualification', 'deal', 'survey', 'design',
          'quotation', 'negotiation', 'order'
        )
      ),
      jsonb_build_object(
        'key', 'order_delivery_v1',
        'name', 'Thực hiện đơn hàng',
        'stages', jsonb_build_array(
          'project', 'production', 'quality_control', 'delivery',
          'installation', 'handover', 'warranty'
        )
      )
    ),
    'operating_kernel', jsonb_build_object(
      'record', true,
      'task', true,
      'sla', true,
      'kpi', true,
      'automation', true,
      'audit', true,
      'ai_requires_permission', true
    )
  ),
  'Phiên bản nền móng cho hệ sinh thái doanh nghiệp tủ bếp.',
  now()
FROM business_blueprints b
WHERE b.blueprint_key = 'cabinet-business-os'
ON CONFLICT (blueprint_id, version_number) DO UPDATE SET
  status = 'published',
  definition = EXCLUDED.definition,
  release_notes = EXCLUDED.release_notes,
  published_at = COALESCE(business_blueprint_versions.published_at, now()),
  updated_at = now();

UPDATE business_blueprints b
SET published_version_id = v.id, updated_at = now()
FROM business_blueprint_versions v
WHERE v.blueprint_id = b.id
  AND b.blueprint_key = 'cabinet-business-os'
  AND v.version_number = 1;

-- Phát hành phiên bản theo một giao dịch: mỗi Blueprint chỉ có một bản published.
CREATE OR REPLACE FUNCTION publish_business_blueprint_version(
  p_blueprint_id UUID,
  p_version_id UUID
)
RETURNS business_blueprint_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_version business_blueprint_versions;
BEGIN
  SELECT * INTO target_version
  FROM business_blueprint_versions
  WHERE id = p_version_id
    AND blueprint_id = p_blueprint_id
  FOR UPDATE;

  IF target_version.id IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy phiên bản thuộc Blueprint';
  END IF;

  UPDATE business_blueprint_versions
  SET status = 'retired', updated_at = now()
  WHERE blueprint_id = p_blueprint_id
    AND status = 'published'
    AND id <> p_version_id;

  UPDATE business_blueprint_versions
  SET status = 'published',
      published_at = COALESCE(published_at, now()),
      updated_at = now()
  WHERE id = p_version_id
  RETURNING * INTO target_version;

  UPDATE business_blueprints
  SET published_version_id = p_version_id,
      updated_at = now()
  WHERE id = p_blueprint_id;

  RETURN target_version;
END;
$$;

REVOKE ALL ON FUNCTION publish_business_blueprint_version(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION publish_business_blueprint_version(UUID, UUID) TO service_role;
