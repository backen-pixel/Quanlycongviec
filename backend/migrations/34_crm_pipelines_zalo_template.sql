-- Sync database/60_crm_pipelines_zalo_template.sql — chỉ chạy khi đã có public.crm_pipelines (21_crm_pipelines.sql).

DO $mig$
BEGIN
  IF to_regclass('public.crm_pipelines') IS NULL THEN
    RAISE NOTICE 'crm_pipelines: bảng chưa có — bỏ qua thêm cột Zalo. Chạy database/21_crm_pipelines.sql rồi chạy lại migration này.';
    RETURN;
  END IF;

  ALTER TABLE public.crm_pipelines
    ADD COLUMN IF NOT EXISTS zalo_template_id TEXT,
    ADD COLUMN IF NOT EXISTS zalo_merge_template_data JSONB NOT NULL DEFAULT '{}'::jsonb;

  COMMENT ON COLUMN public.crm_pipelines.zalo_template_id IS 'ID template Zalo "tin qua SĐT" cho deal pipeline này; NULL = dùng cấu hình chung app_settings';
  COMMENT ON COLUMN public.crm_pipelines.zalo_merge_template_data IS 'Ghi đè/bổ sung merge_template_data chung (object JSON)';
END
$mig$;
