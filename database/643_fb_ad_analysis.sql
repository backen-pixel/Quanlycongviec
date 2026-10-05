-- 643: Kết quả phân tích tự động từng quảng cáo Facebook
--
-- Job jobs/adAnalysisRunner.js chạy 60 phút/lần, ghi vào bảng này.
-- Nhận xét sinh bằng LUẬT (helpers/adInsights.js), không dùng AI sinh chữ:
-- mỗi nhận xét phải chỉ ra được con số đứng sau nó và lặp lại y hệt khi chạy lại.
-- Additive. Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS fb_ad_analysis (
  ad_id        text PRIMARY KEY,
  xep_hang     text NOT NULL,            -- tot | kha | can_xem | kem | chua_du
  diem_uu_tien integer NOT NULL DEFAULT 0,
  so_lieu      jsonb NOT NULL DEFAULT '{}'::jsonb,
  nhan_xet     jsonb NOT NULL DEFAULT '[]'::jsonb,
  tinh_luc     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fb_ad_analysis_hang ON fb_ad_analysis(xep_hang, diem_uu_tien DESC);
CREATE INDEX IF NOT EXISTS idx_fb_ad_analysis_luc  ON fb_ad_analysis(tinh_luc DESC);

COMMIT;
