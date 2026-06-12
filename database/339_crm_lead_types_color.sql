-- 339: Màu hiển thị cho phân loại Lead/Deal (crm_lead_types.color)
-- Backend list CRM embed `lead_type(id, name, color)` — thiếu cột gây 500 khi hydrate deal/lead.

ALTER TABLE crm_lead_types
  ADD COLUMN IF NOT EXISTS color TEXT;

COMMENT ON COLUMN crm_lead_types.color IS
  'Màu badge phân loại trên Kanban/List CRM (hex hoặc tên màu Tailwind).';
