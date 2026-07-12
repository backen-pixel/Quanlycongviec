-- ═══════════════════════════════════════════════════════════
-- Migration 21: Flow Step Tasks & Checklists
-- Date: 2026-03-05
-- Purpose: Enable CRUD tasks/checklists per flow step
-- ═══════════════════════════════════════════════════════════

-- ─── Table: flow_step_tasks ───
CREATE TABLE IF NOT EXISTS flow_step_tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flow_step_id UUID NOT NULL REFERENCES workflow_flow_steps(id) ON DELETE CASCADE,
  
  -- Link to template task (if based on template)
  template_task_id UUID REFERENCES company_template_tasks(id) ON DELETE SET NULL,
  
  -- Task info (can override template)
  title TEXT NOT NULL,
  description TEXT,
  stage_id UUID REFERENCES workflow_stages(id),
  
  -- Assignment (specific user or field)
  assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  assigned_company_unit_id UUID REFERENCES ecosystem_units(id) ON DELETE SET NULL,
  assignee_field TEXT, -- 'sales_person', 'designer', etc. (fallback if no specific user)
  
  -- Estimation
  estimated_days INT DEFAULT 1 CHECK (estimated_days > 0),
  order_index INT DEFAULT 0,
  
  -- Metadata
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT fk_flow_step FOREIGN KEY (flow_step_id) REFERENCES workflow_flow_steps(id) ON DELETE CASCADE
);

-- ─── Table: flow_step_task_checklists ───
CREATE TABLE IF NOT EXISTS flow_step_task_checklists (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  flow_step_task_id UUID NOT NULL REFERENCES flow_step_tasks(id) ON DELETE CASCADE,
  
  -- Link to template checklist (if based on template)
  template_checklist_id UUID REFERENCES company_template_checklists(id) ON DELETE SET NULL,
  
  -- Checklist info
  label TEXT NOT NULL,
  order_index INT DEFAULT 0,
  is_required BOOLEAN DEFAULT false,
  
  -- Can assign different user for checklist
  assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT fk_flow_step_task FOREIGN KEY (flow_step_task_id) REFERENCES flow_step_tasks(id) ON DELETE CASCADE
);

-- ─── Indexes for performance ───
CREATE INDEX IF NOT EXISTS idx_flow_step_tasks_step ON flow_step_tasks(flow_step_id);
CREATE INDEX IF NOT EXISTS idx_flow_step_tasks_stage ON flow_step_tasks(stage_id);
CREATE INDEX IF NOT EXISTS idx_flow_step_tasks_assigned_user ON flow_step_tasks(assigned_user_id);
CREATE INDEX IF NOT EXISTS idx_flow_step_tasks_active ON flow_step_tasks(is_active) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_flow_step_task_checklists_task ON flow_step_task_checklists(flow_step_task_id);
CREATE INDEX IF NOT EXISTS idx_flow_step_task_checklists_assigned_user ON flow_step_task_checklists(assigned_user_id);

-- ─── Comments for documentation ───
COMMENT ON TABLE flow_step_tasks IS 'Tasks specific to flow steps (override template tasks)';
COMMENT ON COLUMN flow_step_tasks.template_task_id IS 'Link to original template task (if copied from template)';
COMMENT ON COLUMN flow_step_tasks.assigned_user_id IS 'Specific user assigned to this task (optional, overrides assignee_field)';
COMMENT ON COLUMN flow_step_tasks.assigned_company_unit_id IS 'Company of assigned user (for filtering)';
COMMENT ON COLUMN flow_step_tasks.assignee_field IS 'Field name for auto-assignment (fallback if no specific user)';

COMMENT ON TABLE flow_step_task_checklists IS 'Checklists for flow step tasks';
COMMENT ON COLUMN flow_step_task_checklists.assigned_user_id IS 'User assigned to this checklist (can be different from task)';

-- ─── Update task_checklists to support user assignment ───
-- (Only if column doesn't exist)
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'task_checklists' 
    AND column_name = 'assigned_user_id'
  ) THEN
    ALTER TABLE task_checklists
    ADD COLUMN assigned_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
    
    CREATE INDEX idx_task_checklists_assigned_user ON task_checklists(assigned_user_id);
    
    COMMENT ON COLUMN task_checklists.assigned_user_id IS 'User assigned to this checklist in project task';
  END IF;
END $$;

-- ─── Function: Auto-update updated_at ───
CREATE OR REPLACE FUNCTION update_flow_step_task_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── Trigger: Auto-update updated_at on flow_step_tasks ───
DROP TRIGGER IF EXISTS trigger_flow_step_task_updated_at ON flow_step_tasks;
CREATE TRIGGER trigger_flow_step_task_updated_at
  BEFORE UPDATE ON flow_step_tasks
  FOR EACH ROW
  EXECUTE FUNCTION update_flow_step_task_updated_at();

-- ═══════════════════════════════════════════════════════════
-- Migration complete!
-- ═══════════════════════════════════════════════════════════
