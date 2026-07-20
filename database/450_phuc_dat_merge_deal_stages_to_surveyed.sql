-- 450: Phúc Đạt — gộp deal từ Đang xây thô / Đang thiết kế / Đàm phán → Đã Khảo sát., xóa 3 cột
-- Company: 29677f68-967e-4256-92fd-492bb580e888
-- Pipeline: 6017bdcd-5683-4f81-9f84-4a5e7bc8d373

DO $$
DECLARE
  v_target uuid := 'a6e13a64-121f-4f04-a12f-f6f96cca1516'; -- Đã Khảo sát.
  v_pipeline uuid := '6017bdcd-5683-4f81-9f84-4a5e7bc8d373';
BEGIN
  UPDATE crm_leads
  SET stage_id = v_target,
      stage_entered_at = NOW(),
      updated_at = NOW()
  WHERE stage_id IN (
    'bd08a266-a4fd-47ff-857e-65a54508fba1',
    'c49f4a64-1634-4c1a-8459-61b8060f8c7d',
    '24378e04-5197-4709-b520-d8e47fa02888'
  );

  UPDATE crm_task_templates
  SET pipeline_stage_id = v_target
  WHERE pipeline_stage_id = 'c49f4a64-1634-4c1a-8459-61b8060f8c7d';

  DELETE FROM crm_pipeline_stages
  WHERE pipeline_id = v_pipeline
    AND id IN (
      'bd08a266-a4fd-47ff-857e-65a54508fba1',
      'c49f4a64-1634-4c1a-8459-61b8060f8c7d',
      '24378e04-5197-4709-b520-d8e47fa02888'
    );

  RAISE NOTICE '450: Đã gộp deal về Đã Khảo sát. và xóa 3 cột Phúc Đạt.';
END $$;
