-- 250_workshop_templates_keep_global.sql
-- Dữ liệu cũ: mọi workshop_task_templates giữ production_stage_id / logistics_stage_id = NULL
-- → hiển thị trong nhóm "Bộ mẫu chung (Global)" — không cần UPDATE.

COMMENT ON TABLE workshop_task_templates IS
  'Bộ nhiệm vụ mẫu xưởng. Gắn production_stage_id / logistics_stage_id theo cột pipeline công ty; NULL = Global.';
