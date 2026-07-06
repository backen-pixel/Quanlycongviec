-- 391_fix_backup_users_pkey.sql
-- Sửa backup DB: public.users thiếu PRIMARY KEY do 1 bản ghi trùng id (sync lỗi).
-- Chạy trên BACKUP (atcfpgxkgbszglrelfgr). Idempotent sau lần chạy đầu.

-- 1) Xóa bản ghi trùng id (giữ ctid nhỏ nhất)
DELETE FROM public.users a
USING public.users b
WHERE a.id = b.id
  AND a.ctid > b.ctid;

-- 2) PRIMARY KEY + UNIQUE email (khớp primary)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass AND conname = 'users_pkey'
  ) THEN
    ALTER TABLE public.users ADD CONSTRAINT users_pkey PRIMARY KEY (id);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.users'::regclass AND conname = 'users_email_key'
  ) THEN
    ALTER TABLE public.users ADD CONSTRAINT users_email_key UNIQUE (email);
  END IF;
END $$;

-- 3) FK ai_bot_user_skills → users (390 backup chạy không FK)
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'ai_bot_user_skills'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_bot_user_skills_user_id_fkey'
  ) THEN
    ALTER TABLE public.ai_bot_user_skills
      ADD CONSTRAINT ai_bot_user_skills_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;
  END IF;
END $$;
