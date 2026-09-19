-- 614: Tab Kanban Dashboard (Sản xuất / Công nợ) cho từng cột pipeline
-- board_tab = 'sx' | 'cong_no'. NULL = suy ra như cũ (group_key cong_no + loại Tủ bếp).
-- Cột lớn gán vào tab nào sẽ hiện trên tab đó ở Dashboard xưởng.

alter table production_pipeline_stages add column if not exists board_tab text;

comment on column production_pipeline_stages.board_tab is
  'Tab Kanban Dashboard: sx | cong_no. NULL = suy ra tu group_key cong_no (logic cu, loai Canh kinh/Cua giu tren SX).';

-- Backfill Tủ bếp: cột lớn Công nợ đang tách tab (không đụng Cánh kính / Cửa).
UPDATE production_pipeline_stages pps
   SET board_tab = 'cong_no'
 WHERE pps.board_tab IS NULL
   AND pps.group_key IS NOT NULL
   AND replace(lower(trim(pps.group_key)), ' ', '_') IN ('cong_no', 'congno')
   AND NOT EXISTS (
     SELECT 1
       FROM workshop_project_types wpt
      WHERE wpt.id = pps.workshop_type_id
        AND lower(trim(wpt.name)) IN ('cánh kính', 'canh kinh', 'cửa', 'cua')
   );

-- HOÀN TÁC:
-- alter table production_pipeline_stages drop column if exists board_tab;
