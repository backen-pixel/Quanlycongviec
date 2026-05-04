-- Lịch sử chỉnh sửa báo giá (tạo / cập nhật)

CREATE TABLE IF NOT EXISTS quotation_edit_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  summary TEXT,
  detail JSONB,
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_quotation_edit_history_q ON quotation_edit_history(quotation_id, created_at DESC);

ALTER TABLE quotation_edit_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_all_quotation_edit_history" ON quotation_edit_history FOR ALL USING (true);

COMMENT ON TABLE quotation_edit_history IS 'Audit trail chỉnh sửa báo giá';
