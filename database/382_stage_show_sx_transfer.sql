-- Add show_sx_transfer flag to crm_pipeline_stages
-- When true, deals in this stage show the "Chuyển sang Sản xuất" button
ALTER TABLE crm_pipeline_stages
  ADD COLUMN IF NOT EXISTS show_sx_transfer BOOLEAN DEFAULT false;
