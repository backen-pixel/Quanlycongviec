-- 168: Tách yêu cầu minh chứng khi hoàn thành NV CRM: ghi chú KH vs minh chứng liên hệ (ghi chú hoặc file).
-- Phục vụ KPI B1 (ghi âm HOẶC NV đạt cấu hình mẫu). Idempotent.

BEGIN;

ALTER TABLE crm_task_template_items
  ADD COLUMN IF NOT EXISTS completion_requires_customer_note BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE crm_task_template_items
  ADD COLUMN IF NOT EXISTS completion_requires_customer_contact BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN crm_task_template_items.completion_requires_customer_note IS
  'True: khi hoàn thành task, bắt buộc có nội dung ghi chú (notes) trên task.';

COMMENT ON COLUMN crm_task_template_items.completion_requires_customer_contact IS
  'True: khi hoàn thành task, bắt buộc có ghi chú task hoặc file/ghi chú đính kèm (minh chứng liên hệ).';

ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS completion_requires_customer_note BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS completion_requires_customer_contact BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN crm_tasks.completion_requires_customer_note IS
  'Kế thừa từ mẫu; bắt buộc ghi chú khi completed.';

COMMENT ON COLUMN crm_tasks.completion_requires_customer_contact IS
  'Kế thừa từ mẫu; bắt buộc ghi chú hoặc đính kèm khi completed.';

-- Cờ cũ «file hoặc ghi chú» → coi là minh chứng liên hệ (contact)
UPDATE crm_task_template_items
SET completion_requires_customer_contact = true
WHERE completion_requires_file_or_note = true
  AND completion_requires_customer_contact = false;

UPDATE crm_tasks
SET completion_requires_customer_contact = true
WHERE completion_requires_file_or_note = true
  AND completion_requires_customer_contact = false;

UPDATE kpi_definitions
SET
  name = 'Tỷ lệ minh chứng tiếp xúc',
  description = '% lead có ít nhất một ghi âm gắn lead trong kỳ, hoặc hoàn thành đúng nhiệm vụ CRM được cấu hình (ghi chú khách hàng / minh chứng liên hệ).',
  data_source_note = 'voice_recordings theo lead_id trong kỳ; crm_tasks completed trong kỳ với cờ yêu cầu ghi chú KH hoặc minh chứng liên hệ (kèm cờ cũ file/ghi chú).',
  updated_at = NOW()
WHERE code = 'B1';

COMMIT;
