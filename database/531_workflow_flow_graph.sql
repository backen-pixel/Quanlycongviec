-- Migration 531: đồ thị luồng module — cạnh nối, nhánh song song và điều kiện.
--
-- Trước đây luồng chỉ là chuỗi thẳng theo order_index; cạnh vẽ trên canvas bị bỏ đi khi lưu.
-- Migration này lưu đồ thị thật: node có toạ độ + kiểu rẽ nhánh, cạnh nằm ở bảng riêng,
-- điều kiện gắn được vào node hoặc vào cạnh và chỉ trỏ tới cấu hình đã có sẵn
-- (crm_task_template_items / workshop_task_template_items / các cột pipeline).
--
-- order_index vẫn giữ nguyên ý nghĩa chuỗi tuyến tính (thứ tự topo) để runtime cũ không đổi hành vi.

-- ═══ 1. Node: id ổn định, toạ độ, kiểu rẽ nhánh / gộp nhánh ═══

ALTER TABLE workflow_flow_steps
  ADD COLUMN IF NOT EXISTS node_id TEXT,
  ADD COLUMN IF NOT EXISTS position_x NUMERIC,
  ADD COLUMN IF NOT EXISTS position_y NUMERIC,
  ADD COLUMN IF NOT EXISTS branch_mode TEXT DEFAULT 'sequential',
  ADD COLUMN IF NOT EXISTS join_mode TEXT DEFAULT 'all';

COMMENT ON COLUMN workflow_flow_steps.node_id IS
  'Id ổn định của node trên canvas — khoá để workflow_flow_edges tham chiếu';
COMMENT ON COLUMN workflow_flow_steps.branch_mode IS
  'sequential (1-1) | parallel (1-N chạy song song) | conditional (1-N rẽ theo điều kiện)';
COMMENT ON COLUMN workflow_flow_steps.join_mode IS
  'all (chờ đủ mọi nhánh vào) | any (nhánh nào xong trước thì chạy) — dùng khi node có nhiều cạnh vào';

UPDATE workflow_flow_steps
SET node_id = id::text
WHERE node_id IS NULL OR btrim(node_id) = '';

UPDATE workflow_flow_steps
SET branch_mode = 'sequential'
WHERE branch_mode IS NULL;

UPDATE workflow_flow_steps
SET join_mode = 'all'
WHERE join_mode IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_wfs_branch_mode'
  ) THEN
    ALTER TABLE workflow_flow_steps
      ADD CONSTRAINT chk_wfs_branch_mode
      CHECK (branch_mode IS NULL OR branch_mode IN ('sequential', 'parallel', 'conditional'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'chk_wfs_join_mode'
  ) THEN
    ALTER TABLE workflow_flow_steps
      ADD CONSTRAINT chk_wfs_join_mode
      CHECK (join_mode IS NULL OR join_mode IN ('all', 'any'));
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_wfs_flow_node
  ON workflow_flow_steps(flow_id, node_id)
  WHERE node_id IS NOT NULL;

-- ═══ 2. Cạnh nối giữa các node ═══

CREATE TABLE IF NOT EXISTS workflow_flow_edges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES workflow_flows(id) ON DELETE CASCADE,
  source_node_id TEXT NOT NULL,
  target_node_id TEXT NOT NULL,
  label TEXT,
  condition_logic TEXT NOT NULL DEFAULT 'all',
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT chk_wfe_condition_logic CHECK (condition_logic IN ('all', 'any')),
  CONSTRAINT chk_wfe_not_self CHECK (source_node_id <> target_node_id)
);

COMMENT ON TABLE workflow_flow_edges IS
  'Cạnh của đồ thị luồng module — cho phép rẽ nhánh (1-N) và gộp nhánh (N-N)';
COMMENT ON COLUMN workflow_flow_edges.condition_logic IS
  'all = phải thoả mọi điều kiện của cạnh | any = thoả bất kỳ điều kiện nào';

CREATE UNIQUE INDEX IF NOT EXISTS uq_wfe_flow_pair
  ON workflow_flow_edges(flow_id, source_node_id, target_node_id);
CREATE INDEX IF NOT EXISTS idx_wfe_flow ON workflow_flow_edges(flow_id);

-- ═══ 3. Điều kiện gắn vào node hoặc cạnh ═══

CREATE TABLE IF NOT EXISTS workflow_flow_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  flow_id UUID NOT NULL REFERENCES workflow_flows(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'step',
  step_node_id TEXT,
  edge_id UUID REFERENCES workflow_flow_edges(id) ON DELETE CASCADE,
  condition_type TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_required BOOLEAN NOT NULL DEFAULT true,
  order_index INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT chk_wfc_scope CHECK (scope IN ('step', 'edge')),
  CONSTRAINT chk_wfc_target CHECK (
    (scope = 'step' AND step_node_id IS NOT NULL)
    OR (scope = 'edge' AND edge_id IS NOT NULL)
  ),
  CONSTRAINT chk_wfc_type CHECK (
    condition_type IN ('task_item_done', 'stage_reached', 'stage_flag')
  )
);

COMMENT ON TABLE workflow_flow_conditions IS
  'Điều kiện của luồng — chỉ trỏ tới cấu hình đã có sẵn, không nhân bản cờ';
COMMENT ON COLUMN workflow_flow_conditions.condition_type IS
  'task_item_done: nhiệm vụ mẫu phải hoàn tất (kèm yêu cầu ảnh/ghi chú đã cài trên chính nhiệm vụ đó)'
  ' | stage_reached: đã tới cột chỉ định | stage_flag: cột hiện tại mang cờ chỉ định';
COMMENT ON COLUMN workflow_flow_conditions.config IS
  'JSON: { source: crm|production|logistics, company_id, pipeline_id, stage_id, template_id, item_ids[], flag }';

CREATE INDEX IF NOT EXISTS idx_wfc_flow ON workflow_flow_conditions(flow_id);
CREATE INDEX IF NOT EXISTS idx_wfc_step ON workflow_flow_conditions(flow_id, step_node_id);
CREATE INDEX IF NOT EXISTS idx_wfc_edge ON workflow_flow_conditions(edge_id);

-- ═══ 4. RLS đồng bộ với workflow_flows ═══

ALTER TABLE workflow_flow_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_flow_conditions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS allow_all ON workflow_flow_edges;
CREATE POLICY allow_all ON workflow_flow_edges FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS allow_all ON workflow_flow_conditions;
CREATE POLICY allow_all ON workflow_flow_conditions FOR ALL USING (true) WITH CHECK (true);

-- ═══ 5. Backfill cạnh cho luồng cũ theo chuỗi order_index ═══

INSERT INTO workflow_flow_edges (flow_id, source_node_id, target_node_id, order_index)
SELECT cur.flow_id, cur.node_id, nxt.node_id, cur.order_index
FROM workflow_flow_steps cur
JOIN LATERAL (
  SELECT s.node_id
  FROM workflow_flow_steps s
  WHERE s.flow_id = cur.flow_id
    AND s.order_index > cur.order_index
    AND s.node_id IS NOT NULL
  ORDER BY s.order_index
  LIMIT 1
) nxt ON true
WHERE cur.node_id IS NOT NULL
ON CONFLICT (flow_id, source_node_id, target_node_id) DO NOTHING;
