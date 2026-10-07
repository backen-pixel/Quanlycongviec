-- 649: vá ba lỗi đang đổ ra Postgres log mỗi lần có người mở trang dự án.
--
-- Đo ngày 05/10/2026, trong một giờ làm việc (08:00–09:00 giờ VN):
--   38 lần  column projects.source_project_id does not exist
--    2 lần  column projects.install_occurrence_dates does not exist
--    2 lần  duplicate key ... "project_substage_status_uniq"   (sửa ở backend)
--    1 lần  no unique or exclusion constraint matching the ON CONFLICT
--
-- Nguyên nhân chung: code đã deploy, migration thì chưa chạy. File 648 ghi sẵn
-- "Chạy tay trên Supabase" nhưng không ai chạy; còn install_occurrence_dates
-- thì chưa từng có file migration nào, dù 10 file backend đang dùng cột đó.
--
-- Chạy tay trên Supabase. Toàn bộ là ADD/CREATE IF NOT EXISTS nên chạy lại
-- nhiều lần vô hại, và đã gộp sẵn phần của 648 để khỏi phải nhớ thứ tự.

-- ---------------------------------------------------------------------------
-- 1. Đơn phát sinh (gộp từ 648, chưa chạy bao giờ)
-- ---------------------------------------------------------------------------
ALTER TABLE public.production_pipeline_stages
  ADD COLUMN IF NOT EXISTS is_phat_sinh BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.production_pipeline_stages.is_phat_sinh IS
  'Cột đơn phát sinh. Không map workflow và không đẩy CRM. Đơn phát sinh mới đứng vào cột này.';

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS source_project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.projects.source_project_id IS
  'Đơn gốc khi dòng này là đơn phát sinh. Không tạo deal CRM mới.';

CREATE INDEX IF NOT EXISTS projects_source_project_id_idx
  ON public.projects (source_project_id)
  WHERE source_project_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. Ngày lắp đặt nhiều đợt
--
-- Kiểu date[] chứ không phải jsonb: code chỉ ghi vào và đọc ra danh sách ngày
-- 'YYYY-MM-DD' đã chuẩn hoá qua occurrenceYmds(), không lọc và không so sánh
-- trên cột này, nên để date[] cho Postgres chặn luôn giá trị rác ngay lúc ghi.
-- ---------------------------------------------------------------------------
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS install_occurrence_dates DATE[];

COMMENT ON COLUMN public.projects.install_occurrence_dates IS
  'Các ngày lắp đặt khi dự án lắp nhiều đợt. NULL/rỗng = chỉ lắp một lần theo install_date.';

-- ---------------------------------------------------------------------------
-- 3. drive_acl: để ON CONFLICT bắt được
--
-- Chỉ mục cũ uq_drive_acl dùng COALESCE(principal_id,'*') — là chỉ mục BIỂU THỨC.
-- PostgREST chỉ gửi được TÊN CỘT trong onConflict nên Postgres không khớp nổi:
-- lần nào chia sẻ cũng ném lỗi rồi code mới chạy nhánh dự phòng.
--
-- Postgres 17 có NULLS NOT DISTINCT. Chỉ mục dưới đây giữ nguyên ý nghĩa cũ
-- (một dòng duy nhất cho mỗi cặp target × principal, kể cả principal_id NULL
-- của quyền "everyone") nhưng là chỉ mục CỘT THƯỜNG nên ON CONFLICT khớp được.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_drive_acl_cot
  ON public.drive_acl (target_type, target_id, principal_type, principal_id)
  NULLS NOT DISTINCT;

-- Chỉ mục biểu thức cũ giờ thừa, nhưng KHÔNG xoá ở đây: xoá rồi mà phải lùi
-- phiên bản code thì mất luôn ràng buộc. Để lần chạy sau, khi đã chắc chắn.
