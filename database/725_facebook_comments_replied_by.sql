-- 725_facebook_comments_replied_by.sql
-- Ghi nhận NHÂN VIÊN nào bấm trả lời 1 bình luận Facebook — facebook_comments trước đây chỉ có
-- replied (bool) + reply_text, không biết ai bấm. Cần cho báo cáo hành vi người dùng (Giai đoạn 5,
-- xem docs/architecture/ke-hoach-thu-thap-hanh-vi-nguoi-dung.md) gộp "bình luận & trả lời khách
-- hàng qua Facebook" vào phần giao tiếp khách hàng của từng nhân viên.
--
-- GIỚI HẠN THẬT: cột này chỉ có giá trị cho các lượt trả lời SAU KHI route reply bắt đầu ghi
-- (xem backend/src/routes/facebook.js, route POST /comments/:id/reply). Bình luận đã `replied=true`
-- từ trước migration này sẽ có replied_by = NULL — không suy đoán ngược ai đã trả lời.
--
-- Idempotent — an toàn chạy lại.

ALTER TABLE facebook_comments
  ADD COLUMN IF NOT EXISTS replied_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_facebook_comments_replied_by
  ON facebook_comments(replied_by)
  WHERE replied_by IS NOT NULL;

COMMENT ON COLUMN facebook_comments.replied_by IS
  'Nhân viên bấm trả lời qua route /comments/:id/reply. NULL = trả lời trước migration 724, hoặc trả lời bằng app Facebook gốc (không qua route này).';
