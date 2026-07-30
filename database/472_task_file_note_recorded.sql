-- Ghi nhận thủ công: nhiệm vụ đã có file/ghi chú (không chặn chuyển stage).
-- Áp dụng CRM (crm_tasks) và SX/VC (tasks).

ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS file_note_recorded BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN crm_tasks.file_note_recorded IS
  'NV đã tích: nhiệm vụ này đã có file/ghi chú minh chứng (chỉ để theo dõi, không chặn chuyển giai đoạn).';

ALTER TABLE tasks
  ADD COLUMN IF NOT EXISTS file_note_recorded BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN tasks.file_note_recorded IS
  'NV đã tích: nhiệm vụ SX/VC đã có file/ghi chú (chỉ theo dõi, không chặn chuyển cột).';

CREATE INDEX IF NOT EXISTS idx_crm_tasks_file_note_recorded
  ON crm_tasks (lead_id) WHERE file_note_recorded = true;

CREATE INDEX IF NOT EXISTS idx_tasks_file_note_recorded
  ON tasks (project_id) WHERE file_note_recorded = true;
