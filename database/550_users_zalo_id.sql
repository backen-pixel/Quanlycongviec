-- 550: ID Zalo nhân viên — dùng khi API nhắc hạn @mention trên nhóm Zalo.
-- Idempotent.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS zalo_id TEXT;

COMMENT ON COLUMN public.users.zalo_id IS
  'Zalo user id của nhân viên (để n8n / bot @mention trên nhóm). Không phải OA id.';

CREATE INDEX IF NOT EXISTS idx_users_zalo_id
  ON public.users (zalo_id)
  WHERE zalo_id IS NOT NULL AND btrim(zalo_id) <> '';
