-- 716 — Học lại sau khi trượt hết lượt thi
--
-- VẤN ĐỀ
-- `knowledge_exercises.max_attempts` đã chặn đúng: hết lượt thì API trả «Đã hết lượt làm bài».
-- Nhưng người học bị KHOÁ CỨNG ở đó — tiến độ bài không bị đặt lại, không có đường đi tiếp
-- ngoài việc quản trị sửa tay trong DB. Yêu cầu nghiệp vụ: trượt cả 3 lượt thì bắt học lại
-- từ đầu rồi được thi tiếp.
--
-- CÁCH LÀM
-- Thêm một bảng mốc chu kỳ. Lượt thi đếm từ lần đặt lại GẦN NHẤT thay vì đếm toàn bộ lịch sử.
-- Chọn bảng riêng thay vì thêm cột `cycle` vào `knowledge_exercise_submissions` vì:
--   - Không đụng tới 1 dòng dữ liệu bài nộp nào đang có.
--   - Lịch sử bài nộp cũ giữ nguyên để đối chiếu, không bị ghi đè hay đánh số lại.
--   - Không phải chèn dòng «reset» giả vào bảng bài nộp — dòng giả sẽ hiện lẫn trong lịch sử
--     làm bài mà người học nhìn thấy.
--
-- Bảng này chỉ ghi THÊM, không bao giờ sửa hay xoá dòng cũ: mỗi lần bắt học lại là một dòng mới.

CREATE TABLE IF NOT EXISTS public.knowledge_exercise_resets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id uuid NOT NULL REFERENCES public.knowledge_exercises(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL,
  reset_at    timestamptz NOT NULL DEFAULT now(),
  -- Vì sao phải học lại. Hiện chỉ có 'het_luot', để dành cho trường hợp quản trị mở lại tay.
  reason      text NOT NULL DEFAULT 'het_luot',
  -- Số bài đã đặt về chưa học, ghi lại để đối chiếu khi cần.
  lessons_reset integer NOT NULL DEFAULT 0
);

-- Truy vấn nóng: «lần đặt lại gần nhất của người này ở bài tập này».
CREATE INDEX IF NOT EXISTS knowledge_exercise_resets_user_ex_idx
  ON public.knowledge_exercise_resets (user_id, exercise_id, reset_at DESC);

COMMENT ON TABLE public.knowledge_exercise_resets IS
  'Mốc bắt học lại sau khi trượt hết lượt thi. Lượt thi đếm từ reset_at gần nhất.';
