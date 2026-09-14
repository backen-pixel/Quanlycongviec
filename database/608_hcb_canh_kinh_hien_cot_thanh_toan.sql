-- 608: HCB Cánh kính / Cửa — hiện lại cột thanh toán trên bảng xưởng.
-- group_key = cong_no khiến dashboard dời cột sang tab Công nợ (Tủ bếp).
-- Cánh kính/Cửa: thu tiền, Đợi thanh toán, nợ quá hạn là cột trên pipeline xưởng.

DO $$
DECLARE
  v_hcb UUID := '18c2563f-3495-498d-8199-23200c9f420e';
BEGIN
  UPDATE production_pipeline_stages pps
  SET group_key = NULL
  FROM workshop_project_types wpt
  WHERE pps.workshop_type_id = wpt.id
    AND pps.company_id = v_hcb
    AND lower(trim(wpt.name)) IN ('cánh kính', 'cửa')
    AND (
      lower(trim(pps.name)) IN ('thu tiền', 'đợi thanh toán')
      OR lower(trim(pps.name)) LIKE 'nợ quá hạn%'
    );
END $$;
