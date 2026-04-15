-- Chat trực tiếp 2 nhân viên (không phải nhóm đặt tên)

ALTER TABLE messenger_groups ADD COLUMN IF NOT EXISTS is_direct BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE messenger_groups ADD COLUMN IF NOT EXISTS direct_pair_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_messenger_groups_direct_pair_key
  ON messenger_groups (direct_pair_key)
  WHERE direct_pair_key IS NOT NULL;
