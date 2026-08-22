-- Tắt quá hạn ngày lắp/giao trên các cột sau khi đã giao hàng / công nợ hậu giao.
-- Tránh deal cũ (vd TB-2026-453 ở «KHẤU TRỪ CN…») vẫn bị gắn badge Quá hạn.

UPDATE production_pipeline_stages
SET sla_days = 0
WHERE COALESCE(is_active, true) = true
  AND COALESCE(sla_days, -1) IS DISTINCT FROM 0
  AND (
    lower(name) ~ '(đã giao|da giao|đơn hàng đã giao|don hang da giao)'
    OR lower(name) ~ '(khấu trừ|khau tru)'
    OR lower(name) ~ '(công nợ đang đối chiếu|cong no dang doi chieu|đang đôi chiếu|dang doi chieu)'
    OR lower(name) ~ '(chốt công nợ|chot cong no|kiểm tra công nợ|kiem tra cong no)'
  );

COMMENT ON COLUMN production_pipeline_stages.sla_days IS
  'NULL = mặc định SLA; 0 = bỏ quá hạn ngày giao/deadline cột; ≥1 = số ngày SLA.';
