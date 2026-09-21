-- 628: Deadline CRM không ẩn vì thiếu SĐT.
-- Live RPC (488 plpgsql) vẫn NULL hạn khi NOT has_display_phone — vá thân hàm đang chạy.
-- crm_effective_deadline_at (596) cũng gỡ nhánh phone nếu hàm đã cài.

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

    src := replace(
      src,
      'WHEN NOT s.has_display_phone OR s.deadline_disabled_at IS NOT NULL THEN NULL',
      'WHEN s.deadline_disabled_at IS NOT NULL THEN NULL'
    );
    src := replace(src, 'WHEN NOT s.has_display_phone THEN NULL', 'WHEN FALSE THEN NULL');
    src := replace(src, E'\n      OR (\n        NULLIF(TRIM(COALESCE(l.phone::text, '''')), '''') IS NULL\n        AND NULLIF(TRIM(COALESCE(c.phone::text, '''')), '''') IS NULL\n      )', '');
    src := replace(src, ' OR (\n        NULLIF(TRIM(COALESCE(l.phone::text, '''')), '''') IS NULL\n        AND NULLIF(TRIM(COALESCE(c.phone::text, '''')), '''') IS NULL\n      )', '');
    EXECUTE src;
  END LOOP;
END $$;
