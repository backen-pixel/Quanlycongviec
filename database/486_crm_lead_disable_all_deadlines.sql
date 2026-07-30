-- Tắt toàn bộ nguồn deadline theo từng Lead/Deal.
-- Khi bật cờ này, UI bỏ qua deadline nhiệm vụ, deadline thẻ, ngày dự kiến chốt và SLA cột.

ALTER TABLE public.crm_leads
  ADD COLUMN IF NOT EXISTS deadline_disabled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deadline_disabled_reason TEXT,
  -- Không tạo FK để tương thích backup legacy (users.id chưa có unique constraint).
  ADD COLUMN IF NOT EXISTS deadline_disabled_by UUID;

COMMENT ON COLUMN public.crm_leads.deadline_disabled_at IS
  'Có giá trị khi toàn bộ deadline của Lead/Deal đang bị tắt thủ công.';
COMMENT ON COLUMN public.crm_leads.deadline_disabled_reason IS
  'Lý do bắt buộc khi tắt toàn bộ deadline.';
COMMENT ON COLUMN public.crm_leads.deadline_disabled_by IS
  'Người thực hiện tắt toàn bộ deadline.';

CREATE INDEX IF NOT EXISTS idx_crm_leads_deadline_disabled
  ON public.crm_leads (deadline_disabled_at)
  WHERE deadline_disabled_at IS NOT NULL;
