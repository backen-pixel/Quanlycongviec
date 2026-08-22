-- Migration 539: thêm loại node ai_report — AI biến số liệu thành đoạn báo cáo.
--
-- Chuỗi dùng được ngay sau migration này: [Lấy báo cáo] → [AI viết báo cáo] → [Nhắn tin].
-- Node Lấy báo cáo kéo số liệu ra, node AI đọc số liệu đó và viết thành lời,
-- node Nhắn tin đẩy kết quả ra nhóm chat / phòng ban / Zalo / thông báo trong app.

ALTER TABLE workflow_flow_steps DROP CONSTRAINT IF EXISTS chk_wfs_node_kind;

ALTER TABLE workflow_flow_steps
  ADD CONSTRAINT chk_wfs_node_kind
  CHECK (node_kind IN (
    'module', 'condition', 'fork', 'join', 'wait', 'approve', 'end',
    'report', 'ai_deadline', 'notify', 'ai_report'
  ));

COMMENT ON COLUMN workflow_flow_steps.node_kind IS
  'module = bước nghiệp vụ | condition/fork/join/wait/approve/end = điều khiển'
  ' | report/ai_report/ai_deadline/notify = hành động đặc biệt';

-- Nhật ký chạy chuỗi hành động: xem lần chạy nào gửi được, gửi cho ai, AI viết gì.
CREATE TABLE IF NOT EXISTS workflow_flow_action_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID REFERENCES workflow_flows(id) ON DELETE CASCADE,
  node_id TEXT,
  node_kind TEXT,
  status TEXT NOT NULL DEFAULT 'ok',
  dry_run BOOLEAN NOT NULL DEFAULT false,
  triggered_by UUID,
  input_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  output_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  error TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE workflow_flow_action_runs IS
  'Mỗi lần một khối hành động chạy — dùng để soi vì sao tin không gửi được';

CREATE INDEX IF NOT EXISTS idx_wfar_flow ON workflow_flow_action_runs(flow_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wfar_status ON workflow_flow_action_runs(status, created_at DESC);

ALTER TABLE workflow_flow_action_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS allow_all ON workflow_flow_action_runs;
CREATE POLICY allow_all ON workflow_flow_action_runs FOR ALL USING (true) WITH CHECK (true);
