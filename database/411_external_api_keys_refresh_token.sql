-- 411: external_api_keys — refresh_token cho OAuth-style rotate access token
ALTER TABLE external_api_keys
  ADD COLUMN IF NOT EXISTS refresh_token text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_external_api_keys_refresh_token
  ON external_api_keys(refresh_token)
  WHERE refresh_token IS NOT NULL;

COMMENT ON COLUMN external_api_keys.refresh_token IS
  'Refresh token (tbp_rt_…) — đổi cặp access+refresh qua POST /api/external/oauth/token';
