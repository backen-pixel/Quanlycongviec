-- 192_crm_assignment_assignees.sql
-- Mở rộng "Giao việc CRM": cho phép gán 1 nhiệm vụ cho NHIỀU nhân viên.
-- Bảng junction crm_assignment_assignees + backfill từ assignee_id cũ.
-- Vẫn giữ crm_assignments.assignee_id làm "người chịu trách nhiệm chính" (= người
-- đầu tiên) để các view cũ không vỡ. Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS crm_assignment_assignees (
  assignment_id  BIGINT NOT NULL REFERENCES crm_assignments(id) ON DELETE CASCADE,
  user_id        UUID   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  completed_at   TIMESTAMPTZ,
  added_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (assignment_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_assignment_assignees_user
  ON crm_assignment_assignees (user_id);

-- Backfill từ assignee_id hiện có (nếu chưa có row tương ứng)
INSERT INTO crm_assignment_assignees (assignment_id, user_id)
SELECT a.id, a.assignee_id
FROM crm_assignments a
WHERE a.assignee_id IS NOT NULL
ON CONFLICT (assignment_id, user_id) DO NOTHING;

ALTER TABLE crm_assignment_assignees ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='crm_assignment_assignees'
      AND policyname='crm_assignment_assignees_all'
  ) THEN
    EXECUTE 'CREATE POLICY crm_assignment_assignees_all ON crm_assignment_assignees FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

COMMIT;
