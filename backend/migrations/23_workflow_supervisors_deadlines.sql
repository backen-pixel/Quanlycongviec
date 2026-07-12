-- Migration 23: Add supervisor to workflow components
-- Purpose: Allow setting supervisor per stage in flow templates

-- 1. Add supervisor to workflow_flow_steps (each step in a flow can have supervisor)
ALTER TABLE workflow_flow_steps
ADD COLUMN IF NOT EXISTS supervisor_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- 2. Add supervisor to company_template_tasks (template level)
ALTER TABLE company_template_tasks
ADD COLUMN IF NOT EXISTS supervisor_id UUID REFERENCES users(id) ON DELETE SET NULL;

-- 3. Add deadline fields to company_template_tasks
ALTER TABLE company_template_tasks
ADD COLUMN IF NOT EXISTS deadline_days INT CHECK (deadline_days >= 0),
ADD COLUMN IF NOT EXISTS deadline_hours INT CHECK (deadline_hours >= 0),
ADD COLUMN IF NOT EXISTS deadline_type TEXT CHECK (deadline_type IN ('from_start', 'from_prev_task', 'from_stage_start'));

-- 4. Add deadline fields to company_template_checklists
ALTER TABLE company_template_checklists
ADD COLUMN IF NOT EXISTS deadline_days INT CHECK (deadline_days >= 0),
ADD COLUMN IF NOT EXISTS deadline_hours INT CHECK (deadline_hours >= 0),
ADD COLUMN IF NOT EXISTS deadline_type TEXT CHECK (deadline_type IN ('from_task_start', 'from_prev_checklist', 'from_stage_start'));

-- 5. Add deadline fields to flow_step_tasks (unify with template)
ALTER TABLE flow_step_tasks
ADD COLUMN IF NOT EXISTS deadline_days INT CHECK (deadline_days >= 0),
ADD COLUMN IF NOT EXISTS deadline_hours INT CHECK (deadline_hours >= 0),
ADD COLUMN IF NOT EXISTS deadline_type TEXT CHECK (deadline_type IN ('from_start', 'from_prev_task', 'from_stage_start'));

-- 6. Add deadline fields to flow_step_task_checklists
ALTER TABLE flow_step_task_checklists
ADD COLUMN IF NOT EXISTS deadline_days INT CHECK (deadline_days >= 0),
ADD COLUMN IF NOT EXISTS deadline_hours INT CHECK (deadline_hours >= 0),
ADD COLUMN IF NOT EXISTS deadline_type TEXT CHECK (deadline_type IN ('from_task_start', 'from_prev_checklist', 'from_stage_start'));

-- 7. Add deadline to tasks table (actual deadline datetime)
ALTER TABLE tasks
ADD COLUMN IF NOT EXISTS deadline TIMESTAMPTZ;

-- 8. Add deadline to task_checklists
ALTER TABLE task_checklists
ADD COLUMN IF NOT EXISTS deadline TIMESTAMPTZ;

-- Comments
COMMENT ON COLUMN workflow_flow_steps.supervisor_id IS 'Người giám sát quy trình này trong luồng';
COMMENT ON COLUMN company_template_tasks.supervisor_id IS 'Người giám sát mặc định cho nhiệm vụ này';
COMMENT ON COLUMN company_template_tasks.deadline_days IS 'Số ngày deadline (cộng thêm với deadline_hours)';
COMMENT ON COLUMN company_template_tasks.deadline_hours IS 'Số giờ deadline (cộng thêm với deadline_days)';
COMMENT ON COLUMN company_template_tasks.deadline_type IS 'Cách tính deadline: from_start=từ ngày bắt đầu dự án, from_prev_task=từ task trước, from_stage_start=từ khi vào stage';
COMMENT ON COLUMN company_template_checklists.deadline_days IS 'Số ngày deadline cho checklist';
COMMENT ON COLUMN company_template_checklists.deadline_hours IS 'Số giờ deadline cho checklist';
COMMENT ON COLUMN company_template_checklists.deadline_type IS 'Cách tính: from_task_start=từ khi task bắt đầu, from_prev_checklist=từ checklist trước, from_stage_start=từ khi vào stage';
COMMENT ON COLUMN flow_step_tasks.deadline_days IS 'Số ngày deadline (giống template tasks)';
COMMENT ON COLUMN flow_step_tasks.deadline_hours IS 'Số giờ deadline (giống template tasks)';
COMMENT ON COLUMN flow_step_tasks.deadline_type IS 'Cách tính deadline (giống template tasks)';
COMMENT ON COLUMN flow_step_task_checklists.deadline_days IS 'Số ngày deadline cho flow checklist';
COMMENT ON COLUMN flow_step_task_checklists.deadline_hours IS 'Số giờ deadline cho flow checklist';
COMMENT ON COLUMN flow_step_task_checklists.deadline_type IS 'Cách tính deadline cho flow checklist';
COMMENT ON COLUMN tasks.deadline IS 'Deadline của nhiệm vụ (tự động tính từ template hoặc set thủ công)';
COMMENT ON COLUMN task_checklists.deadline IS 'Deadline của checklist item';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_flow_steps_supervisor ON workflow_flow_steps(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_template_tasks_supervisor ON company_template_tasks(supervisor_id);
CREATE INDEX IF NOT EXISTS idx_tasks_deadline ON tasks(deadline);
CREATE INDEX IF NOT EXISTS idx_task_checklists_deadline ON task_checklists(deadline);
