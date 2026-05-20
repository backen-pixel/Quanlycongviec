-- ═══════════════════════════════════════════════════════════════
-- 202. CRM Lead User Flags (per-user)
-- 1 bảng cho cả 2 cờ per-user trên thẻ lead/deal:
--   - is_pinned: ghim thẻ lên đầu Kanban/List của riêng user
--   - is_interacted: tick xanh "đã tương tác với khách hàng"
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS crm_lead_user_flags (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lead_id UUID NOT NULL REFERENCES crm_leads(id) ON DELETE CASCADE,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  pinned_at TIMESTAMPTZ,
  is_interacted BOOLEAN NOT NULL DEFAULT false,
  interacted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, lead_id)
);

-- Index riêng cho danh sách ghim của 1 user (partial index — nhỏ gọn).
CREATE INDEX IF NOT EXISTS idx_crm_lead_user_flags_user_pinned
  ON crm_lead_user_flags(user_id, pinned_at DESC) WHERE is_pinned = true;

-- Index theo lead_id để fan-out: khi load list leads, batch tra cứu flags
-- của current_user cho nhiều lead_id một lúc.
CREATE INDEX IF NOT EXISTS idx_crm_lead_user_flags_lead
  ON crm_lead_user_flags(lead_id);

ALTER TABLE crm_lead_user_flags ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "crm_lead_user_flags_all" ON crm_lead_user_flags;
CREATE POLICY "crm_lead_user_flags_all" ON crm_lead_user_flags FOR ALL USING (true) WITH CHECK (true);
