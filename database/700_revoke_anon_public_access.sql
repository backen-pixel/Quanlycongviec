-- Close direct anon/authenticated access to public objects only.
-- Prerequisites: run database/audit/anon_exposure_audit.sql, then
-- database/audit/anon_exposure_snapshot.sql on each target; test on staging;
-- obtain separate Founder approval before primary/backup release.
-- Verify by rerunning the audit: sections 1-5 should have zero rows, and
-- section 6 should have no grants to anon/authenticated/PUBLIC for functions.
-- No storage/auth/realtime schema is changed.
-- Backend supabase.rpc('...') calls found under backend/src (including fallbacks):
-- create_facebook_contact_lead_once, crm_deadline_bucket_counts,
-- crm_deadline_bucket_page_ids, crm_filter_summary, crm_kanban_stage_page_ids,
-- crm_leads_page_ids, crm_leads_stage_counts,
-- crm_task_attachment_counts_by_tasks, delete_user_hard,
-- fb_analytics_contacts_in_range, fb_analytics_messages_in_range,
-- fb_attended_status_for_contacts, fb_contact_ids_with_inbound_in_range,
-- fb_last_inbound_at_for_contacts, fb_new_senders_by_page_daily,
-- fb_unattended_count, fb_unattended_count_by_page,
-- increment_public_share_view, internal_social_feed_posts,
-- internal_social_unread_count,
-- knowledge_next_certificate_number, knowledge_random_verify_code,
-- messenger_group_list_stats, messenger_group_list_stats_v2,
-- messenger_group_list_stats_v3, sx_kanban_column_counts,
-- sx_kanban_stage_page_ids,
-- user_has_permission, work_overview_tasks.

BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '5min';

-- PUBLIC must be revoked too: otherwise anon inherits its table/sequence ACLs.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- Keep the backend's service_role independent of former PUBLIC grants.
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

-- Schema-specific defaults only; do not alter defaults in other schemas.
DO $migration$
DECLARE creator text;
BEGIN
  FOREACH creator IN ARRAY ARRAY['postgres', 'supabase_admin'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = creator) THEN
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON TABLES FROM PUBLIC, anon, authenticated', creator);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE ALL ON SEQUENCES FROM PUBLIC, anon, authenticated', creator);
      EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon, authenticated', creator);
    END IF;
  END LOOP;
END
$migration$;

DO $migration$
DECLARE object_row record;
BEGIN
  FOR object_row IN
    SELECT n.nspname, c.relname
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', object_row.nspname, object_row.relname);
  END LOOP;
END
$migration$;

DO $migration$
DECLARE policy_row record;
BEGIN
  FOR policy_row IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND roles && ARRAY['public', 'anon', 'authenticated']::name[]
      AND (btrim(qual) = 'true' OR btrim(with_check) = 'true')
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', policy_row.policyname,
                   policy_row.schemaname, policy_row.tablename);
  END LOOP;
END
$migration$;

COMMIT;
