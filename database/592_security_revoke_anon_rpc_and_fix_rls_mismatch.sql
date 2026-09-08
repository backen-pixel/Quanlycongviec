-- ══════════════════════════════════════════════════════════════════════════
-- 592 — Thu quyền RPC khỏi anon + vá lệch RLS/policy
-- Ngày: 08/09/2026   (đã áp lên qlycv kdxypztstbeovyedmvem)
--
-- Căn cứ đo được trước khi sửa:
--   • delete_user_hard / projects_recompute_has_crm_deal / increment_public_share_view
--     đều SECURITY DEFINER và anon gọi được qua /rest/v1/rpc. Cả ba chỉ được gọi
--     từ backend Express bằng service_role (đã grep toàn bộ backend/src + frontend/src).
--   • product_code_parts: RLS TẮT nhưng có 2 policy USING(true) → policy chết,
--     anon có đủ SELECT/INSERT/UPDATE/DELETE ⇒ ai cầm anon key đều sửa xoá được.
--   • public_share_links: RLS BẬT, 0 policy ⇒ đã chặn sạch anon/authenticated.
--     Đây là trạng thái ĐÚNG, không thêm policy đọc — thêm vào là mở cho anon
--     liệt kê toàn bộ link chia sẻ. Trang share đi qua Express bằng service_role.
--   • service_role có rolbypassrls = true ⇒ bật RLS không ảnh hưởng backend.
-- ══════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. RPC SECURITY DEFINER: chỉ service_role được gọi ───────────────────
REVOKE ALL ON FUNCTION public.delete_user_hard(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_hard(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.projects_recompute_has_crm_deal(uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.projects_recompute_has_crm_deal(uuid[]) TO service_role;

REVOKE ALL ON FUNCTION public.increment_public_share_view(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_public_share_view(uuid) TO service_role;

-- Hai hàm trigger trg_crm_deal_projects_sync_has_crm_deal / trg_crm_leads_sync_has_crm_deal
-- CỐ TÌNH giữ nguyên: kiểu trả về `trigger` nên PostgREST không gọi được
-- (lỗi 0A000), thu quyền chỉ thêm rủi ro cho trigger mà không đóng lỗ nào.

-- ─── 2. product_code_parts: policy USING(true) là policy giả ──────────────
DROP POLICY IF EXISTS product_code_parts_read  ON public.product_code_parts;
DROP POLICY IF EXISTS product_code_parts_write ON public.product_code_parts;
ALTER TABLE public.product_code_parts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.product_code_parts FROM anon, authenticated;

COMMENT ON TABLE public.product_code_parts IS
  'Chỉ backend (service_role) đọc/ghi qua /api/products. RLS bật + 0 policy = chặn sạch anon/authenticated. Không thêm policy USING(true) — đó là policy giả.';

-- ─── 3. public_share_links: ghi rõ vì sao 0 policy là đúng ────────────────
COMMENT ON TABLE public.public_share_links IS
  'RLS bật + 0 policy là CỐ Ý: trang chia sẻ công khai đi qua Express /api/public/share/:token bằng service_role. Thêm policy đọc cho anon = mở cho anon liệt kê toàn bộ link + payload.';

COMMIT;
