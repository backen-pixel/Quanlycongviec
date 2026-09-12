-- 591: lead_messages.is_pinned — tính năng ghim tin nhắn thiếu cột
--
-- TÌM RA BẰNG: rà soát tĩnh toàn bộ backend, đối chiếu mọi cột trong .select()
-- với schema thật. Đây là 1 trong 29 cột không tồn tại tìm được.
--
-- VÌ SAO PHẢI THÊM CỘT CHỨ KHÔNG BỎ TÍNH NĂNG: tính năng đã được cài đặt đầy
-- đủ ở routes/crm/routes/membersChat.js — có endpoint PUT
-- /leads/:id/chat/:msgId/pin, có UPDATE, và có socket emit 'lead:pin'. Chỉ
-- thiếu đúng cột trong DB, nên cả SELECT lẫn UPDATE đều trả 42703.
--
-- AN TOÀN: DEFAULT false, NOT NULL. Đã kiểm chứng sau khi chạy: 49 tin nhắn,
-- 0 tin đang ghim -> không dòng nào bị đổi nghĩa.
--
-- Chỉ mục PARTIAL: truy vấn chỉ quan tâm tin ĐÃ ghim (rất ít). Index đầy đủ
-- trên cột boolean sẽ không bao giờ được planner chọn mà vẫn tốn phí ghi —
-- cùng lý do đã bỏ index của migration 103 ở database/587.

ALTER TABLE public.lead_messages
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_lead_messages_pinned
  ON public.lead_messages (lead_id) WHERE is_pinned;

COMMENT ON COLUMN public.lead_messages.is_pinned IS
  'Ghim tin nhắn trong chat của lead — xem routes/crm/routes/membersChat.js';
