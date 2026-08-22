-- Migration 538: nhật ký chạy thử bộ điều hướng luồng theo đồ thị.
--
-- Bộ điều hướng mới đi theo workflow_flow_edges và chấm điều kiện thật, thay cho
-- cách cũ đọc mảng phẳng order_index. Trong giai đoạn chạy bóng nó không chặn gì —
-- chỉ ghi lại kết quả của cả hai cách để đối chiếu. Khi số dòng diverged = true
-- đã về mức chấp nhận được thì bật FLOW_RUNTIME_ENFORCE=1 cho kết quả đồ thị có hiệu lực.

CREATE TABLE IF NOT EXISTS workflow_flow_runtime_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID REFERENCES workflow_flows(id) ON DELETE CASCADE,
  gate TEXT NOT NULL,
  subject_type TEXT,
  subject_id UUID,
  enforced BOOLEAN NOT NULL DEFAULT false,
  diverged BOOLEAN NOT NULL DEFAULT false,
  legacy_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  graph_result JSONB NOT NULL DEFAULT '{}'::jsonb,
  trace JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE workflow_flow_runtime_log IS
  'Đối chiếu bộ điều hướng luồng cũ (mảng phẳng) với bộ mới (đồ thị) trước khi cho chặn thật';
COMMENT ON COLUMN workflow_flow_runtime_log.gate IS
  'production_create = tạo dự án SX từ deal thắng | production_handoff = bàn giao sau SX';
COMMENT ON COLUMN workflow_flow_runtime_log.diverged IS
  'true = hai cách cho kết quả khác nhau, cần xem lại luồng hoặc điều kiện trước khi bật chặn';
COMMENT ON COLUMN workflow_flow_runtime_log.trace IS
  'Vết đi qua từng cạnh: cạnh nào đạt, cạnh nào trượt, điều kiện nào không chấm được';

CREATE INDEX IF NOT EXISTS idx_wfrl_flow ON workflow_flow_runtime_log(flow_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wfrl_diverged ON workflow_flow_runtime_log(diverged, created_at DESC)
  WHERE diverged = true;
CREATE INDEX IF NOT EXISTS idx_wfrl_subject ON workflow_flow_runtime_log(subject_type, subject_id);

ALTER TABLE workflow_flow_runtime_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON workflow_flow_runtime_log;
CREATE POLICY allow_all ON workflow_flow_runtime_log FOR ALL USING (true) WITH CHECK (true);
