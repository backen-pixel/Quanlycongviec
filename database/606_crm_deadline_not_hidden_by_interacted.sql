-- 606: Tick «đã tương tác» chỉ đánh dấu cá nhân, không hủy hạn trên Deadline.
-- RPC live (488-style plpgsql) vẫn NULL hạn khi is_interacted — vá thân hàm đang chạy.
-- (605 đã dùng cho project_substage_status.)

DO $$
DECLARE
  fn_name text;
  src text;
BEGIN
  FOREACH fn_name IN ARRAY ARRAY[
    'crm_deadline_bucket_counts',
    'crm_deadline_bucket_page_ids',
    'crm_effective_deadline_at'
  ]
  LOOP
    SELECT pg_get_functiondef(p.oid)
    INTO src
    FROM pg_proc p
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE ns.nspname = 'public' AND p.proname = fn_name
    ORDER BY p.oid
    LIMIT 1;

    IF src IS NULL THEN
      CONTINUE;
    END IF;

    src := replace(src, ' OR s.is_interacted', '');
    src := replace(src, E'\n      OR COALESCE(uf.is_interacted, false)', '');
    src := replace(src, ' OR COALESCE(uf.is_interacted, false)', '');
    EXECUTE src;
  END LOOP;
END $$;
