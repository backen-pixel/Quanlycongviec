-- Migration 16: HỆ SINH THÁI TẬP ĐOÀN (Ecosystem Hierarchy)
-- Cấu trúc cấp bậc: Tập đoàn → Khối → Công ty con → Phòng ban → Nhân viên
-- Phân quyền: cấp trên quản lý cấp dưới, không ngược lại

-- ═══ 1. BẢNG CẤP BẬC HỆ SINH THÁI ═══
-- ecosystem_levels: Định nghĩa các cấp bậc (Tập đoàn, Khối, Công ty con, Phòng ban...)
CREATE TABLE IF NOT EXISTS ecosystem_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,         -- VD: 'Tập đoàn', 'Khối', 'Công ty con'
  slug VARCHAR(100) NOT NULL UNIQUE,  -- VD: 'group', 'division', 'subsidiary'
  depth INT NOT NULL DEFAULT 0,       -- 0 = cao nhất (tập đoàn), 1 = khối, 2 = công ty con...
  description TEXT,
  icon VARCHAR(50),
  color VARCHAR(7) DEFAULT '#3B82F6',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ═══ 2. BẢNG ĐƠN VỊ HỆ SINH THÁI ═══
-- ecosystem_units: Mỗi đơn vị trong cây (1 tập đoàn, nhiều khối, nhiều công ty con...)
CREATE TABLE IF NOT EXISTS ecosystem_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  short_name VARCHAR(50),
  code VARCHAR(20),                   -- Mã đơn vị (VD: KD01, SX01)
  level_id UUID REFERENCES ecosystem_levels(id) NOT NULL,
  parent_id UUID REFERENCES ecosystem_units(id) ON DELETE CASCADE, -- NULL = root (tập đoàn)
  -- Liên kết với company (nếu đơn vị là công ty con)
  company_id UUID REFERENCES companies(id),
  -- Liên kết với department (nếu đơn vị là phòng ban)
  department_id UUID REFERENCES departments(id),
  -- Thông tin bổ sung
  description TEXT,
  logo_url TEXT,
  address TEXT,
  phone VARCHAR(20),
  email VARCHAR(255),
  -- Thứ tự hiển thị
  order_index INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ecosystem_units_parent ON ecosystem_units(parent_id);
CREATE INDEX IF NOT EXISTS idx_ecosystem_units_level ON ecosystem_units(level_id);
CREATE INDEX IF NOT EXISTS idx_ecosystem_units_company ON ecosystem_units(company_id);

-- ═══ 3. GÁN NHÓM QUY TRÌNH CHO ĐƠN VỊ ═══
-- Mỗi đơn vị có nhóm quy trình riêng
CREATE TABLE IF NOT EXISTS workflow_stage_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  color VARCHAR(7) DEFAULT '#6366F1',
  icon VARCHAR(50),
  order_index INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Gán stage vào group
CREATE TABLE IF NOT EXISTS workflow_stage_group_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id UUID REFERENCES workflow_stage_groups(id) ON DELETE CASCADE NOT NULL,
  stage_id UUID REFERENCES workflow_stages(id) ON DELETE CASCADE NOT NULL,
  order_index INT DEFAULT 0,
  UNIQUE(group_id, stage_id)
);

-- Gán group cho đơn vị hệ sinh thái
CREATE TABLE IF NOT EXISTS ecosystem_unit_stage_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID REFERENCES ecosystem_units(id) ON DELETE CASCADE NOT NULL,
  group_id UUID REFERENCES workflow_stage_groups(id) ON DELETE CASCADE NOT NULL,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(unit_id, group_id)
);

-- ═══ 4. GÁN NHÂN VIÊN VÀO ĐƠN VỊ + PHÂN QUYỀN ═══
-- Vai trò trong đơn vị: director (giám đốc), manager (quản lý), member (nhân viên)
CREATE TABLE IF NOT EXISTS ecosystem_unit_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unit_id UUID REFERENCES ecosystem_units(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  -- Vai trò trong đơn vị
  unit_role VARCHAR(30) NOT NULL DEFAULT 'member', -- 'director', 'manager', 'team_lead', 'member'
  -- Có quyền quản lý cấp dưới không (kế thừa từ cấp bậc)
  can_manage_children BOOLEAN DEFAULT false,
  is_primary BOOLEAN DEFAULT false,  -- Đơn vị chính của nhân viên
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(unit_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_eco_members_unit ON ecosystem_unit_members(unit_id);
CREATE INDEX IF NOT EXISTS idx_eco_members_user ON ecosystem_unit_members(user_id);

-- ═══ 5. LIÊN KẾT DỰ ÁN VỚI ĐƠN VỊ ═══
-- 1 dự án có thể liên quan nhiều đơn vị (VD: Khối KD tạo → Khối SX sản xuất)
CREATE TABLE IF NOT EXISTS project_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  unit_id UUID REFERENCES ecosystem_units(id) ON DELETE CASCADE NOT NULL,
  -- Vai trò của đơn vị trong dự án
  role VARCHAR(30) DEFAULT 'owner', -- 'owner', 'producer', 'shipper', 'installer'
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(project_id, unit_id)
);

CREATE INDEX IF NOT EXISTS idx_project_units_project ON project_units(project_id);
CREATE INDEX IF NOT EXISTS idx_project_units_unit ON project_units(unit_id);

-- ═══ 6. RLS ═══
ALTER TABLE ecosystem_levels ENABLE ROW LEVEL SECURITY;
ALTER TABLE ecosystem_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_stage_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_stage_group_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE ecosystem_unit_stage_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE ecosystem_unit_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_units ENABLE ROW LEVEL SECURITY;

CREATE POLICY "allow_all" ON ecosystem_levels FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON ecosystem_units FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON workflow_stage_groups FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON workflow_stage_group_items FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON ecosystem_unit_stage_groups FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON ecosystem_unit_members FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "allow_all" ON project_units FOR ALL USING (true) WITH CHECK (true);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE ecosystem_units;

-- ═══ 7. SEED CẤP BẬC MẶC ĐỊNH ═══
INSERT INTO ecosystem_levels (name, slug, depth, description, icon, color) VALUES
  ('Tập đoàn', 'group', 0, 'Cấp cao nhất — quản lý toàn bộ hệ sinh thái', '🏛️', '#1E40AF'),
  ('Khối', 'division', 1, 'Khối chức năng (Kinh doanh, Sản xuất, Vận chuyển, Lắp đặt)', '🏢', '#7C3AED'),
  ('Công ty con', 'subsidiary', 2, 'Công ty con thuộc khối', '🏭', '#059669'),
  ('Phòng ban', 'department', 3, 'Phòng ban trong công ty con', '👥', '#D97706'),
  ('Đội nhóm', 'team', 4, 'Đội nhóm trong phòng ban', '👷', '#DC2626')
ON CONFLICT (slug) DO NOTHING;

-- ═══ 8. SEED NHÓM QUY TRÌNH MẪU ═══
INSERT INTO workflow_stage_groups (name, slug, description, color, icon, order_index) VALUES
  ('Quy trình Kinh doanh', 'business', 'Tư vấn, Thiết kế, Báo giá, Hợp đồng', '#3B82F6', '💼', 1),
  ('Quy trình Sản xuất', 'production', 'Lên KH, Vật tư, SX thùng, Hoàn thiện, ACS, Đóng gói', '#F59E0B', '🏭', 2),
  ('Quy trình Vận chuyển', 'shipping', 'Vận chuyển hàng đến công trình', '#10B981', '🚛', 3),
  ('Quy trình Lắp đặt', 'installation', 'Lắp đặt, Nghiệm thu, Bàn giao', '#EF4444', '🔧', 4),
  ('Quy trình CSKH', 'customer-care', 'Chăm sóc khách hàng sau bàn giao', '#8B5CF6', '❤️', 5)
ON CONFLICT (slug) DO NOTHING;

-- ═══ 9. GÁN QUY TRÌNH HIỆN TẠI VÀO NHÓM ═══
-- Nhóm Kinh doanh: tư vấn, thiết kế, báo giá, hợp đồng
INSERT INTO workflow_stage_group_items (group_id, stage_id, order_index)
SELECT g.id, s.id, s.order_index FROM workflow_stage_groups g
JOIN workflow_stages s ON s.slug IN ('consulting', 'design', 'quotation', 'contract')
WHERE g.slug = 'business'
ON CONFLICT (group_id, stage_id) DO NOTHING;

-- Nhóm Sản xuất: production
INSERT INTO workflow_stage_group_items (group_id, stage_id, order_index)
SELECT g.id, s.id, s.order_index FROM workflow_stage_groups g
JOIN workflow_stages s ON s.slug = 'production'
WHERE g.slug = 'production'
ON CONFLICT (group_id, stage_id) DO NOTHING;

-- Nhóm Vận chuyển: shipping
INSERT INTO workflow_stage_group_items (group_id, stage_id, order_index)
SELECT g.id, s.id, s.order_index FROM workflow_stage_groups g
JOIN workflow_stages s ON s.slug = 'shipping'
WHERE g.slug = 'shipping'
ON CONFLICT (group_id, stage_id) DO NOTHING;

-- Nhóm Lắp đặt: installation
INSERT INTO workflow_stage_group_items (group_id, stage_id, order_index)
SELECT g.id, s.id, s.order_index FROM workflow_stage_groups g
JOIN workflow_stages s ON s.slug = 'installation'
WHERE g.slug = 'installation'
ON CONFLICT (group_id, stage_id) DO NOTHING;

-- Nhóm CSKH: customer-care
INSERT INTO workflow_stage_group_items (group_id, stage_id, order_index)
SELECT g.id, s.id, s.order_index FROM workflow_stage_groups g
JOIN workflow_stages s ON s.slug = 'customer-care'
WHERE g.slug = 'customer-care'
ON CONFLICT (group_id, stage_id) DO NOTHING;
