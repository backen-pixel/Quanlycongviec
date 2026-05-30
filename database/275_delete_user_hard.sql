-- 275_delete_user_hard.sql
-- Function xóa nhân viên vĩnh viễn an toàn:
--   * NULL hoá các cột tham chiếu vai trò (assigned_to, created_by, manager_id, ...) ở các bảng nghiệp vụ
--   * DELETE các bản ghi mà user là chủ thể (log/comment/notification của chính họ)
--   * Cuối cùng DELETE users — Postgres tự xử lý các FK có ON DELETE CASCADE / SET NULL
-- Idempotent: chạy nhiều lần an toàn (CREATE OR REPLACE).
-- Backend gọi qua RPC `delete_user_hard(p_user_id uuid)`.

BEGIN;

CREATE OR REPLACE FUNCTION delete_user_hard(p_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
  v_full_name TEXT;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'Thiếu id nhân viên';
  END IF;

  SELECT email, full_name INTO v_email, v_full_name FROM users WHERE id = p_user_id;
  IF v_email IS NULL THEN
    RAISE EXCEPTION 'Không tìm thấy nhân viên (id=%).', p_user_id;
  END IF;

  ---------------------------------------------------------------------
  -- 1) DELETE các bản ghi user là chủ thể (log/comment/notification riêng).
  --    Các bảng này dùng user_id NOT NULL → không thể NULL hoá; phải xóa.
  ---------------------------------------------------------------------
  DELETE FROM activity_logs            WHERE user_id = p_user_id;
  DELETE FROM notifications            WHERE user_id = p_user_id;
  DELETE FROM customer_interactions    WHERE user_id = p_user_id;
  DELETE FROM task_comments            WHERE user_id = p_user_id;
  DELETE FROM task_participants        WHERE user_id = p_user_id;
  DELETE FROM task_time_logs           WHERE user_id = p_user_id;
  DELETE FROM crm_event_comments       WHERE user_id = p_user_id;
  DELETE FROM project_comments         WHERE user_id = p_user_id;

  ---------------------------------------------------------------------
  -- 2) NULL hoá vai trò trong các bảng nghiệp vụ (giữ lại bản ghi gốc).
  ---------------------------------------------------------------------
  UPDATE crm_leads               SET assigned_to        = NULL WHERE assigned_to        = p_user_id;
  UPDATE crm_leads               SET created_by         = NULL WHERE created_by         = p_user_id;
  UPDATE crm_tasks               SET created_by         = NULL WHERE created_by         = p_user_id;
  UPDATE crm_activities          SET created_by         = NULL WHERE created_by         = p_user_id;
  UPDATE crm_events              SET created_by         = NULL WHERE created_by         = p_user_id;
  UPDATE crm_events              SET assignee_id        = NULL WHERE assignee_id        = p_user_id;
  UPDATE crm_task_attachments    SET created_by         = NULL WHERE created_by         = p_user_id;
  UPDATE customers               SET assigned_to        = NULL WHERE assigned_to        = p_user_id;
  UPDATE departments             SET manager_id         = NULL WHERE manager_id         = p_user_id;
  UPDATE division_projects       SET assigned_by        = NULL WHERE assigned_by        = p_user_id;
  UPDATE facebook_messages       SET sent_by            = NULL WHERE sent_by            = p_user_id;
  UPDATE facebook_pages          SET created_by         = NULL WHERE created_by         = p_user_id;
  UPDATE file_attachments        SET uploaded_by        = NULL WHERE uploaded_by        = p_user_id;
  UPDATE invoices                SET created_by         = NULL WHERE created_by         = p_user_id;
  UPDATE lead_documents          SET created_by         = NULL WHERE created_by         = p_user_id;
  UPDATE lead_members            SET added_by           = NULL WHERE added_by           = p_user_id;
  UPDATE messenger_group_members SET added_by           = NULL WHERE added_by           = p_user_id;
  UPDATE orders                  SET created_by         = NULL WHERE created_by         = p_user_id;
  UPDATE payment_records         SET created_by         = NULL WHERE created_by         = p_user_id;
  UPDATE project_approvals       SET requested_by       = NULL WHERE requested_by       = p_user_id;
  UPDATE project_approvals       SET decided_by         = NULL WHERE decided_by         = p_user_id;
  UPDATE project_expenses        SET created_by         = NULL WHERE created_by         = p_user_id;
  UPDATE project_incidents       SET reported_by        = NULL WHERE reported_by        = p_user_id;
  UPDATE project_incidents       SET resolved_by        = NULL WHERE resolved_by        = p_user_id;
  UPDATE project_phase_handoffs  SET accepted_by        = NULL WHERE accepted_by        = p_user_id;
  UPDATE project_phase_handoffs  SET created_by         = NULL WHERE created_by         = p_user_id;
  UPDATE project_workflow_lines  SET assignee_id        = NULL WHERE assignee_id        = p_user_id;

  UPDATE projects SET shipping_person_id     = NULL WHERE shipping_person_id     = p_user_id;
  UPDATE projects SET designer_id            = NULL WHERE designer_id            = p_user_id;
  UPDATE projects SET project_manager_id     = NULL WHERE project_manager_id     = p_user_id;
  UPDATE projects SET consulting_person_id   = NULL WHERE consulting_person_id   = p_user_id;
  UPDATE projects SET design_person_id       = NULL WHERE design_person_id       = p_user_id;
  UPDATE projects SET quotation_person_id    = NULL WHERE quotation_person_id    = p_user_id;
  UPDATE projects SET contract_person_id     = NULL WHERE contract_person_id     = p_user_id;
  UPDATE projects SET production_person_id   = NULL WHERE production_person_id   = p_user_id;
  UPDATE projects SET sales_person_id        = NULL WHERE sales_person_id        = p_user_id;
  UPDATE projects SET installation_person_id = NULL WHERE installation_person_id = p_user_id;
  UPDATE projects SET care_person_id         = NULL WHERE care_person_id         = p_user_id;
  UPDATE projects SET logistics_person_id    = NULL WHERE logistics_person_id    = p_user_id;

  UPDATE quotation_edit_history  SET created_by      = NULL WHERE created_by      = p_user_id;
  UPDATE quotations              SET approved_by     = NULL WHERE approved_by     = p_user_id;
  UPDATE quotations              SET created_by      = NULL WHERE created_by      = p_user_id;
  UPDATE release_notes           SET created_by      = NULL WHERE created_by      = p_user_id;
  UPDATE stage_transitions       SET transitioned_by = NULL WHERE transitioned_by = p_user_id;
  UPDATE task_checklists         SET assignee_id     = NULL WHERE assignee_id     = p_user_id;
  UPDATE task_checklists         SET completed_by    = NULL WHERE completed_by    = p_user_id;
  UPDATE task_templates          SET assignee_id     = NULL WHERE assignee_id     = p_user_id;
  UPDATE task_templates          SET created_by      = NULL WHERE created_by      = p_user_id;
  UPDATE tasks                   SET assignee_id     = NULL WHERE assignee_id     = p_user_id;
  UPDATE tasks                   SET created_by_id   = NULL WHERE created_by_id   = p_user_id;
  UPDATE teams                   SET leader_id       = NULL WHERE leader_id       = p_user_id;
  UPDATE user_permissions        SET granted_by      = NULL WHERE granted_by      = p_user_id;
  UPDATE user_roles              SET granted_by      = NULL WHERE granted_by      = p_user_id;
  UPDATE workflow_flows          SET created_by      = NULL WHERE created_by      = p_user_id;

  UPDATE company_process_checklists  SET default_assignee_id = NULL WHERE default_assignee_id = p_user_id;
  UPDATE company_process_tasks       SET default_assignee_id = NULL WHERE default_assignee_id = p_user_id;
  UPDATE company_processes           SET created_by          = NULL WHERE created_by          = p_user_id;
  UPDATE company_template_checklists SET default_assignee_id = NULL WHERE default_assignee_id = p_user_id;
  UPDATE company_template_sets       SET created_by          = NULL WHERE created_by          = p_user_id;
  UPDATE company_template_tasks      SET default_assignee_id = NULL WHERE default_assignee_id = p_user_id;

  ---------------------------------------------------------------------
  -- 3) Xóa user — các FK có CASCADE / SET NULL Postgres tự xử lý.
  ---------------------------------------------------------------------
  DELETE FROM users WHERE id = p_user_id;

  RETURN jsonb_build_object(
    'deleted_user_id', p_user_id,
    'email',           v_email,
    'full_name',       v_full_name
  );
END;
$$;

COMMENT ON FUNCTION delete_user_hard(UUID) IS
  'Xóa vĩnh viễn nhân viên: NULL hoá các trường role/created_by, DELETE log/comment/notification của user, rồi DELETE users.';

COMMIT;
