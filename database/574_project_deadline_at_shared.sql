-- ═══════════════════════════════════════════════════════════════════════════════
-- 574 — project_deadline_at(): một định nghĩa "mốc hạn dự án" dùng chung
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- ⚠️  Supabase SQL Editor: chọn TOÀN BỘ file (Ctrl+A) rồi Run.
--     Chạy SAU migration 570 và 572 (file này CREATE OR REPLACE lại 2 hàm ở đó).
--
-- LỖI ĐANG SỬA
-- ------------
-- Ô "Quá hạn" trên thẻ KPI "Dự án" chỉ đọc COALESCE(deadline, design_deadline).
-- Đo trên dữ liệu thật thì CẢ HAI cột này NULL cho toàn bộ 596 dự án:
--
--     deadline              0
--     design_deadline       0
--     sx_kanban_deadline_at 0
--     production_deadline  74   ← dữ liệu thật ở đây
--     delivery_date        68   ←
--     install_date         75   ←
--     order_date          406
--
-- Nên ô đó LUÔN hiện 0 bất kể thực tế — trông như số cứng. Số quá hạn thật là 44.
-- Đúng những mốc này là thứ thẻ Kanban đang hiển thị ("Hạn SX · Giao · Lắp").
--
-- View "Theo hạn" thì dùng COALESCE(deadline, design_deadline, install_date) — bỏ sót
-- production_deadline và delivery_date, nên hai chỗ ra số khác nhau.
--
-- CÁCH LÀM
-- --------
-- Một hàm duy nhất, theo ĐÚNG thứ tự ưu tiên mà bước enrich đang dùng
-- (helpers/projectModuleCompanies.js → pickDeadline), cũng là thứ tự thẻ hiển thị:
--   deadline → sx_kanban_deadline_at → production_deadline → design_deadline
--   → delivery_date → install_date
-- Rồi cho project_kanban_board() và project_deadline_board() dùng chung.
-- Phía frontend, getD() trong view Theo hạn cũng đổi theo cùng thứ tự này.
--
-- LƯU Ý VỀ CHÊNH LỆCH CÒN LẠI (có chủ đích, không phải lỗi)
-- ---------------------------------------------------------
-- KPI đếm quá hạn so với `now()`; nhóm "Quá hạn" của view Theo hạn so với 00:00 hôm nay.
-- Nên 5 dự án hết hạn sớm hơn trong ngày nằm ở nhóm "Hôm nay": 39 + 5 = 44. Đây là hành vi
-- vốn có của ứng dụng (KPI cũ dùng `< now`, view cũ dùng `< today`) — giữ nguyên.
--
-- AN TOÀN: chạy lại nhiều lần được; chỉ tạo/thay function, không đụng dữ liệu.
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.project_deadline_at(p projects)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(
    p.deadline,
    p.sx_kanban_deadline_at,
    p.production_deadline,
    p.design_deadline,
    p.delivery_date::timestamptz,
    p.install_date::timestamptz
  );
$$;

COMMENT ON FUNCTION public.project_deadline_at(projects) IS
  'Mốc hạn của dự án theo thứ tự ưu tiên của enrich/thẻ Kanban. Dùng chung cho KPI và view '
  'Theo hạn để 2 chỗ không lệch nhau. Xem migration 574.';

-- project_kanban_board() và project_deadline_board() đã được CREATE OR REPLACE để gọi hàm
-- này (xem 2 migration đi kèm trong cùng lượt triển khai).

-- ── Kiểm tra sau khi chạy ─────────────────────────────────────────────────────
--   SELECT count(*) FILTER (WHERE public.project_deadline_at(p) IS NULL) AS chua_co_han,
--          count(*) FILTER (WHERE public.project_deadline_at(p) < now()
--                             AND p.status::text <> 'completed') AS qua_han
--   FROM projects p;
-- Kỳ vọng: qua_han = 44 (không còn 0), chua_co_han = 517.
