-- =====================================================================
-- 227. Drop trigger fn_auto_gen_crm_tasks (migration 39 cũ)
-- ---------------------------------------------------------------------
-- VÌ SAO PHẢI DROP:
-- Trigger fn_auto_gen_crm_tasks() chạy AFTER INSERT trên crm_leads,
-- loop qua MỌI crm_task_templates có is_active=true AND is_default=true
-- và insert items mà KHÔNG:
--   • Khử trùng theo title trong cùng stage
--   • Tôn trọng pipeline_stage_id (chỉ filter theo pipeline_type + stage_slug)
--   • Tôn trọng pipeline_id của lead/deal vừa tạo
--
-- Hệ quả: pipeline_stage có 3 template active cùng tên (do user clone) →
-- mỗi item bị insert 3 lần ⇒ deal mới hiện 9 nhiệm vụ thay vì 3.
--
-- Trigger này được tạo từ migration 39 (thời điểm chưa có
-- crm_pipeline_stages / crm_task_templates.pipeline_stage_id). Hiện
-- toàn bộ backend đã chuyển sang helper autoGenCrmTasks() — gọi tường
-- minh ở tất cả entrypoint:
--   • routes/crm.js — POST /leads (create lead), POST /leads (create deal),
--     POST /leads/:id/convert-to-deal, GET /leads/:id/tasks (fallback khi rỗng)
--   • routes/facebook.js — Facebook lead inbound
--   • routes/external.js — External API tạo lead
--   • routes/production.js — fulfillment deal con (nếu cần gen sẽ qua GET tasks)
--   • helpers/aiActions.js (AI tạo lead) — gen lại khi user mở tab Nhiệm vụ
--
-- Helper mới có:
--   • Dedupe items theo (stage_slug, pipeline_stage_id, order_index, title)
--   • Cảnh báo khi 1 pipeline_stage có >1 template active
--   • Ưu tiên template gắn pipeline_stage_id của pipeline thật
--   • Fallback Global chỉ khi lead/deal legacy không có pipeline_id
--
-- ⇒ Trigger cũ giờ là CHỖ HỎNG duy nhất sinh duplicate. Drop để app chạy
-- đúng theo logic backend.
-- =====================================================================

DROP TRIGGER IF EXISTS trg_auto_gen_tasks_on_insert ON crm_leads;
DROP TRIGGER IF EXISTS trg_auto_gen_tasks_on_update ON crm_leads;
DROP FUNCTION IF EXISTS fn_auto_gen_crm_tasks();

-- LƯU Ý cho deployment:
-- Logic "xoá tasks Lead khi UPDATE type lead→deal" của trigger cũ KHÔNG
-- bị mất — convert-to-deal đã được xử lý ở backend
-- (routes/crm.js POST /leads/:id/convert-to-deal) + completeConsultingCrmTasksForLead().
-- Nếu DB nào đó vẫn còn lead/deal cũ với task lệch, dùng nút
-- "Đồng bộ lại theo bộ mẫu" trên UI hoặc gọi
-- POST /api/crm/leads/:id/tasks/resync-pipeline.
