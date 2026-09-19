-- ═══════════════════════════════════════════════════════════════
-- 560. ZALO CÁ NHÂN — khớp hội thoại với lead theo số điện thoại
--
-- Lead có SĐT (customers.phone), và SĐT đó cũng là số Zalo. Hai đường khớp:
--
--   1. Khi có tin đến từ người lạ  → lấy SĐT của họ, dò ngược ra lead.
--      Không tốn lượt tra cứu nào, chạy tự động.
--
--   2. Khi nhân viên mở tab Zalo cá nhân của một lead chưa có hội thoại
--      → tạo một yêu cầu tra cứu ĐÚNG MỘT số. Do người bấm, số lượng thấp.
--
-- KHÔNG quét hàng loạt 6000 số: dò số điện thoại hàng loạt là hành vi khiến
-- Zalo khoá tài khoản. Bảng dưới có hạn mức để chặn đúng việc đó.
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS zalo_link_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  oa_id TEXT NOT NULL,
  lead_id UUID REFERENCES crm_leads(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'done', 'not_found', 'failed')),
  zalo_uid TEXT,
  display_name TEXT,
  error TEXT,
  requested_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  done_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_zalo_link_requests_poll
  ON zalo_link_requests(oa_id, status, created_at);

-- Chặn tạo trùng yêu cầu cho cùng một số đang chờ
CREATE UNIQUE INDEX IF NOT EXISTS idx_zalo_link_requests_pending_unique
  ON zalo_link_requests(oa_id, phone) WHERE status = 'pending';

-- Hạn mức tra cứu mỗi tài khoản, để không bao giờ thành quét hàng loạt
ALTER TABLE zalo_oa_accounts
  ADD COLUMN IF NOT EXISTS lookup_hourly_limit INT NOT NULL DEFAULT 30;

ALTER TABLE zalo_link_requests ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "zalo_link_requests_all" ON zalo_link_requests FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Tra cứu SĐT → lead. Chuẩn hoá về 10 số bắt đầu bằng 0 để so khớp,
-- vì dữ liệu có cả dạng +84 lẫn 84.
CREATE OR REPLACE FUNCTION zalo_normalize_phone(p TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p IS NULL THEN NULL
    WHEN regexp_replace(p, '\D', '', 'g') ~ '^84[0-9]{9}$'
      THEN '0' || substring(regexp_replace(p, '\D', '', 'g') from 3)
    WHEN regexp_replace(p, '\D', '', 'g') ~ '^0[0-9]{9}$'
      THEN regexp_replace(p, '\D', '', 'g')
    WHEN regexp_replace(p, '\D', '', 'g') ~ '^[1-9][0-9]{8}$'
      THEN '0' || regexp_replace(p, '\D', '', 'g')
    ELSE NULL
  END;
$$;

CREATE INDEX IF NOT EXISTS idx_customers_phone_normalized
  ON customers (zalo_normalize_phone(phone))
  WHERE phone IS NOT NULL AND btrim(phone) <> '';
