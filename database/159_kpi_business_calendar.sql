-- ═══════════════════════════════════════════════════════════════════════════
-- 159: Lịch làm việc cho KPI (giờ HC, ngày làm, ngày lễ, ngày phép)
--   Phục vụ KPI A1/A2 (phản hồi lead trong giờ HC) và các KPI thời gian khác.
--   3 bảng:
--     kpi_business_hours_config — giờ HC + ngày làm trong tuần (theo company)
--     kpi_holidays              — ngày lễ (global hoặc per company)
--     kpi_user_leaves           — nghỉ phép từng nhân viên
--   Idempotent. An toàn chạy lại.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── kpi_business_hours_config ───────────────────────────────────────────────
-- 1 row / company. company_id NULL = cấu hình mặc định toàn hệ thống.
CREATE TABLE IF NOT EXISTS kpi_business_hours_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
  start_minute INT NOT NULL DEFAULT 480,      -- 08:00 = 8*60
  end_minute   INT NOT NULL DEFAULT 1020,     -- 17:00 = 17*60
  lunch_start_minute INT,                     -- NULL = không trừ nghỉ trưa
  lunch_end_minute   INT,
  -- ISO weekday: 1=T2 … 7=CN. Mặc định T2-T7.
  work_days SMALLINT[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6]::SMALLINT[],
  timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (start_minute >= 0 AND start_minute < 1440),
  CHECK (end_minute > start_minute AND end_minute <= 1440),
  CHECK (lunch_start_minute IS NULL OR lunch_end_minute IS NULL
         OR (lunch_start_minute >= start_minute AND lunch_end_minute <= end_minute
             AND lunch_end_minute > lunch_start_minute))
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_kpi_bizhours_company
  ON kpi_business_hours_config (company_id) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_kpi_bizhours_default
  ON kpi_business_hours_config ((1)) WHERE company_id IS NULL;

COMMENT ON TABLE  kpi_business_hours_config IS 'Giờ hành chính & ngày làm trong tuần áp dụng cho KPI A1/A2 (per company hoặc default).';
COMMENT ON COLUMN kpi_business_hours_config.work_days IS 'ISO weekday: 1=T2 … 7=CN. Mặc định ARRAY[1..6] = T2-T7.';

-- Seed default (toàn hệ thống) — 8:00-17:00, T2-T7, nghỉ trưa 12:00-13:00
INSERT INTO kpi_business_hours_config (company_id, start_minute, end_minute, lunch_start_minute, lunch_end_minute, work_days, timezone, notes)
VALUES (NULL, 480, 1020, 720, 780, ARRAY[1,2,3,4,5,6]::SMALLINT[], 'Asia/Ho_Chi_Minh', 'Cấu hình mặc định: 8h-17h T2-T7, nghỉ trưa 12-13h')
ON CONFLICT DO NOTHING;

-- ─── kpi_holidays ────────────────────────────────────────────────────────────
-- Ngày lễ toàn công ty / global. repeat_yearly = TRUE → lặp hằng năm theo (month, day).
CREATE TABLE IF NOT EXISTS kpi_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES companies(id) ON DELETE CASCADE,  -- NULL = áp dụng mọi công ty
  holiday_date DATE NOT NULL,
  name TEXT NOT NULL,
  repeat_yearly BOOLEAN NOT NULL DEFAULT false,
  is_half_day BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_kpi_holidays_company_date
  ON kpi_holidays (company_id, holiday_date) WHERE company_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_kpi_holidays_global_date
  ON kpi_holidays (holiday_date) WHERE company_id IS NULL;
CREATE INDEX IF NOT EXISTS idx_kpi_holidays_repeat
  ON kpi_holidays (repeat_yearly, holiday_date) WHERE repeat_yearly = true;

COMMENT ON TABLE kpi_holidays IS 'Ngày lễ — KPI A1/A2/A4/A5 sẽ bỏ qua mốc thời gian rơi vào ngày lễ (đẩy sang ngày làm kế).';
COMMENT ON COLUMN kpi_holidays.repeat_yearly IS 'TRUE → lặp hằng năm theo (tháng, ngày) của holiday_date.';

-- Seed các ngày lễ VN cố định (repeat_yearly)
INSERT INTO kpi_holidays (company_id, holiday_date, name, repeat_yearly, notes) VALUES
  (NULL, '2025-01-01', 'Tết Dương lịch',           true,  '01/01 hằng năm'),
  (NULL, '2025-04-30', 'Giải phóng miền Nam',      true,  '30/04 hằng năm'),
  (NULL, '2025-05-01', 'Quốc tế Lao động',         true,  '01/05 hằng năm'),
  (NULL, '2025-09-02', 'Quốc khánh',               true,  '02/09 hằng năm'),
  (NULL, '2025-04-07', 'Giỗ tổ Hùng Vương (10/3 ÂL)', false, 'Theo âm lịch — cập nhật hằng năm')
ON CONFLICT DO NOTHING;

-- ─── kpi_user_leaves ─────────────────────────────────────────────────────────
-- Nghỉ phép / nghỉ ốm / công tác — không tính vào mẫu số KPI thời gian.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'kpi_leave_type') THEN
    CREATE TYPE kpi_leave_type AS ENUM ('paid','unpaid','sick','business_trip','remote','other');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS kpi_user_leaves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date   DATE NOT NULL,
  leave_type kpi_leave_type NOT NULL DEFAULT 'paid',
  -- Nửa ngày sáng/chiều/cả ngày
  half_day TEXT CHECK (half_day IN ('morning','afternoon','full')) NOT NULL DEFAULT 'full',
  reason TEXT,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending','approved','rejected','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_kpi_user_leaves_user_range
  ON kpi_user_leaves (user_id, start_date, end_date) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS idx_kpi_user_leaves_status ON kpi_user_leaves (status);

COMMENT ON TABLE kpi_user_leaves IS 'Phép/nghỉ ốm/công tác từng NV — KPI A1/A2/A4 sẽ skip lead/task tạo trong khoảng này.';

-- ─── Helper view: lịch ngày làm thực tế của 1 user trong khoảng ─────────────
-- (Tùy chọn — service JS có thể tự xử lý. View dưới chỉ hỗ trợ debug nhanh.)
CREATE OR REPLACE VIEW v_kpi_user_offdays AS
SELECT
  l.user_id,
  d::DATE AS off_date,
  l.leave_type::TEXT AS reason,
  'leave'::TEXT AS source
FROM kpi_user_leaves l
CROSS JOIN LATERAL generate_series(l.start_date, l.end_date, INTERVAL '1 day') AS d
WHERE l.status = 'approved';

COMMENT ON VIEW v_kpi_user_offdays IS 'Mỗi NV / mỗi ngày nghỉ phép — phục vụ debug và báo cáo.';

COMMIT;
