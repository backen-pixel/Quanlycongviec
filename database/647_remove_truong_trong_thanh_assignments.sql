-- 647: Gỡ Trương Trọng Thành khỏi đội SX/VC và thành viên deal.
-- Tài khoản admin giữ nguyên (không xóa user, không đụng lịch sử bình luận).
-- Không ghi đè người khác: chỉ xóa dòng của user này và cột đang trỏ đúng user này.

DO $$
DECLARE
  v_user UUID := '646e364e-504d-4362-af1a-4f4694b0d05d';
  n_staff INT := 0;
  n_members INT := 0;
  n_defaults INT := 0;
  n_tasks INT := 0;
  n_assign INT := 0;
  n_err INT := 0;
  n_prod INT := 0;
  n_log INT := 0;
  n_inst INT := 0;
BEGIN
  SELECT id INTO v_user
  FROM users
  WHERE id = '646e364e-504d-4362-af1a-4f4694b0d05d'
     OR lower(trim(email)) = 'trongthanh0800@gmail.com'
  ORDER BY CASE WHEN id = '646e364e-504d-4362-af1a-4f4694b0d05d' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_user IS NULL THEN
    RAISE NOTICE '647: Không tìm thấy Trương Trọng Thành — bỏ qua.';
    RETURN;
  END IF;

  DELETE FROM project_production_staff WHERE user_id = v_user;
  GET DIAGNOSTICS n_staff = ROW_COUNT;

  DELETE FROM lead_members WHERE user_id = v_user;
  GET DIAGNOSTICS n_members = ROW_COUNT;

  DELETE FROM production_workshop_type_default_staff WHERE user_id = v_user;
  GET DIAGNOSTICS n_defaults = ROW_COUNT;

  BEGIN
    DELETE FROM production_pipeline_stage_default_staff WHERE user_id = v_user;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  BEGIN
    DELETE FROM crm_pipeline_stage_default_members WHERE user_id = v_user;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;
  BEGIN
    DELETE FROM workshop_team_members WHERE user_id = v_user;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  BEGIN
    DELETE FROM crm_task_assignees WHERE user_id = v_user;
    GET DIAGNOSTICS n_tasks = ROW_COUNT;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  BEGIN
    DELETE FROM crm_assignment_assignees WHERE user_id = v_user;
    GET DIAGNOSTICS n_assign = ROW_COUNT;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  BEGIN
    DELETE FROM task_participants WHERE user_id = v_user;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  BEGIN
    DELETE FROM shared_workspace_error_type_staff WHERE user_id = v_user;
    GET DIAGNOSTICS n_err = ROW_COUNT;
  EXCEPTION WHEN undefined_table THEN NULL;
  END;

  UPDATE projects
  SET production_person_id = NULL, updated_at = NOW()
  WHERE production_person_id = v_user;
  GET DIAGNOSTICS n_prod = ROW_COUNT;

  UPDATE projects
  SET logistics_person_id = NULL, updated_at = NOW()
  WHERE logistics_person_id = v_user;
  GET DIAGNOSTICS n_log = ROW_COUNT;

  UPDATE projects
  SET installer_person_id = NULL, updated_at = NOW()
  WHERE installer_person_id = v_user;
  GET DIAGNOSTICS n_inst = ROW_COUNT;

  BEGIN
    UPDATE logistics_handover_settings
    SET responsible_user_id = CASE WHEN responsible_user_id = v_user THEN NULL ELSE responsible_user_id END,
        installer_user_id = CASE WHEN installer_user_id = v_user THEN NULL ELSE installer_user_id END,
        handover_confirm_user_id = CASE WHEN handover_confirm_user_id = v_user THEN NULL ELSE handover_confirm_user_id END,
        updated_at = NOW()
    WHERE responsible_user_id = v_user
       OR installer_user_id = v_user
       OR handover_confirm_user_id = v_user;
  EXCEPTION WHEN undefined_column OR undefined_table THEN
    UPDATE logistics_handover_settings
    SET responsible_user_id = CASE WHEN responsible_user_id = v_user THEN NULL ELSE responsible_user_id END,
        installer_user_id = CASE WHEN installer_user_id = v_user THEN NULL ELSE installer_user_id END,
        updated_at = NOW()
    WHERE responsible_user_id = v_user
       OR installer_user_id = v_user;
  END;

  BEGIN
    UPDATE production_handover_settings
    SET responsible_user_id = CASE WHEN responsible_user_id = v_user THEN NULL ELSE responsible_user_id END,
        delivery_confirm_user_id = CASE WHEN delivery_confirm_user_id = v_user THEN NULL ELSE delivery_confirm_user_id END,
        updated_at = NOW()
    WHERE responsible_user_id = v_user
       OR delivery_confirm_user_id = v_user;
  EXCEPTION WHEN undefined_column OR undefined_table THEN
    UPDATE production_handover_settings
    SET responsible_user_id = NULL, updated_at = NOW()
    WHERE responsible_user_id = v_user;
  END;

  RAISE NOTICE '647: gỡ Thành | staff=% members=% defaults=% tasks=% assignments=% error_staff=% production_person=% logistics=% installer=%',
    n_staff, n_members, n_defaults, n_tasks, n_assign, n_err, n_prod, n_log, n_inst;
END $$;
