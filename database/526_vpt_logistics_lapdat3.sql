-- 526: VPT — gắn khối VC/LĐ + gán NV lapdat3.vpt@gmail.com vào công ty.
-- Idempotent.

DO $$
DECLARE
  v_vpt UUID := '991dc79d-cbf5-49f9-a364-35227cb47635';
  v_logistics_div UUID := 'b6829c28-40f4-4606-9bb6-3a8c8184f3a0';
  v_dept UUID;
  v_user UUID;
BEGIN
  SELECT id INTO v_vpt
  FROM companies
  WHERE id = '991dc79d-cbf5-49f9-a364-35227cb47635'
     OR name ILIKE '%Vạn Phú Thành%'
     OR name ILIKE '%Van Phu Thanh%'
     OR short_name ILIKE 'VPT'
  ORDER BY CASE WHEN id = '991dc79d-cbf5-49f9-a364-35227cb47635' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_vpt IS NULL THEN
    RAISE NOTICE '526: Không tìm thấy công ty VPT — bỏ qua.';
    RETURN;
  END IF;

  INSERT INTO company_division_units (company_id, division_unit_id, is_primary)
  VALUES (v_vpt, v_logistics_div, false)
  ON CONFLICT (company_id, division_unit_id) DO NOTHING;

  SELECT id INTO v_dept
  FROM departments
  WHERE company_id = v_vpt
    AND division_unit_id = v_logistics_div
  ORDER BY created_at
  LIMIT 1;

  IF v_dept IS NULL THEN
    INSERT INTO departments (name, slug, company_id, division_unit_id, is_active)
    VALUES (
      'Phòng vận chuyển - lắp đặt',
      'phong-van-chuyen-lap-dat-vpt',
      v_vpt,
      v_logistics_div,
      true
    )
    RETURNING id INTO v_dept;
  END IF;

  SELECT id INTO v_user
  FROM users
  WHERE lower(trim(email)) = 'lapdat3.vpt@gmail.com'
  LIMIT 1;

  IF v_user IS NULL THEN
    RAISE NOTICE '526: Không tìm thấy user lapdat3.vpt@gmail.com — đã gắn VPT vào khối VC/LĐ.';
    RETURN;
  END IF;

  UPDATE users
  SET company_id = v_vpt,
      department_id = v_dept,
      is_active = true,
      updated_at = NOW()
  WHERE id = v_user;

  INSERT INTO user_module_roles (user_id, module_key, role)
  VALUES (v_user, 'logistics', 'installer')
  ON CONFLICT (user_id, module_key) DO UPDATE
  SET role = EXCLUDED.role;

  RAISE NOTICE '526: VPT=% dept=% user=% đã vào module VC/LĐ.', v_vpt, v_dept, v_user;
END $$;
