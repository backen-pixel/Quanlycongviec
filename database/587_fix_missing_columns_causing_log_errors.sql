-- 587: Thêm 4 cột mà CODE đã dùng nhưng DATABASE chưa từng có
--
-- Nguồn: log Postgres của project kdxypztstbeovyedmvem, cửa sổ 3 giờ
-- (04/09/2026 07:15–10:15 UTC). Truy vấn log bằng:
--   select log_attributes['parsed.sql_state_code'] as code, event_message,
--          count(), any(log_attributes['parsed.query'])
--     from logs where source='postgres_logs'
--      and log_attributes['parsed.error_severity']='ERROR'
--    group by 1,2 order by 3 desc
--
-- ── 1) facebook_contacts.sync_paused + phone_resolved_at + sync_pause_reason
--
-- 63 lần lỗi 42703 "column facebook_contacts.sync_paused does not exist".
-- Câu gây lỗi chính là câu PROBE mà code dùng để tự phát hiện cột:
--   SELECT facebook_contacts.sync_paused FROM facebook_contacts LIMIT 1
-- (routes/facebook.js → ensureSyncPausedColumnDetected)
--
-- Code xử lý việc thiếu cột rất tử tế: probe rồi cache, thiếu thì bỏ qua filter.
-- Nhưng bản thân cú probe VẪN sinh ERROR trong log Postgres mỗi lần một tiến
-- trình backend khởi động. Ngoài ra còn 2 chỗ GHI `sync_paused` (routes/
-- facebook.js ~3223 và ~3719) và 6 chỗ ĐỌC — tức tính năng được thiết kế để
-- dùng cột này, chỉ là migration 103 chưa từng chạy trên project này.
--
-- Nội dung y như database/103_facebook_contacts_sync_flags.sql, NHƯNG
-- CỐ Ý BỎ chỉ mục của file đó:
--   CREATE INDEX idx_fb_contacts_sync_paused ON facebook_contacts(sync_paused);
-- Lý do: đó là chỉ mục trên một cột BOOLEAN mà mọi truy vấn đều lọc
-- `sync_paused <> true` — tức khớp gần như toàn bộ bảng, nên Postgres sẽ không
-- bao giờ chọn nó. Đổi lại phải trả phí ghi trên bảng có 3,6 triệu UPDATE mà
-- chỉ 0,7% là HOT (mọi UPDATE đều ghi vào mọi chỉ mục). Thêm vào là lỗ vốn.
--
-- AN TOÀN: DEFAULT false nên sau khi thêm, filter `.neq('sync_paused', true)`
-- mà code bật lên loại đúng 0 contact. Đã kiểm chứng: 19.706/19.706 dòng vẫn
-- lọt qua filter. Không đổi hành vi ở thời điểm chạy migration.

ALTER TABLE public.facebook_contacts
  ADD COLUMN IF NOT EXISTS sync_paused BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS phone_resolved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS sync_pause_reason TEXT;

COMMENT ON COLUMN public.facebook_contacts.sync_paused IS
  'true = bỏ qua sync sâu/batch scan vì đã đủ dữ liệu hoặc đã tạo lead';
COMMENT ON COLUMN public.facebook_contacts.phone_resolved_at IS
  'thời điểm đã lấy được SĐT hoặc dữ liệu đủ để tạo lead';
COMMENT ON COLUMN public.facebook_contacts.sync_pause_reason IS
  'lý do dừng sync sâu: phone_resolved, lead_created, manual_pause';

-- ── 2) projects.responsible_person_id
--
-- 20 lần lỗi 42703 "column projects.responsible_person_id does not exist".
-- Câu gây lỗi:
--   SELECT production_person_id, responsible_person_id, sales_person_id,
--          designer_id, project_manager_id, supervisor_id
--     FROM projects WHERE id = $1
-- (helpers/crmLeadParticipantAccess.js:37)
--
-- Cột này được 5 file dùng và KHÔNG có migration nào tạo nó:
--   helpers/crmLeadParticipantAccess.js   — phân quyền người tham gia
--   helpers/dealCommentNotifications.js   — chọn người nhận thông báo
--   helpers/vcLogisticsNotify.js          — thông báo vận chuyển
--   routes/projects.js:304                — bộ lọc "việc của tôi"
-- Vì cả câu SELECT lỗi nên các đường trên đang hỏng chứ không chỉ ồn log.
--
-- Kiểu và FK khớp đúng 7 cột "người phụ trách" cùng loại đã có trên bảng
-- (đều là uuid NULL được, đều có FK) — đã kiểm chứng bằng
-- information_schema trước khi viết dòng này.
--
-- AN TOÀN: cột mới toàn NULL. Mọi chỗ dùng đều lọc bỏ giá trị rỗng
-- (kiểu [a, b, c].filter(Boolean)) nên NULL không thêm ai vào danh sách.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS responsible_person_id UUID
    REFERENCES public.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.projects.responsible_person_id IS
  'Người phụ trách chung. Code đã dùng ở 5 file nhưng cột chưa từng được tạo — xem database/587';

-- ── GHI CHÚ: hai lỗi còn lại trong cùng cửa sổ log phải sửa Ở CODE ─────────
--
-- 23505 × 164  duplicate key "production_ext_co_linked_uq"
--   Nhiều dòng production_external_companies tên khác nhau cùng giải ra một
--   công ty CRM, mà ràng buộc là UNIQUE(production_company_id, linked_company_id)
--   nên dòng đầu link được và mọi dòng sau chắc chắn vi phạm. Code cũ bắt 23505
--   rồi bỏ qua (chạy đúng) nhưng vẫn kích lỗi ~1 lần/phút trên đường ĐỌC.
--   → Sửa ở helpers/productionClientCompanies.js: chốt trước tập clientId đã có
--     chủ (lấy từ dữ liệu đã tải, không thêm truy vấn) để bỏ hẳn UPDATE chắc
--     chắn thất bại; vẫn giữ nhánh bắt 23505 cho trường hợp tranh chấp.
--   KHÔNG nới ràng buộc — ràng buộc đang đúng, chính code gọi sai.
--
-- 42P18 × 114 + 08P01 × 43  "could not determine data type of parameter $2"
--   Lỗi của helpers/pgHotQueries.js → pgUnifiedTaskBadgeCounts: số hiệu tham số
--   bị viết cứng ($2 = user, $3 = company), nên khi user là manager thì $2 không
--   xuất hiện trong SQL mà driver vẫn gửi 3 giá trị → Postgres không suy được
--   kiểu. Hậu quả im lặng: mọi manager rơi về đường 2-truy-vấn cũ (386 ms và
--   đếm sai). → Sửa ở code: sinh số hiệu từ độ dài mảng params.
