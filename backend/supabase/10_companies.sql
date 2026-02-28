-- Migration 10: Companies — Công ty cho nhân viên và dự án
-- 1 nhân viên có thể thuộc nhiều công ty
-- 1 dự án chỉ thuộc 1 công ty
-- Phân công nhân viên dự án phụ thuộc vào công ty đã chọn

-- ═══ BẢNG CÔNG TY ═══
CREATE TABLE IF NOT EXISTS companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  short_name VARCHAR(50),
  tax_code VARCHAR(20),
  address TEXT,
  phone VARCHAR(20),
  email VARCHAR(255),
  logo_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ═══ NHÂN VIÊN ↔ CÔNG TY (many-to-many) ═══
CREATE TABLE IF NOT EXISTS user_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT false,
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, company_id)
);

CREATE INDEX IF NOT EXISTS idx_user_companies_user ON user_companies(user_id);
CREATE INDEX IF NOT EXISTS idx_user_companies_company ON user_companies(company_id);

-- ═══ THÊM company_id CHO DỰ ÁN ═══
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='company_id') THEN
    ALTER TABLE projects ADD COLUMN company_id UUID REFERENCES companies(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_projects_company ON projects(company_id);

-- ═══ SEED CÔNG TY MẪU ═══
INSERT INTO companies (name, short_name, phone, email, address) VALUES
  ('Công ty TNHH Nội Thất Văn Phú Thành', 'VPT', '0901234567', 'info@vanphuthanh.net', 'TP. Hồ Chí Minh'),
  ('Công ty TNHH Tủ Bếp Sài Gòn', 'TBSG', '0912345678', 'info@tubepsaigon.vn', 'TP. Hồ Chí Minh'),
  ('Công ty CP Nội Thất Bình Dương', 'NTBD', '0923456789', 'info@noithatbd.vn', 'Bình Dương')
ON CONFLICT DO NOTHING;

-- ═══ GÁN NHÂN VIÊN HIỆN TẠI VÀO CÔNG TY ĐẦU TIÊN ═══
INSERT INTO user_companies (user_id, company_id, is_primary)
SELECT u.id, c.id, true
FROM users u
CROSS JOIN (SELECT id FROM companies ORDER BY created_at LIMIT 1) c
WHERE u.is_active = true
ON CONFLICT (user_id, company_id) DO NOTHING;
