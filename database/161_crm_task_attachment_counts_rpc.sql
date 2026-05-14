-- 161: RPC đếm đính kèm theo task (tránh SELECT hàng loạt dòng → statement timeout).
-- Idempotent.

BEGIN;

CREATE OR REPLACE FUNCTION public.crm_task_attachment_counts_by_tasks(p_task_ids uuid[])
RETURNS TABLE (
  task_id uuid,
  file_count bigint,
  note_count bigint
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    a.task_id,
    COUNT(*) FILTER (WHERE COALESCE(a.doc_type, '') <> 'task_note')::bigint AS file_count,
    COUNT(*) FILTER (WHERE a.doc_type = 'task_note')::bigint AS note_count
  FROM public.crm_task_attachments a
  WHERE p_task_ids IS NOT NULL
    AND cardinality(p_task_ids) > 0
    AND a.task_id = ANY (p_task_ids)
  GROUP BY a.task_id;
$$;

COMMENT ON FUNCTION public.crm_task_attachment_counts_by_tasks(uuid[]) IS
  'Dùng cho GET /crm/leads/:id/tasks: một vòng GROUP BY thay vì trả mọi dòng attachment.';

GRANT EXECUTE ON FUNCTION public.crm_task_attachment_counts_by_tasks(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_task_attachment_counts_by_tasks(uuid[]) TO service_role;

COMMIT;
