-- Giai đoạn Deal: khi bật, chuyển deal vào cột này sẽ mở bảng chọn giờ rồi tạo sự kiện
ALTER TABLE crm_pipeline_stages
ADD COLUMN IF NOT EXISTS create_event_on_enter boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN crm_pipeline_stages.create_event_on_enter IS 'Deal pipeline: prompt calendar event (datetime) when lead moves into this stage';
