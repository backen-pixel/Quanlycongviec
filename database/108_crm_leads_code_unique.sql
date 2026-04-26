-- =====================================================================
-- 108_crm_leads_code_unique.sql
-- Bổ sung UNIQUE INDEX cho cột crm_leads.code (chỉ áp dụng cho row type='lead'
-- để khỏi xung đột với các row 'deal' có thể trùng code lịch sử).
-- Mục đích: ngăn race condition khi auto-pipeline chạy nhiều worker tạo lead
-- cùng lúc -> insert trùng code không còn được DB nhận lén lút nữa, mã retry
-- ở backend (createLeadFromFacebook) mới có cơ hội kích hoạt.
-- =====================================================================

-- 1) Kiểm tra & xóa partial unique index cũ nếu có (idempotent)
DROP INDEX IF EXISTS public.idx_crm_leads_code_unique_lead;

-- 2) Tạo partial unique index mới (chỉ cho leads, bỏ qua các deal/v.v.)
CREATE UNIQUE INDEX idx_crm_leads_code_unique_lead
  ON public.crm_leads (code)
  WHERE type = 'lead' AND code IS NOT NULL;

-- 3) Index hỗ trợ tra cứu MAX(code) nhanh khi tạo lead mới
CREATE INDEX IF NOT EXISTS idx_crm_leads_code_lead_pattern
  ON public.crm_leads (code DESC)
  WHERE type = 'lead' AND code LIKE 'LEAD-%';
