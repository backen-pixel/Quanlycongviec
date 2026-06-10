-- Checklist con cho nhiệm vụ CRM / Sản xuất (lưu JSONB ngay trên crm_tasks).
-- Mỗi phần tử: { id, title, description, done }.
-- Dùng cho tab Nhiệm vụ (CRMTasksTab) hiển thị ở chi tiết deal CRM và workshop sản xuất.
ALTER TABLE crm_tasks
  ADD COLUMN IF NOT EXISTS checklist jsonb NOT NULL DEFAULT '[]'::jsonb;
