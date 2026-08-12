-- Backfill ngày hoàn thiện SX còn thiếu:
-- ưu tiên install_date (lắp đặt), không thì delivery_date (giao hàng) → trừ 2 ngày lịch.

UPDATE projects
SET
  production_finish_date = (
    COALESCE(
      CASE WHEN install_date IS NOT NULL THEN (install_date::date - INTERVAL '2 days') END,
      CASE WHEN delivery_date IS NOT NULL THEN (delivery_date - INTERVAL '2 days') END
    )
  )::date,
  updated_at = now()
WHERE production_finish_date IS NULL
  AND (install_date IS NOT NULL OR delivery_date IS NOT NULL);
