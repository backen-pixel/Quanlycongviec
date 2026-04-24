-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 88: Tổng hợp tất cả columns/FKs cần thiết cho SX → VC handover
-- Chạy file này trên Supabase SQL Editor nếu tính năng bàn giao chưa hoạt động.
-- An toàn khi chạy lại nhiều lần (idempotent).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── BƯỚC 1: Tạo bảng logistics_pipeline_stages nếu chưa có ─────────────────
CREATE TABLE IF NOT EXISTS logistics_pipeline_stages (
  id               UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  name             TEXT    NOT NULL,
  color            TEXT    DEFAULT '#f97316',
  icon             TEXT    DEFAULT '📦',
  order_index      INTEGER DEFAULT 0,
  is_active        BOOLEAN DEFAULT true,
  workflow_stage_id UUID   REFERENCES workflow_stages(id) ON DELETE SET NULL,
  bucket_slug      TEXT,
  crm_sync_type    TEXT,
  created_at       TIMESTAMPTZ DEFAULT now()
);

-- ── BƯỚC 2: Thêm các cột cần thiết (idempotent) ────────────────────────────
ALTER TABLE logistics_pipeline_stages     ADD COLUMN IF NOT EXISTS crm_sync_type TEXT;
ALTER TABLE production_pipeline_stages    ADD COLUMN IF NOT EXISTS is_handover_to_logistics BOOLEAN DEFAULT false;
ALTER TABLE production_pipeline_stages    ADD COLUMN IF NOT EXISTS crm_sync_type TEXT;
ALTER TABLE projects                      ADD COLUMN IF NOT EXISTS vc_kanban_column_id UUID;
ALTER TABLE projects                      ADD COLUMN IF NOT EXISTS install_address TEXT;
ALTER TABLE crm_leads                     ADD COLUMN IF NOT EXISTS vc_pipeline_stage_id UUID;
ALTER TABLE crm_leads                     ADD COLUMN IF NOT EXISTS sx_pipeline_stage_id UUID;

-- ── BƯỚC 3: Seed logistics stages mặc định nếu bảng rỗng ──────────────────
-- crm_sync_type: 'delivery' | 'installation' | 'customer_care' (khớp CRM_SYNC_TYPE_TO_ROLE)
INSERT INTO logistics_pipeline_stages (name, color, icon, order_index, is_active, bucket_slug, crm_sync_type)
SELECT name, color, icon, order_index, true, bucket_slug, crm_sync_type FROM (VALUES
  ('Chờ vận chuyển',    '#f97316', '📦', 1, 'delivery_pending', NULL),
  ('Đang vận chuyển',   '#ea580c', '🚚', 2, NULL,              'delivery'),
  ('Đang lắp đặt',      '#d97706', '🔧', 3, NULL,              'installation'),
  ('Nghiệm thu nội bộ', '#7c3aed', '📋', 4, NULL,              NULL),
  ('Bàn giao KH',       '#2563eb', '🤝', 5, NULL,              NULL),
  ('Bảo hành / CSKH',   '#0f766e', '🔄', 6, NULL,              'customer_care'),
  ('Hoàn thành',        '#16a34a', '✅', 7, NULL,              NULL)
) AS v(name, color, icon, order_index, bucket_slug, crm_sync_type)
WHERE NOT EXISTS (SELECT 1 FROM logistics_pipeline_stages LIMIT 1);

-- ── BƯỚC 4: Fix crm_sync_type sai từ migrations cũ ─────────────────────────
UPDATE logistics_pipeline_stages SET crm_sync_type = 'delivery'      WHERE crm_sync_type = 'vc_delivery';
UPDATE logistics_pipeline_stages SET crm_sync_type = 'installation'  WHERE crm_sync_type = 'vc_installation';
UPDATE logistics_pipeline_stages SET crm_sync_type = 'customer_care' WHERE crm_sync_type IN ('vc_warranty','vc_customer_care','vc_done');

-- ── BƯỚC 5: Đánh dấu is_handover_to_logistics cho SX column tên "vận chuyển" ─
UPDATE production_pipeline_stages
SET is_handover_to_logistics = true
WHERE (
  LOWER(name) LIKE '%vận chuyển%'
  OR LOWER(name) LIKE '%handover%'
  OR bucket_slug = 'handover_vc'
)
AND is_handover_to_logistics = false;

-- ── BƯỚC 6: FK projects.vc_kanban_column_id → logistics_pipeline_stages ────
--    Dùng để Production Kanban join vc_stage (hiển thị badge VC trên card SX)
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_vc_kanban_column_id_fkey;
ALTER TABLE projects
  ADD CONSTRAINT projects_vc_kanban_column_id_fkey
  FOREIGN KEY (vc_kanban_column_id)
  REFERENCES logistics_pipeline_stages(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_projects_vc_kanban_column_id ON projects(vc_kanban_column_id);

-- ── BƯỚC 7: FK crm_leads.vc_pipeline_stage_id → logistics_pipeline_stages ──
--    Dùng để CRM Kanban card join vc_pipeline_stage (badge VC trên card CRM)
ALTER TABLE crm_leads DROP CONSTRAINT IF EXISTS crm_leads_vc_pipeline_stage_id_fkey;
ALTER TABLE crm_leads
  ADD CONSTRAINT crm_leads_vc_pipeline_stage_id_fkey
  FOREIGN KEY (vc_pipeline_stage_id)
  REFERENCES logistics_pipeline_stages(id) ON DELETE SET NULL;

-- ── BƯỚC 8: FK crm_leads.sx_pipeline_stage_id → production_pipeline_stages ─
--    Dùng để CRM Kanban card join sx_pipeline_stage (badge SX trên card CRM)
ALTER TABLE crm_leads DROP CONSTRAINT IF EXISTS crm_leads_sx_pipeline_stage_id_fkey;
ALTER TABLE crm_leads
  ADD CONSTRAINT crm_leads_sx_pipeline_stage_id_fkey
  FOREIGN KEY (sx_pipeline_stage_id)
  REFERENCES production_pipeline_stages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_crm_leads_vc_pipeline_stage_id ON crm_leads(vc_pipeline_stage_id);
CREATE INDEX IF NOT EXISTS idx_crm_leads_sx_pipeline_stage_id ON crm_leads(sx_pipeline_stage_id);

-- ── BƯỚC 9: Backfill vc_kanban_column_id cho projects đã handover ───────────
UPDATE projects p
SET vc_kanban_column_id = (
  SELECT id FROM logistics_pipeline_stages
  WHERE bucket_slug = 'delivery_pending' AND is_active = true
  ORDER BY order_index LIMIT 1
)
WHERE p.status IN ('shipping', 'installing', 'warranty')
  AND p.vc_kanban_column_id IS NULL;

-- ── BƯỚC 10: Backfill sx_pipeline_stage_id cho CRM deals có project ─────────
UPDATE crm_leads cl
SET sx_pipeline_stage_id = (
  SELECT pps.id
  FROM production_pipeline_stages pps
  JOIN projects proj ON proj.id = cl.project_id
  WHERE pps.workflow_stage_id = proj.current_stage_id
    AND pps.is_active = true
  LIMIT 1
)
WHERE cl.type = 'deal'
  AND cl.project_id IS NOT NULL
  AND cl.sx_pipeline_stage_id IS NULL
  AND EXISTS (SELECT 1 FROM projects WHERE id = cl.project_id AND current_stage_id IS NOT NULL);

-- ── COMMENTS ─────────────────────────────────────────────────────────────────
COMMENT ON COLUMN production_pipeline_stages.is_handover_to_logistics IS
  'Khi project SX đến cột này, tự động chuyển sang module Vận chuyển & Lắp đặt';
COMMENT ON COLUMN projects.vc_kanban_column_id IS
  'Cột Kanban hiện tại trong module Vận chuyển & Lắp đặt';
COMMENT ON COLUMN crm_leads.vc_pipeline_stage_id IS
  'Stage hiện tại trong module Vận chuyển & Lắp đặt (hiển thị badge VC trên CRM card)';
COMMENT ON COLUMN crm_leads.sx_pipeline_stage_id IS
  'Stage hiện tại trong module Sản xuất (hiển thị badge SX trên CRM card)';
