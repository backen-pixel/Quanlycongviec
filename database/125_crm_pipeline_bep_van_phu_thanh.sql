  -- 125: Pipeline CRM cho **Bếp Vạn Phú Thành** — Lead + Deal (cột Kanban theo quy trình nội bộ)
  -- Chạy trên Supabase SQL Editor (hoặc supabase db execute).
  --
  -- Công ty được nhận diện giống migration 123 + thêm khớp "Bếp".
  -- Idempotent: nếu đã có pipeline tên `CRM — Bếp Vạn Phú Thành` cho công ty đó thì bỏ qua.

  DO $$
  DECLARE
    v_company_id UUID;
    v_pipeline_id UUID;
    v_name CONSTANT TEXT := 'CRM — Bếp Vạn Phú Thành';
  BEGIN
    IF to_regclass('public.crm_pipelines') IS NULL THEN
      RAISE EXCEPTION '125: Thiếu bảng crm_pipelines.';
    END IF;

    SELECT c.id INTO v_company_id
    FROM companies c
    WHERE
      c.name ILIKE '%Bếp%Vạn%Phú%Thành%'
      OR c.name ILIKE '%Bếp Vạn Phú%'
      OR c.name ILIKE '%Vạn Phú%Thành%'
      OR c.name ILIKE '%Van Phu%Thanh%'
      OR (c.name ILIKE '%Vạn Phú%' AND c.name ILIKE '%Thành%')
      OR c.short_name ILIKE '%VPT%'
    ORDER BY c.name
    LIMIT 1;

    IF v_company_id IS NULL THEN
      RAISE EXCEPTION '125: Không tìm thấy công ty Bếp Vạn Phú Thành trong `companies`. Tạo công ty hoặc chỉnh điều kiện WHERE.';
    END IF;

    SELECT p.id INTO v_pipeline_id
    FROM crm_pipelines p
    WHERE p.company_id = v_company_id
      AND p.name = v_name
    LIMIT 1;

    IF v_pipeline_id IS NOT NULL THEN
      RAISE NOTICE '125: Pipeline "%" đã tồn tại (company_id=%), bỏ qua.', v_name, v_company_id;
      RETURN;
    END IF;

    INSERT INTO crm_pipelines (name, company_id, description, is_default, is_active)
    VALUES (
      v_name,
      v_company_id,
      'Pipeline Lead + Deal — Bếp Vạn Phú Thành (migration 125)',
      false,
      true
    )
    RETURNING id INTO v_pipeline_id;

    -- ─── Lead ─────────────────────────────────────────────────────────────
    INSERT INTO crm_pipeline_stages (
      name, color, icon, order_index, pipeline_type, pipeline_id,
      is_won, is_lost, is_active, send_zalo_on_enter
    )
    VALUES
      ('TIẾP NHẬN', '#64748B', '📥', 1, 'lead', v_pipeline_id, false, false, true, false),
      ('LIÊN HỆ KHÔNG PHẢN HỒI', '#94A3B8', '📵', 2, 'lead', v_pipeline_id, false, false, true, false),
      ('CHUẨN BỊ XÂY', '#3B82F6', '🏗️', 3, 'lead', v_pipeline_id, false, false, true, false),
      ('GIAI ĐOẠN XÂY THÔ', '#6366F1', '🧱', 4, 'lead', v_pipeline_id, false, false, true, false),
      ('NHÀ GẦN HOÀN THIỆN', '#8B5CF6', '🏠', 5, 'lead', v_pipeline_id, false, false, true, false),
      ('ĐANG HẸN KHẢO SÁT Và Gặp', '#A855F7', '📅', 6, 'lead', v_pipeline_id, false, false, true, false),
      ('Gặp SHOW ROOM OR Xưởng', '#D946EF', '🏪', 7, 'lead', v_pipeline_id, false, false, true, false),
      ('ĐÃ KHẢO SÁT KO TÌM NĂNG', '#EF4444', '🚫', 8, 'lead', v_pipeline_id, false, true, true, false),
      ('KHÁCH KHÔNG CÒN NHU CẦU', '#DC2626', '⛔', 9, 'lead', v_pipeline_id, false, true, true, false);

    -- ─── Deal ─────────────────────────────────────────────────────────────
    INSERT INTO crm_pipeline_stages (
      name, color, icon, order_index, pipeline_type, pipeline_id,
      is_won, is_lost, is_active, send_zalo_on_enter, sync_role
    )
    VALUES
      ('ĐÃ KHẢO SÁT ĐANG BÁO GIÁ', '#06B6D4', '📐', 1, 'deal', v_pipeline_id, false, false, true, false, NULL),
      ('ĐÃ GỬI BÁO GIÁ KHÁCH HÀNG', '#0EA5E9', '📄', 2, 'deal', v_pipeline_id, false, false, true, false, NULL),
      ('THEO DÕI THÊM', '#F59E0B', '🔔', 3, 'deal', v_pipeline_id, false, false, true, false, NULL),
      ('CHÊ GIÁ CAO', '#EF4444', '💸', 4, 'deal', v_pipeline_id, false, true, true, false, NULL),
      ('CỌC RA NĂM LÀM', '#84CC16', '💵', 5, 'deal', v_pipeline_id, false, false, true, false, NULL),
      ('CỌC LÊN BẢN VẼ', '#65A30D', '📋', 6, 'deal', v_pipeline_id, false, false, true, false, NULL),
      ('ĐÃ KÝ HỢP ĐỒNG', '#10B981', '✍️', 7, 'deal', v_pipeline_id, true, false, true, false, NULL),
      ('ĐANG SẢN XUẤT', '#F97316', '🏭', 8, 'deal', v_pipeline_id, false, false, true, false, NULL),
      ('ĐANG LẮP ĐẶT', '#EA580C', '🔧', 9, 'deal', v_pipeline_id, false, false, true, false, 'vc_installation'),
      ('CÔNG NỢ', '#CA8A04', '📒', 10, 'deal', v_pipeline_id, false, false, true, false, NULL),
      ('CHĂM SÓC KHÁCH HÀNG', '#059669', '🤝', 11, 'deal', v_pipeline_id, false, false, true, false, 'vc_customer_care');

    RAISE NOTICE '125: Đã tạo pipeline % id=% cho company_id=%', v_name, v_pipeline_id, v_company_id;
  END $$;
