-- Migration 537: node_kind + node_config — khối điều khiển / hành động đặc biệt trên luồng.
--
-- Trước đây mọi bước đều là module (CRM / SX / Lắp đặt). Cột này cho phép chèn
-- điều kiện, chờ, duyệt, lấy báo cáo, AI nhắc deadline… giữa các module
-- mà runtime cũ vẫn bỏ qua (chỉ đọc bước có module_key).

ALTER TABLE workflow_flow_steps
  ADD COLUMN IF NOT EXISTS node_kind TEXT DEFAULT 'module',
  ADD COLUMN IF NOT EXISTS node_config JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE workflow_flow_steps
SET node_kind = 'module'
WHERE node_kind IS NULL OR btrim(node_kind) = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_wfs_node_kind'
  ) THEN
    ALTER TABLE workflow_flow_steps
      ADD CONSTRAINT chk_wfs_node_kind
      CHECK (node_kind IN (
        'module', 'condition', 'fork', 'join', 'wait', 'approve', 'end',
        'report', 'ai_deadline', 'notify'
      ));
  END IF;
END $$;

COMMENT ON COLUMN workflow_flow_steps.node_kind IS
  'module = bước nghiệp vụ | condition/fork/join/wait/approve/end = điều khiển | report/ai_deadline/notify = hành động đặc biệt';
COMMENT ON COLUMN workflow_flow_steps.node_config IS
  'Cấu hình theo loại node (kỳ báo cáo, cửa sổ deadline, số ngày chờ, kênh gửi…).';

CREATE INDEX IF NOT EXISTS idx_wfs_node_kind
  ON workflow_flow_steps(flow_id, node_kind);
