-- Migration 142: External API audit logs (API key integrations)

CREATE TABLE IF NOT EXISTS external_api_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  api_key_id UUID,
  api_key_name TEXT,
  company_id UUID,
  endpoint TEXT,
  method TEXT,
  status INT,
  ip TEXT,
  user_agent TEXT,
  error TEXT,
  created_lead_id UUID,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS external_api_logs_created_at_idx ON external_api_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS external_api_logs_api_key_id_idx ON external_api_logs(api_key_id);
CREATE INDEX IF NOT EXISTS external_api_logs_company_id_idx ON external_api_logs(company_id);

