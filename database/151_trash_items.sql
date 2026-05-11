-- 151: Thùng rác (xóa giả / soft-delete) cho lead, deal và file ghi chú.
--
-- Mục tiêu: khi user lỡ xóa lead/deal hoặc file ghi chú/đính kèm thì admin có
-- thể vào trang "Thùng rác" để phục hồi (restore) lại bản gốc.
--
-- Cách hoạt động:
--   1. Khi DELETE /crm/leads/:id (hoặc các endpoint xóa khác) chạy, backend
--      sẽ snapshot toàn bộ row (kèm row con: lead_documents, crm_tasks,
--      crm_activities, lead children…) vào `trash_items` rồi mới xóa thật.
--   2. Trang Thùng rác của admin gọi GET /trash để liệt kê.
--   3. Bấm "Phục hồi" → POST /trash/:id/restore → re-insert lại snapshot
--      vào các bảng gốc rồi xóa row khỏi `trash_items`.
--   4. Bấm "Xóa vĩnh viễn" → DELETE /trash/:id (chỉ admin).
--
-- Lưu ý: chúng ta cố ý không thêm cột deleted_at vào từng bảng để tránh phải
-- chỉnh sửa rất nhiều câu SELECT hiện hữu. Snapshot JSONB đơn giản & an toàn.
CREATE TABLE IF NOT EXISTS trash_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Loại entity: 'crm_lead' (cả lead lẫn deal), 'lead_document' (file ghi chú),
  -- 'crm_task_attachment' (đính kèm trong task CRM)
  entity_type text NOT NULL,
  -- ID gốc trong bảng nguồn (để tránh restore trùng)
  entity_id uuid NOT NULL,
  -- Tên/nhãn để hiển thị trên UI Thùng rác
  entity_label text,
  -- company_id để admin công ty chỉ thấy thùng rác công ty mình
  company_id uuid,
  -- Toàn bộ dữ liệu để phục hồi (row gốc + các row liên quan)
  snapshot jsonb NOT NULL,
  -- Ai và khi nào xóa
  deleted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  deleted_at timestamptz NOT NULL DEFAULT now(),
  -- Tự động dọn sau N ngày (mặc định 30 ngày, NULL = giữ vô hạn)
  purge_after timestamptz DEFAULT (now() + interval '30 days'),
  CONSTRAINT trash_items_entity_unique UNIQUE (entity_type, entity_id)
);

CREATE INDEX IF NOT EXISTS trash_items_deleted_at_idx ON trash_items (deleted_at DESC);
CREATE INDEX IF NOT EXISTS trash_items_company_idx ON trash_items (company_id, deleted_at DESC);
CREATE INDEX IF NOT EXISTS trash_items_entity_type_idx ON trash_items (entity_type);

ALTER TABLE trash_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "trash_items_service_all" ON trash_items;
CREATE POLICY "trash_items_service_all"
  ON trash_items
  FOR ALL
  USING (true);
