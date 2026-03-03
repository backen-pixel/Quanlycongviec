-- Migration 18: AUTO-SYNC ECOSYSTEM
-- Thêm company_id cho departments
-- Khi tạo company → auto tạo ecosystem_unit cấp Công ty
-- Khi tạo department → auto tạo ecosystem_unit cấp Phòng ban

-- ═══ 1. THÊM company_id CHO departments ═══
DO $$ BEGIN
  ALTER TABLE departments ADD COLUMN company_id UUID REFERENCES companies(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_departments_company ON departments(company_id);

-- ═══ 2. THÊM division_unit_id CHO companies (Khối mà Cty thuộc về) ═══
DO $$ BEGIN
  ALTER TABLE companies ADD COLUMN division_unit_id UUID REFERENCES ecosystem_units(id);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
