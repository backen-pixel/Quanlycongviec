-- 721 — Tráo thứ tự câu hỏi và đáp án trong bài kiểm tra
--
-- Hai công tắc riêng vì chúng khác bản chất:
--   shuffle_questions — đổi thứ tự CÂU. Không ảnh hưởng chấm điểm (đáp án gửi về theo id câu).
--   shuffle_options   — đổi thứ tự ĐÁP ÁN. ẢNH HƯỞNG chấm điểm: người học gửi về chỉ số ô, nên
--                       lúc chấm phải dịch ngược về chỉ số gốc. Xem helpers/knowledgeTronDe.js.
--
-- Mặc định FALSE: bài đang có giữ nguyên hành vi, quản trị bật từng bài khi muốn.
--
-- Không lưu hoán vị vào DB. Tráo tất định, gieo từ (user, bài tập, lượt thứ mấy), nên lúc chấm
-- dựng lại đúng thứ tự đã hiển thị mà không cần bảng trạng thái nào.

ALTER TABLE public.knowledge_exercises
  ADD COLUMN IF NOT EXISTS shuffle_questions boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS shuffle_options   boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.knowledge_exercises.shuffle_questions IS
  'Tráo thứ tự câu hỏi theo từng người và từng lượt thi.';
COMMENT ON COLUMN public.knowledge_exercises.shuffle_options IS
  'Tráo thứ tự đáp án. Chấm điểm tự dịch ngược về chỉ số gốc.';
