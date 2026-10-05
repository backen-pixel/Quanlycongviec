-- 648: cột Phát sinh trên pipeline SX và đơn phát sinh gắn dự án gốc.
-- Chạy tay trên Supabase. Không sửa migration đã chạy.

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
