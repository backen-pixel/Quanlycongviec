-- 40_deal_won_auto_project_trigger.sql
-- DISABLED: Trigger tự động tạo dự án khi Deal thắng
-- Giờ dùng modal chọn luồng + bộ nhiệm vụ trước khi tạo
-- Backend API: POST /crm/leads/:id/create-project

-- Xóa trigger cũ (nếu có)
DROP TRIGGER IF EXISTS trg_deal_won_auto_project ON crm_leads;
DROP FUNCTION IF EXISTS fn_deal_won_auto_project();

-- NOTE: Không cần trigger nữa vì:
-- 1. User kéo deal vào "Thắng" → hiện modal tạo dự án
-- 2. User chọn luồng + bộ nhiệm vụ → bấm "Tạo dự án"
-- 3. Backend POST /crm/leads/:id/create-project xử lý tất cả
