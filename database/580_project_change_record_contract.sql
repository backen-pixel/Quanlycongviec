-- 580: Standard Project change record contract on the existing incident source.
-- Additive only: legacy incident rows remain valid and no parallel change table is created.

BEGIN;

ALTER TABLE project_incidents
  ADD COLUMN IF NOT EXISTS change_type VARCHAR(40) NOT NULL DEFAULT 'operational_incident',
  ADD COLUMN IF NOT EXISTS cause TEXT,
  ADD COLUMN IF NOT EXISTS phase_key VARCHAR(30),
  ADD COLUMN IF NOT EXISTS owner_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_impact NUMERIC(18,2),
  ADD COLUMN IF NOT EXISTS schedule_impact_days INTEGER,
  ADD COLUMN IF NOT EXISTS cost_bearer VARCHAR(30),
  ADD COLUMN IF NOT EXISTS requires_approval BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) NOT NULL DEFAULT 'not_required',
  ADD COLUMN IF NOT EXISTS approval_notes TEXT,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_reason TEXT,
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS related_links JSONB NOT NULL DEFAULT '[]'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_incidents_change_type_check') THEN
    ALTER TABLE project_incidents ADD CONSTRAINT project_incidents_change_type_check CHECK (
      change_type IN (
        'operational_incident', 'customer_request', 'design_change', 'material_change',
        'quantity_change', 'site_condition', 'rework', 'commercial_change', 'other'
      )
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_incidents_phase_key_check') THEN
    ALTER TABLE project_incidents ADD CONSTRAINT project_incidents_phase_key_check CHECK (
      phase_key IS NULL OR phase_key IN (
        'design', 'procurement', 'production', 'quality', 'packing',
        'delivery', 'installation', 'acceptance'
      )
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_incidents_cost_impact_check') THEN
    ALTER TABLE project_incidents ADD CONSTRAINT project_incidents_cost_impact_check CHECK (
      cost_impact IS NULL OR cost_impact >= 0
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_incidents_schedule_impact_days_check') THEN
    ALTER TABLE project_incidents ADD CONSTRAINT project_incidents_schedule_impact_days_check CHECK (
      schedule_impact_days IS NULL OR schedule_impact_days >= 0
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_incidents_cost_bearer_check') THEN
    ALTER TABLE project_incidents ADD CONSTRAINT project_incidents_cost_bearer_check CHECK (
      cost_bearer IS NULL OR cost_bearer IN (
        'company', 'customer', 'supplier', 'employee', 'shared', 'undetermined'
      )
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_incidents_approval_status_check') THEN
    ALTER TABLE project_incidents ADD CONSTRAINT project_incidents_approval_status_check CHECK (
      approval_status IN ('not_required', 'pending', 'approved', 'rejected')
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_incidents_attachments_array_check') THEN
    ALTER TABLE project_incidents ADD CONSTRAINT project_incidents_attachments_array_check CHECK (
      jsonb_typeof(attachments) = 'array'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'project_incidents_related_links_array_check') THEN
    ALTER TABLE project_incidents ADD CONSTRAINT project_incidents_related_links_array_check CHECK (
      jsonb_typeof(related_links) = 'array'
    );
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_project_incidents_owner_open
  ON project_incidents (owner_user_id, status)
  WHERE status IN ('open', 'in_progress');

CREATE INDEX IF NOT EXISTS idx_project_incidents_approval_pending
  ON project_incidents (project_id, approval_status)
  WHERE approval_status = 'pending';

COMMIT;
