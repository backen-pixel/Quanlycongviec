-- 460: Đếm ghi chú NV đúng — gồm task_inline_note / checklist_inline_note / task_note.
-- Trước đây chỉ task_note → ghi chú bị tính vào file_count.
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
    COUNT(*) FILTER (
      WHERE COALESCE(a.doc_type, '') NOT IN (
        'task_note',
        'task_inline_note',
        'checklist_inline_note'
      )
    )::bigint AS file_count,
    COUNT(*) FILTER (
      WHERE a.doc_type IN (
        'task_note',
        'task_inline_note',
        'checklist_inline_note'
      )
    )::bigint AS note_count
  FROM public.crm_task_attachments a
  WHERE p_task_ids IS NOT NULL
    AND cardinality(p_task_ids) > 0
    AND a.task_id = ANY (p_task_ids)
  GROUP BY a.task_id;
$$;

COMMENT ON FUNCTION public.crm_task_attachment_counts_by_tasks(uuid[]) IS
  'GET /crm/leads/:id/tasks: GROUP BY file vs ghi chú (task_note / task_inline_note / checklist_inline_note).';

GRANT EXECUTE ON FUNCTION public.crm_task_attachment_counts_by_tasks(uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.crm_task_attachment_counts_by_tasks(uuid[]) TO service_role;

COMMIT;
