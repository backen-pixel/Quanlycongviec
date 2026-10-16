-- 722: Sổ theo dõi migration đã chạy trên từng DB (primary / backup).
-- Ghi bởi backend/scripts/migrate.js — mỗi lần apply thành công thêm 1 dòng
-- trong CÙNG lệnh với SQL migration (lỗi giữa chừng thì không có dòng nào).
-- An toàn khi chạy lại (IF NOT EXISTS). Rollback: 722_schema_migrations_rollback.sql

CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename     text PRIMARY KEY,                 -- vd 720_phone_call_intake.sql
  checksum     text NOT NULL,                    -- sha256 nội dung (đã chuẩn hoá CRLF → LF)
  applied_at   timestamptz NOT NULL DEFAULT now(),
  applied_by   text,
  source       text NOT NULL DEFAULT 'runner'
               CHECK (source IN ('runner', 'baseline', 'manual')),
  note         text
);

COMMENT ON TABLE public.schema_migrations IS
  'Migration trong /database đã chạy trên DB này. source=baseline: đánh dấu hàng loạt file cũ (không biết thời điểm chạy thật).';

-- Chỉ service_role / postgres đọc ghi; không lộ qua anon / authenticated.
ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.schema_migrations FROM anon, authenticated;
