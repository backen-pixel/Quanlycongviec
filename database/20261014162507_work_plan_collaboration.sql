BEGIN;
CREATE TABLE public.work_plan_files (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  task_id text NOT NULL CHECK(task_id ~ '^[a-zA-Z0-9_-]{1,80}$'),
  author_id uuid NOT NULL REFERENCES public.users(id),
  name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),
  bytes integer NOT NULL CHECK(bytes BETWEEN 1 AND 8388608),
  storage_path text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.work_plan_comments (
  id uuid PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  task_id text NOT NULL CHECK(task_id ~ '^[a-zA-Z0-9_-]{1,80}$'),
  author_id uuid NOT NULL REFERENCES public.users(id),
  body text NOT NULL CHECK(length(body)<=5000),
  file_ids jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(file_ids)='array' AND jsonb_array_length(file_ids)<=10),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX work_plan_comments_task_idx ON public.work_plan_comments(project_id,task_id,created_at DESC,id DESC);
CREATE INDEX work_plan_files_task_idx ON public.work_plan_files(project_id,task_id);
ALTER TABLE public.work_plan_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_plan_files ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.work_plan_comments,public.work_plan_files FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT ON public.work_plan_comments,public.work_plan_files TO service_role;
CREATE FUNCTION public.work_plan_collaboration_validate() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
DECLARE plan jsonb; co uuid; manager_id uuid; production_id uuid; current_task jsonb; actor_co uuid; actor_role text; module_role text; allowed boolean;
BEGIN
 SELECT document,company_id INTO plan,co FROM public.work_plan_instances WHERE project_id=NEW.project_id FOR UPDATE;
 IF co IS DISTINCT FROM NEW.company_id OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(plan->'active'->'graph'->'tasks') task WHERE task->>'id'=NEW.task_id) THEN
   RAISE EXCEPTION 'Task changed or outside plan scope' USING ERRCODE='40001';
 END IF;
 SELECT item INTO current_task FROM jsonb_array_elements(plan->'active'->'graph'->'tasks') item WHERE item->>'id'=NEW.task_id;
 SELECT project_manager_id,production_person_id INTO manager_id,production_id FROM public.projects WHERE id=NEW.project_id;
 SELECT company_id,role INTO actor_co,actor_role FROM public.users WHERE id=NEW.author_id;
 SELECT role INTO module_role FROM public.user_module_roles WHERE user_id=NEW.author_id AND module_key='production' LIMIT 1;
 allowed := actor_role IN ('platform_admin','ecosystem_admin') OR (actor_role='admin' AND actor_co IS NULL)
   OR NEW.author_id=manager_id OR NEW.author_id=production_id
   OR (actor_co=co AND COALESCE(module_role,actor_role) IN ('admin','sales_admin','production_admin','crm_production_admin','crm_production_staff'));
 IF NOT COALESCE(allowed,false) AND current_task->>'assignee_id' IS DISTINCT FROM NEW.author_id::text THEN
   RAISE EXCEPTION 'Người phụ trách đã thay đổi hoặc không có quyền ghi nhiệm vụ' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER work_plan_comment_valid BEFORE INSERT ON public.work_plan_comments FOR EACH ROW EXECUTE FUNCTION public.work_plan_collaboration_validate();
CREATE TRIGGER work_plan_file_valid BEFORE INSERT ON public.work_plan_files FOR EACH ROW EXECUTE FUNCTION public.work_plan_collaboration_validate();
CREATE FUNCTION public.work_plan_collaboration_preserve() RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=pg_catalog AS $$
BEGIN
 IF EXISTS(
   SELECT 1 FROM (SELECT task_id FROM public.work_plan_comments WHERE project_id=NEW.project_id UNION SELECT task_id FROM public.work_plan_files WHERE project_id=NEW.project_id) history
   WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.document->'active'->'graph'->'tasks') task WHERE task->>'id'=history.task_id)
 ) THEN RAISE EXCEPTION 'Không được xóa nhiệm vụ đã có bình luận hoặc tài liệu' USING ERRCODE='40001'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER work_plan_keep_collaboration BEFORE UPDATE ON public.work_plan_instances FOR EACH ROW EXECUTE FUNCTION public.work_plan_collaboration_preserve();
REVOKE ALL ON FUNCTION public.work_plan_collaboration_validate(),public.work_plan_collaboration_preserve() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.work_plan_collaboration_validate(),public.work_plan_collaboration_preserve() TO service_role;
-- Private files only; download links are issued by scoped server routes.
INSERT INTO storage.buckets(id,name,public,file_size_limit)
VALUES('work-plan-files','work-plan-files',false,8388608) ON CONFLICT(id) DO NOTHING;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM storage.buckets WHERE id='work-plan-files' AND public) THEN
    RAISE EXCEPTION 'work-plan-files must be a private bucket';
  END IF;
END $$;
COMMIT;
