-- Chuẩn hoá cấu hình OA "Phúc Đạt": set rõ default_pipeline_id và default_source_id
-- Trước đây 2 trường này NULL nên backend chạy fallback (chọn pipeline is_default
-- của công ty và crm_sources ilike 'Zalo%'). Set rõ để tránh ngầm/dễ vỡ khi tạo
-- thêm pipeline mới hoặc đổi is_default sau này.

UPDATE zalo_oa_accounts
SET default_pipeline_id = '6017bdcd-5683-4f81-9f84-4a5e7bc8d373', -- CRM Pipeline (company 29677f68…)
    default_source_id   = '67b655f9-c58b-4bd0-9cee-baab81874091', -- Source "Zalo"
    updated_at = now()
WHERE oa_id = '2101038814077084150'                                -- OA Phúc Đạt
  AND default_company_id = '29677f68-967e-4256-92fd-492bb580e888';
