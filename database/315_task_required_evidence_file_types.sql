-- 315: Cấu hình loại file/ghi chú bắt buộc khi hoàn thành nhiệm vụ (mẫu + task thực tế).
-- required_evidence_file_types: JSON array slug, ví dụ ["sketchup","render","note"].
-- Idempotent.

BEGIN;

ALTER TABLE workshop_task_template_items
  ADD COLUMN IF NOT EXISTS completion_requires_file_or_note BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE workshop_task_template_items
  ADD COLUMN IF NOT EXISTS required_evidence_file_types JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN workshop_task_template_items.completion_requires_file_or_note IS
  'True: bắt buộc minh chứng trước khi hoàn thành / chặn chuyển pipeline (xem required_evidence_file_types).';

COMMENT ON COLUMN workshop_task_template_items.required_evidence_file_types IS
  'Danh sách loại minh chứng bắt buộc: note, image, sketchup, autocad, render, document, excel, video, archive, other. Rỗng + cờ file/note = bất kỳ file/ghi chú.';

ALTER TABLE crm_task_template_items
  ADD COLUMN IF NOT EXISTS required_evidence_file_types JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN crm_task_template_items.required_evidence_file_types IS
  'Danh sách loại file/ghi chú bắt buộc khi hoàn thành NV CRM (cùng slug với workshop).';

ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS required_evidence_file_types JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN crm_tasks.required_evidence_file_types IS
  'Kế thừa từ mẫu; kiểm tra khi status → completed hoặc chặn chuyển giai đoạn.';

ALTER TABLE crm_assignments
  ADD COLUMN IF NOT EXISTS completion_requires_file_or_note BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE crm_assignments
  ADD COLUMN IF NOT EXISTS required_evidence_file_types JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN crm_assignments.required_evidence_file_types IS
  'Loại file nộp bài (sub) bắt buộc trên Giao việc CRM/SX khi hoàn thành.';

COMMIT;
