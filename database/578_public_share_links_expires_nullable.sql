-- 578: Cho phép link xem ảnh không hết hạn (expires_at NULL = không giới hạn).

BEGIN;

ALTER TABLE public.public_share_links
  ALTER COLUMN expires_at DROP NOT NULL;

ALTER TABLE public.public_share_links
  ALTER COLUMN expires_at DROP DEFAULT;

COMMENT ON COLUMN public.public_share_links.expires_at IS
  'Hết hạn xem. NULL = không giới hạn. revoked_at vẫn vô hiệu hóa ngay.';

COMMIT;
