-- 352_module_tier_permissions.sql
-- Quyền theo module + chức năng: mỗi resource có 3 action view | edit | admin
-- Idempotent — giống pattern 351_drive_permission_codes.sql

BEGIN;

DO $$
DECLARE
  has_description boolean;
  has_is_active   boolean;
  rec RECORD;
  cols text;
  vals text;
BEGIN
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='permissions' AND column_name='description')
    INTO has_description;
  SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='permissions' AND column_name='is_active')
    INTO has_is_active;

  FOR rec IN
    SELECT * FROM (VALUES
      -- CRM — Bán hàng
      ('crm_pipeline',   'view',  'CRM Pipeline — Xem'),
      ('crm_pipeline',   'edit',  'CRM Pipeline — Sửa'),
      ('crm_pipeline',   'admin', 'CRM Pipeline — Admin'),
      ('crm_leads',      'view',  'Lead — Xem'),
      ('crm_leads',      'edit',  'Lead — Sửa'),
      ('crm_leads',      'admin', 'Lead — Admin'),
      ('crm_deals',      'view',  'Deal — Xem'),
      ('crm_deals',      'edit',  'Deal — Sửa'),
      ('crm_deals',      'admin', 'Deal — Admin'),
      ('crm_tasks',      'view',  'Công việc CRM — Xem'),
      ('crm_tasks',      'edit',  'Công việc CRM — Sửa'),
      ('crm_tasks',      'admin', 'Công việc CRM — Admin'),
      ('crm_assignments','view',  'Giao việc CRM — Xem'),
      ('crm_assignments','edit',  'Giao việc CRM — Sửa'),
      ('crm_assignments','admin', 'Giao việc CRM — Admin'),
      ('crm_follow_up',  'view',  'CSKH theo hạn — Xem'),
      ('crm_follow_up',  'edit',  'CSKH theo hạn — Sửa'),
      ('crm_follow_up',  'admin', 'CSKH theo hạn — Admin'),
      -- CRM — Tài chính
      ('crm_quotations', 'view',  'Báo giá — Xem'),
      ('crm_quotations', 'edit',  'Báo giá — Sửa'),
      ('crm_quotations', 'admin', 'Báo giá — Admin'),
      ('crm_orders',     'view',  'Đơn hàng — Xem'),
      ('crm_orders',     'edit',  'Đơn hàng — Sửa'),
      ('crm_orders',     'admin', 'Đơn hàng — Admin'),
      ('crm_invoices',   'view',  'Hóa đơn — Xem'),
      ('crm_invoices',   'edit',  'Hóa đơn — Sửa'),
      ('crm_invoices',   'admin', 'Hóa đơn — Admin'),
      -- CRM — Dữ liệu & KPI
      ('crm_customers',  'view',  'Khách hàng CRM — Xem'),
      ('crm_customers',  'edit',  'Khách hàng CRM — Sửa'),
      ('crm_customers',  'admin', 'Khách hàng CRM — Admin'),
      ('crm_products',   'view',  'Sản phẩm CRM — Xem'),
      ('crm_products',   'edit',  'Sản phẩm CRM — Sửa'),
      ('crm_products',   'admin', 'Sản phẩm CRM — Admin'),
      ('crm_kpi',        'view',  'KPI CRM — Xem'),
      ('crm_kpi',        'edit',  'KPI CRM — Sửa'),
      ('crm_kpi',        'admin', 'KPI CRM — Admin'),
      ('crm_reports',    'view',  'Báo cáo CRM — Xem'),
      ('crm_reports',    'edit',  'Báo cáo CRM — Sửa'),
      ('crm_reports',    'admin', 'Báo cáo CRM — Admin'),
      ('crm_settings',   'view',  'Cài đặt CRM — Xem'),
      ('crm_settings',   'edit',  'Cài đặt CRM — Sửa'),
      ('crm_settings',   'admin', 'Cài đặt CRM — Admin'),
      ('crm_social',     'view',  'Facebook/Zalo — Xem'),
      ('crm_social',     'edit',  'Facebook/Zalo — Sửa'),
      ('crm_social',     'admin', 'Facebook/Zalo — Admin'),
      ('crm_dashboard',  'view',  'Dashboard CRM — Xem'),
      ('crm_dashboard',  'edit',  'Dashboard CRM — Sửa'),
      ('crm_dashboard',  'admin', 'Dashboard CRM — Admin'),
      -- Sản xuất
      ('sx_dashboard',   'view',  'Dashboard SX — Xem'),
      ('sx_dashboard',   'edit',  'Dashboard SX — Sửa'),
      ('sx_dashboard',   'admin', 'Dashboard SX — Admin'),
      ('sx_deals',       'view',  'Deal vào xưởng — Xem'),
      ('sx_deals',       'edit',  'Deal vào xưởng — Sửa'),
      ('sx_deals',       'admin', 'Deal vào xưởng — Admin'),
      ('sx_assignments', 'view',  'Giao việc SX — Xem'),
      ('sx_assignments', 'edit',  'Giao việc SX — Sửa'),
      ('sx_assignments', 'admin', 'Giao việc SX — Admin'),
      ('sx_pipeline',    'view',  'Pipeline xưởng — Xem'),
      ('sx_pipeline',    'edit',  'Pipeline xưởng — Sửa'),
      ('sx_pipeline',    'admin', 'Pipeline xưởng — Admin'),
      ('sx_templates',   'view',  'Bộ mẫu nhiệm vụ SX — Xem'),
      ('sx_templates',   'edit',  'Bộ mẫu nhiệm vụ SX — Sửa'),
      ('sx_templates',   'admin', 'Bộ mẫu nhiệm vụ SX — Admin'),
      ('sx_handover',    'view',  'Bàn giao CRM→SX — Xem'),
      ('sx_handover',    'edit',  'Bàn giao CRM→SX — Sửa'),
      ('sx_handover',    'admin', 'Bàn giao CRM→SX — Admin'),
      ('sx_regions',     'view',  'Khu vực xưởng — Xem'),
      ('sx_regions',     'edit',  'Khu vực xưởng — Sửa'),
      ('sx_regions',     'admin', 'Khu vực xưởng — Admin'),
      -- Vận chuyển
      ('vc_dashboard',   'view',  'Dashboard VC — Xem'),
      ('vc_dashboard',   'edit',  'Dashboard VC — Sửa'),
      ('vc_dashboard',   'admin', 'Dashboard VC — Admin'),
      ('vc_projects',    'view',  'Dự án VC/LĐ — Xem'),
      ('vc_projects',    'edit',  'Dự án VC/LĐ — Sửa'),
      ('vc_projects',    'admin', 'Dự án VC/LĐ — Admin'),
      ('vc_pipeline',    'view',  'Pipeline VC — Xem'),
      ('vc_pipeline',    'edit',  'Pipeline VC — Sửa'),
      ('vc_pipeline',    'admin', 'Pipeline VC — Admin'),
      ('vc_teams',       'view',  'Đội nhóm VC — Xem'),
      ('vc_teams',       'edit',  'Đội nhóm VC — Sửa'),
      ('vc_teams',       'admin', 'Đội nhóm VC — Admin'),
      ('vc_templates',   'view',  'Bộ nhiệm vụ VC — Xem'),
      ('vc_templates',   'edit',  'Bộ nhiệm vụ VC — Sửa'),
      ('vc_templates',   'admin', 'Bộ nhiệm vụ VC — Admin'),
      -- Kế toán
      ('ketoan_dashboard','view',  'Dashboard Kế toán — Xem'),
      ('ketoan_dashboard','edit',  'Dashboard Kế toán — Sửa'),
      ('ketoan_dashboard','admin', 'Dashboard Kế toán — Admin'),
      ('ketoan_finance', 'view',  'Báo giá/ĐH/HĐ — Xem'),
      ('ketoan_finance', 'edit',  'Báo giá/ĐH/HĐ — Sửa'),
      ('ketoan_finance', 'admin', 'Báo giá/ĐH/HĐ — Admin')
    ) AS t(resource, action, p_desc)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM permissions WHERE resource = rec.resource AND action = rec.action
    ) THEN
      cols := 'resource, action';
      vals := quote_literal(rec.resource) || ', ' || quote_literal(rec.action);
      IF has_description THEN
        cols := cols || ', description';
        vals := vals || ', ' || quote_literal(rec.p_desc);
      END IF;
      IF has_is_active THEN
        cols := cols || ', is_active';
        vals := vals || ', true';
      END IF;
      EXECUTE 'INSERT INTO permissions (' || cols || ') VALUES (' || vals || ')';
    ELSE
      IF has_description THEN
        EXECUTE 'UPDATE permissions SET description = $1'
                || CASE WHEN has_is_active THEN ', is_active = true' ELSE '' END
                || ' WHERE resource = $2 AND action = $3'
          USING rec.p_desc, rec.resource, rec.action;
      ELSIF has_is_active THEN
        EXECUTE 'UPDATE permissions SET is_active = true WHERE resource = $1 AND action = $2'
          USING rec.resource, rec.action;
      END IF;
    END IF;
  END LOOP;
END $$;

COMMIT;
