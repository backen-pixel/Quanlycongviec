-- 245: Gắn module/khối vào sự kiện để các module dùng chung trang Sự kiện.
--
-- Cách dùng:
--   - 'crm'        — Khối kinh doanh (mặc định cho sự kiện CRM cũ)
--   - 'production' — Khối sản xuất
--   - 'logistics'  — Khối vận chuyển/lắp đặt
--   - 'general'    — Sự kiện chung toàn công ty (không thuộc module nào)
--
-- Khi sidebar SX/VC bấm "Sự kiện" sẽ truyền ?module=production / logistics
-- để filter; CRM mặc định xem 'crm' hoặc tất cả.

ALTER TABLE crm_events
  ADD COLUMN IF NOT EXISTS module text NOT NULL DEFAULT 'crm';

CREATE INDEX IF NOT EXISTS idx_crm_events_module
  ON crm_events (module, start_time DESC);

CREATE INDEX IF NOT EXISTS idx_crm_events_company_module
  ON crm_events (company_id, module, start_time DESC);

COMMENT ON COLUMN crm_events.module IS
  'Khối/Module sự kiện thuộc về: crm | production | logistics | general';
