-- 401: Sửa unique index của facebook_messages.fb_message_id.
-- Trước đây là UNIQUE INDEX ... WHERE fb_message_id IS NOT NULL (partial index).
-- PostgREST/Supabase upsert dùng ON CONFLICT("fb_message_id") DO NOTHING không có
-- mệnh đề WHERE tương ứng nên Postgres không suy luận (infer) được ra partial index
-- này → lỗi lặp lại liên tục "there is no unique or exclusion constraint matching
-- the ON CONFLICT specification" (42P10) mỗi khi webhook Facebook Messenger lưu tin
-- nhắn mới (backend/src/routes/facebook.js, dòng upsert 'facebook_messages').
--
-- Postgres coi các giá trị NULL là phân biệt nhau trong UNIQUE constraint thường,
-- nên đổi sang UNIQUE constraint đầy đủ (không có WHERE) vẫn cho phép nhiều dòng
-- fb_message_id = NULL như cũ, đồng thời khớp được với ON CONFLICT("fb_message_id").

DROP INDEX IF EXISTS idx_facebook_messages_fb_message_id;

ALTER TABLE public.facebook_messages
  ADD CONSTRAINT facebook_messages_fb_message_id_uq UNIQUE (fb_message_id);
