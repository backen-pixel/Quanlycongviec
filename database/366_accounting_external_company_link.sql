-- 366: Liên kết công ty chủ deal (CRM) + role kế toán + danh mục xưởng ↔ công ty khách
-- Chạy sau 301, 302, 365
--
-- TRƯỚC TIÊN chạy RIÊNG (commit): database/366a_user_role_add_accounting_enum.sql
-- Rồi mới chạy file này. Nếu lỗi 23505 linked_company_id → chạy 366b_fix_external_company_linked_backfill.sql

-- ── 1. FK công ty chủ deal trên crm_leads ──
ALTER TABLE crm_leads
  ADD COLUMN IF NOT EXISTS external_company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

COMMENT ON COLUMN crm_leads.external_company_id IS
  'Công ty chủ deal / đơn vị đặt hàng (VD: VPT) khi SX tại xưởng khác (HCB/Metalla).';

CREATE INDEX IF NOT EXISTS idx_crm_leads_external_company_id
  ON crm_leads(external_company_id)
  WHERE external_company_id IS NOT NULL;

-- ── 2. Liên kết danh mục production_external_companies → companies ──
ALTER TABLE production_external_companies
  ADD COLUMN IF NOT EXISTS linked_company_id UUID REFERENCES companies(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS production_ext_co_linked_uq
  ON production_external_companies (production_company_id, linked_company_id)
  WHERE linked_company_id IS NOT NULL;

COMMENT ON COLUMN production_external_companies.linked_company_id IS
  'Công ty CRM tương ứng (VD: VPT) — thay cho chỉ lưu tên text.';

-- ── 3. Cấu hình xưởng SX ↔ công ty khách được phép đặt hàng ──
CREATE TABLE IF NOT EXISTS production_workshop_client_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  production_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (production_company_id, client_company_id)
);

CREATE INDEX IF NOT EXISTS idx_pwc_client ON production_workshop_client_companies (client_company_id)
  WHERE is_active = true;

COMMENT ON TABLE production_workshop_client_companies IS
  'Xưởng SX (HCB/Metalla) ↔ công ty CRM được chọn làm chủ deal khi tạo đơn xưởng.';

ALTER TABLE production_workshop_client_companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pwc_all" ON production_workshop_client_companies;
CREATE POLICY "pwc_all" ON production_workshop_client_companies
  FOR ALL USING (true) WITH CHECK (true);

-- ── 4. Backfill external_company_id từ external_company_name (VPT) ──
DO $$
DECLARE
  v_vpt_id UUID;
  v_hcb_id UUID;
  v_metalla_id UUID;
BEGIN
  SELECT id INTO v_vpt_id FROM companies
  WHERE name ILIKE '%Bếp Vạn Phú%'
     OR name ILIKE '%Vạn Phú%Thành%'
     OR short_name ILIKE '%VPT%'
  ORDER BY name LIMIT 1;

  SELECT id INTO v_hcb_id FROM companies
  WHERE short_name ILIKE 'HCB' OR name ILIKE '%hucabi%' LIMIT 1;

  SELECT id INTO v_metalla_id FROM companies
  WHERE name ILIKE '%metalla%' LIMIT 1;

  IF v_vpt_id IS NOT NULL THEN
    UPDATE crm_leads
    SET external_company_id = v_vpt_id
    WHERE external_company_id IS NULL
      AND external_company_name IS NOT NULL
      AND (
        external_company_name ILIKE '%vạn phú%'
        OR external_company_name ILIKE '%van phu%'
        OR external_company_name ILIKE '%vpt%'
      );

    -- Deal tại xưởng đối tác chưa có external nhưng company_id = VPT → giữ NULL (deal nội bộ)
  END IF;

  IF v_vpt_id IS NOT NULL AND v_hcb_id IS NOT NULL THEN
    INSERT INTO production_workshop_client_companies (production_company_id, client_company_id)
    VALUES (v_hcb_id, v_vpt_id)
    ON CONFLICT (production_company_id, client_company_id) DO NOTHING;

    -- Chỉ gán linked_company_id cho 1 dòng / (xưởng, công ty CRM) — tránh trùng unique index
    IF NOT EXISTS (
      SELECT 1 FROM production_external_companies
      WHERE production_company_id = v_hcb_id AND linked_company_id = v_vpt_id
    ) THEN
      UPDATE production_external_companies pec
      SET linked_company_id = v_vpt_id
      WHERE pec.id = (
        SELECT id FROM production_external_companies
        WHERE production_company_id = v_hcb_id
          AND linked_company_id IS NULL
          AND (
            name ILIKE '%vạn phú%' OR name ILIKE '%van phu%' OR name ILIKE '%vpt%'
          )
        ORDER BY created_at NULLS LAST, id
        LIMIT 1
      );
    END IF;
  END IF;

  IF v_vpt_id IS NOT NULL AND v_metalla_id IS NOT NULL THEN
    INSERT INTO production_workshop_client_companies (production_company_id, client_company_id)
    VALUES (v_metalla_id, v_vpt_id)
    ON CONFLICT (production_company_id, client_company_id) DO NOTHING;

    IF NOT EXISTS (
      SELECT 1 FROM production_external_companies
      WHERE production_company_id = v_metalla_id AND linked_company_id = v_vpt_id
    ) THEN
      UPDATE production_external_companies pec
      SET linked_company_id = v_vpt_id
      WHERE pec.id = (
        SELECT id FROM production_external_companies
        WHERE production_company_id = v_metalla_id
          AND linked_company_id IS NULL
          AND (
            name ILIKE '%vạn phú%' OR name ILIKE '%van phu%' OR name ILIKE '%vpt%'
          )
        ORDER BY created_at NULLS LAST, id
        LIMIT 1
      );
    END IF;
  END IF;

  -- Sync external_company_name từ companies khi đã có FK
  UPDATE crm_leads cl
  SET external_company_name = COALESCE(c.short_name, c.name)
  FROM companies c
  WHERE cl.external_company_id = c.id
    AND cl.external_company_id IS NOT NULL
    AND (cl.external_company_name IS NULL OR cl.external_company_name = '');

  RAISE NOTICE '366: VPT=%, HCB=%, Metalla=%', v_vpt_id, v_hcb_id, v_metalla_id;
END $$;

-- ── 5. Gán role accounting cho kế toán VPT (cần 366a đã commit trước) ──
DO $$
DECLARE
  v_company_id UUID;
  v_user_id UUID;
  v_email TEXT;
  v_emails TEXT[] := ARRAY[
    'ketoanvanphuthanh.vpt@gmail.com',
    'ketoan1@vpt.vn',
    'phuongcuc5313@gmail.com'
  ];
BEGIN
  SELECT id INTO v_company_id FROM companies
  WHERE name ILIKE '%Bếp Vạn Phú%'
     OR name ILIKE '%Vạn Phú%Thành%'
     OR short_name ILIKE '%VPT%'
  ORDER BY name LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE NOTICE '366: Không tìm thấy VPT — bỏ qua gán role accounting';
    RETURN;
  END IF;

  FOREACH v_email IN ARRAY v_emails LOOP
    UPDATE users
    SET role = 'accounting', company_id = v_company_id, is_active = true, updated_at = now()
    WHERE email ILIKE v_email
    RETURNING id INTO v_user_id;

    IF v_user_id IS NOT NULL THEN
      INSERT INTO user_companies (user_id, company_id, is_primary)
      VALUES (v_user_id, v_company_id, true)
      ON CONFLICT (user_id, company_id) DO UPDATE SET is_primary = true;
      RAISE NOTICE '366: % → accounting (company_id=%)', v_email, v_company_id;
    END IF;
    v_user_id := NULL;
  END LOOP;
END $$;
