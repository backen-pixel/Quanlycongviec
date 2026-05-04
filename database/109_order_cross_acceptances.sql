-- Ghi nhận nghiệm thu / đối soát chéo giữa CRM–kế toán–SX–VC theo từng đơn hàng (tuỳ chọn)
CREATE TABLE IF NOT EXISTS order_cross_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  check_type TEXT NOT NULL DEFAULT 'crm_vs_orders',
  status TEXT NOT NULL DEFAULT 'accepted',
  notes TEXT,
  checked_by UUID REFERENCES users(id) ON DELETE SET NULL,
  checked_at TIMESTAMPTZ DEFAULT now(),
  snapshot_order_total NUMERIC,
  snapshot_lead_value NUMERIC,
  snapshot_project_value NUMERIC,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(order_id, check_type)
);

CREATE INDEX IF NOT EXISTS idx_order_cross_acceptances_order ON order_cross_acceptances(order_id);
COMMENT ON TABLE order_cross_acceptances IS 'Đối soát/nghiệm thu chéo giữa các module (ghi nhận thủ công sau khi đã đối chiếu số liệu đơn hàng).';
