-- Xác suất mặc định theo cột pipeline (khi lead/deal chưa có probability riêng hoặc null)
ALTER TABLE crm_pipeline_stages
ADD COLUMN IF NOT EXISTS default_probability SMALLINT;

COMMENT ON COLUMN crm_pipeline_stages.default_probability IS
  'Phần trăm xác suất mặc định (0–100) cho cột; null = không áp dụng fallback.';
