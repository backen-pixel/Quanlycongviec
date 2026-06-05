-- 285_crm_task_assignees.sql
-- Gán 1 nhiệm vụ CRM (crm_tasks) cho nhiều nhân viên.
-- Giữ crm_tasks.assignee_id làm người phụ trách chính (= người đầu tiên). Idempotent.

BEGIN;

CREATE TABLE IF NOT EXISTS crm_task_assignees (
  task_id    UUID NOT NULL REFERENCES crm_tasks(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_crm_task_assignees_user
  ON crm_task_assignees (user_id);

INSERT INTO crm_task_assignees (task_id, user_id)
SELECT t.id, t.assignee_id
FROM crm_tasks t
WHERE t.assignee_id IS NOT NULL
ON CONFLICT (task_id, user_id) DO NOTHING;

ALTER TABLE crm_task_assignees ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='crm_task_assignees'
      AND policyname='crm_task_assignees_all'
  ) THEN
    EXECUTE 'CREATE POLICY crm_task_assignees_all ON crm_task_assignees FOR ALL USING (true) WITH CHECK (true)';
  END IF;
END $$;

COMMIT;
