-- 438: MCP key — cho phép «Tất cả công ty» + chọn phạm vi quyền (scopes)
-- company_id NULL = mọi công ty (giới hạn theo user act-as)
-- mcp_scopes: text[] — 'reports' | 'crm_read' (mặc định cả hai)

ALTER TABLE external_api_keys
  ALTER COLUMN company_id DROP NOT NULL;

ALTER TABLE external_api_keys
  ADD COLUMN IF NOT EXISTS mcp_scopes text[] NOT NULL DEFAULT ARRAY['reports', 'crm_read']::text[];

COMMENT ON COLUMN external_api_keys.company_id IS
  'NULL = tất cả công ty (MCP multi-company). Non-null = khóa 1 công ty.';
COMMENT ON COLUMN external_api_keys.mcp_scopes IS
  'Quyền MCP: reports (BC tổ chức), crm_read (đọc CRM).';
