-- ═══════════════════════════════════════════════════════════════
-- 563. ZALO — chép ảnh và tệp về kho của công ty
--
-- Link đính kèm của Zalo hiện tải công khai được, nhưng không ai đảm bảo nó
-- sống mãi. Hợp đồng tủ bếp có vòng đời dài; ảnh khảo sát mặt bằng mất là mất
-- bằng chứng. Nên chép về bucket `attachments` của CRM.
--
-- Tệp lớn hơn ngưỡng thì KHÔNG chép, chỉ giữ tên và dung lượng để nhân viên
-- biết khách đã gửi cái gì.
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE zalo_messages
  -- Bản sao trong kho công ty. Có thì giao diện dùng cái này, không thì dùng link Zalo.
  ADD COLUMN IF NOT EXISTS stored_url TEXT,
  ADD COLUMN IF NOT EXISTS attachment_name TEXT,
  ADD COLUMN IF NOT EXISTS attachment_size BIGINT,
  -- pending  : chờ chép
  -- stored   : đã chép xong
  -- too_large: quá ngưỡng, cố ý không chép
  -- failed   : tải hoặc lưu hỏng
  -- skipped  : không cần chép (sticker, tin chữ)
  ADD COLUMN IF NOT EXISTS attachment_status TEXT;

DO $$ BEGIN
  ALTER TABLE zalo_messages
    ADD CONSTRAINT zalo_messages_attachment_status_chk
    CHECK (attachment_status IS NULL OR attachment_status IN
      ('pending', 'stored', 'too_large', 'failed', 'skipped'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Hàng đợi chép: lấy nhanh những tin còn chờ
CREATE INDEX IF NOT EXISTS idx_zalo_messages_attachment_pending
  ON zalo_messages (created_at)
  WHERE attachment_status = 'pending';
