-- 490: Phúc Đạt — NV «Tư vấn lần …» của lead đang ở Hot nhưng gắn sai cột (Cold/Mới/…).
-- Hệ quả: rule deadline cột hiện tại bỏ NV → rơi về SLA Hot → đếm Quá hạn ảo (10 thay vì 8).
-- Sửa: gán lại pipeline_stage_id = cột Hot khi lead đang ở Hot.

DO $$
DECLARE
  v_company_id UUID := '29677f68-967e-4256-92fd-492bb580e888';
  v_hot_stage_id UUID := '2ed1fd4e-cb9f-4d7b-9af0-9785c9d63700';
  v_tasks INT := 0;
BEGIN
  UPDATE crm_tasks t
  SET pipeline_stage_id = v_hot_stage_id
  FROM crm_leads l
  WHERE t.lead_id = l.id
    AND l.company_id = v_company_id
    AND l.stage_id = v_hot_stage_id
    AND t.pipeline_stage_id IS DISTINCT FROM v_hot_stage_id
    AND COALESCE(t.status, '') NOT IN ('completed', 'done', 'cancelled', 'canceled')
    AND (
      t.title ILIKE 'Tư vấn lần%'
      OR t.title ILIKE 'Tu van lan%'
    );

  GET DIAGNOSTICS v_tasks = ROW_COUNT;
  RAISE NOTICE '490 Phúc Đạt: retarget % Hot NV (sai cột→Hot)', v_tasks;
END $$;
