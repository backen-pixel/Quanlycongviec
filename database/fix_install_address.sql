-- ═══════════════════════════════════════════════════════════════
-- Fix: Thêm cột install_address vào crm_leads + projects
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE crm_leads ADD COLUMN IF NOT EXISTS install_address TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS install_address TEXT;
