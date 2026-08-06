-- Migration 501: Cột VC «Đang giao» → trigger CRM Vận chuyển (sync_role=vc_delivery)
-- Khi kéo project sang «Đang giao», CRM deal nhảy sang cột có sync_role=vc_delivery.

UPDATE logistics_pipeline_stages
SET crm_sync_type = 'delivery'
WHERE is_active IS DISTINCT FROM false
  AND name = 'Đang giao'
  AND (crm_sync_type IS NULL OR crm_sync_type = '');
