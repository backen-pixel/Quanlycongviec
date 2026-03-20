-- Planner: nhân viên tự sắp xếp thứ tự nhiệm vụ
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS planner_order INTEGER DEFAULT 0;

-- Index for fast planner queries
CREATE INDEX IF NOT EXISTS idx_tasks_assignee_planner
  ON tasks (assignee_id, planner_order);
