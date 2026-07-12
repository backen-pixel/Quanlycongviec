-- Migration 08: Role-stage mapping + Sample employees per role
-- Run after 07_stage_assignments.sql

-- ═══ ROLE → STAGE MAPPING TABLE ═══
CREATE TABLE IF NOT EXISTS role_stage_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role TEXT NOT NULL,
  stage_slug TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(role, stage_slug)
);

-- Admin/Manager see ALL stages
INSERT INTO role_stage_access (role, stage_slug) VALUES
  ('admin','consulting'),('admin','design'),('admin','quotation'),('admin','contract'),
  ('admin','production'),('admin','shipping'),('admin','installation'),('admin','customer-care'),
  ('manager','consulting'),('manager','design'),('manager','quotation'),('manager','contract'),
  ('manager','production'),('manager','shipping'),('manager','installation'),('manager','customer-care'),
  -- Sales: Tư vấn + Báo giá + Hợp đồng
  ('sales','consulting'),('sales','quotation'),('sales','contract'),
  -- Designer: Thiết kế
  ('designer','design'),
  -- Production: Sản xuất
  ('production','production'),
  -- Driver: Vận chuyển
  ('driver','shipping'),
  -- Installer: Lắp đặt
  ('installer','installation'),
  -- Customer care: CSKH
  ('customer_care','customer-care'),
  -- Staff: can see consulting (general helper)
  ('staff','consulting')
ON CONFLICT DO NOTHING;

-- ═══ SAMPLE EMPLOYEES (one per role) ═══
-- Password: admin123 = $2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi

-- Check if employees already exist, only insert missing ones
INSERT INTO users (email, password, full_name, phone, role, is_active) VALUES
  ('tuvan@tubep.vn','$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi','Phạm Thị Tư Vấn','0911000001','sales',true),
  ('thietke@tubep.vn','$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi','Trần Văn Thiết Kế','0911000002','designer',true),
  ('baogia@tubep.vn','$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi','Lê Thị Báo Giá','0911000003','sales',true),
  ('hopdong@tubep.vn','$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi','Nguyễn Văn Hợp Đồng','0911000004','sales',true),
  ('sanxuat@tubep.vn','$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi','Võ Văn Sản Xuất','0911000005','production',true),
  ('vanchuyen@tubep.vn','$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi','Đặng Văn Vận Chuyển','0911000006','driver',true),
  ('lapdat@tubep.vn','$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi','Bùi Văn Lắp Đặt','0911000007','installer',true),
  ('cskh@tubep.vn','$2a$12$oer35.D6Qtx1cp/BLaq7Ve.XJtEk5gFzPyo9tqzZcW86Jzwgl7JUi','Mai Thị Chăm Sóc','0911000008','customer_care',true)
ON CONFLICT (email) DO NOTHING;
