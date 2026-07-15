-- 437: Seed bộ nhiệm vụ theo từng cột pipeline VC/LĐ (mọi công ty có stages)
-- Idempotent.


DO $$
DECLARE
  r record;
  tpl_id uuid;
  item record;
  items jsonb;
  install bool;
  n text;
  s text;
  already int;
BEGIN
  FOR r IN
    SELECT id, name, company_id, order_index, bucket_slug, crm_sync_type
    FROM logistics_pipeline_stages
    WHERE is_active IS NOT FALSE
      AND company_id IS NOT NULL
    ORDER BY company_id, order_index
  LOOP
    SELECT COUNT(*) INTO already
    FROM workshop_task_templates t
    WHERE t.workshop_area = 'logistics'
      AND t.company_id = r.company_id
      AND t.logistics_stage_id = r.id
      AND t.is_active IS NOT FALSE;

    IF already > 0 THEN
      CONTINUE;
    END IF;

    INSERT INTO workshop_task_templates (
      name, workshop_area, description, company_id, is_active, is_default, order_index, logistics_stage_id
    ) VALUES (
      'Bộ mẫu — ' || r.name,
      'logistics',
      'Tự tạo theo cột pipeline «' || r.name || '». Gen khi dự án vào cột này.',
      r.company_id,
      true,
      false,
      COALESCE(r.order_index, 0),
      r.id
    )
    RETURNING id INTO tpl_id;

    n := lower(r.name);
    s := lower(COALESCE(r.bucket_slug, ''));
    install := (
      lower(COALESCE(r.crm_sync_type, '')) = 'installation'
      OR s LIKE '%install%'
      OR n LIKE '%lắp%'
      OR n LIKE '%lap dat%'
    );

    -- Item theo nhóm cột (mirror logic seed JS)
    IF s = 'delivery_pending' OR n LIKE '%chờ xác nhận%' OR n LIKE '%chờ vận chuyển%' THEN
      INSERT INTO workshop_task_template_items (template_id, title, priority, deadline_days, order_index, checklist, blocks_stage_advance)
      VALUES
        (tpl_id, 'Tiếp nhận bàn giao từ SX', 'high', 0, 1, '[{"text":"Đối chiếu mã dự án / packing list"},{"text":"Kiểm đếm kiện hàng"},{"text":"Xác nhận đủ hồ sơ lắp đặt"}]'::jsonb, true),
        (tpl_id, 'Xác nhận lịch giao với khách', 'high', 0, 2, '[{"text":"Gọi / nhắn khách xác nhận ngày giờ"},{"text":"Ghi địa chỉ + SĐT người nhận"},{"text":"Ghi chú điều kiện công trình"}]'::jsonb, false),
        (tpl_id, 'Chuẩn bị xe & nhân sự VC', 'high', 1, 3, '[{"text":"Chốt tài xế / phụ xe"},{"text":"Chọn xe phù hợp số kiện"},{"text":"Briefing packing list"}]'::jsonb, true);

    ELSIF n LIKE '%xác nhận%' AND NOT install THEN
      INSERT INTO workshop_task_template_items (template_id, title, priority, deadline_days, order_index, checklist, blocks_stage_advance)
      VALUES
        (tpl_id, 'Xác nhận đơn sẵn sàng giao', 'high', 0, 1, '[{"text":"Kiểm tra đủ kiện"},{"text":"Xác nhận địa chỉ giao"},{"text":"Chốt khung giờ với khách"}]'::jsonb, true),
        (tpl_id, 'Phân công chuyến giao', 'medium', 0, 2, '[{"text":"Gán tài xế"},{"text":"Gán tuyến / ETA"},{"text":"In / gửi packing list"}]'::jsonb, false);

    ELSIF n LIKE '%đang vận chuyển%' OR (s LIKE '%deliver%' AND NOT install AND n NOT LIKE '%chờ%') THEN
      INSERT INTO workshop_task_template_items (template_id, title, priority, deadline_days, order_index, checklist, blocks_stage_advance)
      VALUES
        (tpl_id, 'Kiểm tra trước khi lấy hàng', 'high', 0, 1, '[{"text":"Đối chiếu mã dự án"},{"text":"Kiểm tra số kiện và phụ kiện"},{"text":"Chụp ảnh tổng kiện"}]'::jsonb, false),
        (tpl_id, 'Hàng lên xe và vận chuyển', 'high', 1, 2, '[{"text":"Xếp hàng an toàn"},{"text":"Chụp ảnh hàng trên xe"},{"text":"Xuất phát và theo dõi hành trình"}]'::jsonb, false),
        (tpl_id, 'Cập nhật trạng thái trên đường', 'medium', 1, 3, '[{"text":"Gửi ETA cho khách"},{"text":"Ghi nhận sự cố (nếu có)"},{"text":"Xác nhận đã đến gần công trình"}]'::jsonb, true);

    ELSIF n LIKE '%giao hàng%' AND NOT install THEN
      INSERT INTO workshop_task_template_items (template_id, title, priority, deadline_days, order_index, checklist, blocks_stage_advance)
      VALUES
        (tpl_id, 'Kiểm tra trước khi giao', 'high', 0, 1, '[{"text":"Kiểm tra kiện khi đến công trình"},{"text":"Đối chiếu packing list"},{"text":"Ghi nhận hư hỏng / thiếu (nếu có)"}]'::jsonb, true),
        (tpl_id, 'Bàn giao hàng cho bên lắp', 'high', 0, 2, '[{"text":"Bàn giao đủ kiện"},{"text":"Ký biên bản giao nhận"},{"text":"Chụp ảnh bàn giao"}]'::jsonb, false);

    ELSIF n LIKE '%có vấn đề%' OR n LIKE '%có lỗi%' OR s LIKE '%issue%' THEN
      INSERT INTO workshop_task_template_items (template_id, title, priority, deadline_days, order_index, checklist, blocks_stage_advance)
      VALUES
        (tpl_id, 'Ghi nhận sự cố', 'high', 0, 1, '[{"text":"Mô tả sự cố rõ ràng"},{"text":"Chụp ảnh / video minh chứng"},{"text":"Phân loại: hư hỏng / thiếu / chậm"}]'::jsonb, true),
        (tpl_id, 'Xử lý & báo cáo', 'high', 1, 2, '[{"text":"Liên hệ khách / nội bộ"},{"text":"Đề xuất phương án xử lý"},{"text":"Cập nhật tiến độ xử lý"}]'::jsonb, false);

    ELSIF n LIKE '%nhận hàng%' THEN
      INSERT INTO workshop_task_template_items (template_id, title, priority, deadline_days, order_index, checklist, blocks_stage_advance)
      VALUES
        (tpl_id, 'Kiểm tra và nhận hàng tại công trình', 'high', 0, 1, '[{"text":"Kiểm đếm kiện / phụ kiện"},{"text":"Kiểm tra mặt bằng trước lắp"},{"text":"Xác nhận đủ hàng để lắp"}]'::jsonb, true),
        (tpl_id, 'Chuẩn bị dụng cụ & mặt bằng', 'medium', 0, 2, '[{"text":"Chuẩn bị dụng cụ lắp"},{"text":"Bảo vệ sàn / tường"},{"text":"Phân khu vực thi công"}]'::jsonb, false);

    ELSIF n LIKE '%đang lắp%' OR (install AND n LIKE '%lắp%' AND n NOT LIKE '%nghiệm%' AND n NOT LIKE '%hoàn%') THEN
      INSERT INTO workshop_task_template_items (template_id, title, priority, deadline_days, order_index, checklist, blocks_stage_advance)
      VALUES
        (tpl_id, 'Quy trình lắp đặt', 'high', 2, 1, '[{"text":"Lắp theo bản vẽ hiện trường"},{"text":"Ghi nhận phát sinh (nếu có)"},{"text":"Vệ sinh khu vực thi công"}]'::jsonb, false),
        (tpl_id, 'Kiểm tra chất lượng lắp', 'high', 1, 2, '[{"text":"Kiểm tra độ thẳng / khe hở"},{"text":"Kiểm tra bản lề / ray"},{"text":"Chụp ảnh trước nghiệm thu"}]'::jsonb, true);

    ELSIF n LIKE '%nghiệm thu%' THEN
      INSERT INTO workshop_task_template_items (template_id, title, priority, deadline_days, order_index, checklist, blocks_stage_advance)
      VALUES
        (tpl_id, 'Nghiệm thu với khách', 'high', 0, 1, '[{"text":"Khách kiểm tra và ký nghiệm thu"},{"text":"Ghi hạng mục tồn / hẹn xử lý"},{"text":"Chụp ảnh công trình hoàn thiện"}]'::jsonb, true),
        (tpl_id, 'Bàn giao hồ sơ', 'medium', 0, 2, '[{"text":"Giao biên bản nghiệm thu"},{"text":"Hướng dẫn sử dụng / bảo hành"},{"text":"Cập nhật trạng thái CRM nếu cần"}]'::jsonb, false);

    ELSIF n LIKE '%hoàn thành%' OR s LIKE '%completed%' OR n LIKE '%bàn giao%' THEN
      INSERT INTO workshop_task_template_items (template_id, title, priority, deadline_days, order_index, checklist, blocks_stage_advance)
      VALUES
        (tpl_id, 'Đóng hồ sơ công trình', 'medium', 0, 1, '[{"text":"Đủ biên bản giao / nghiệm thu"},{"text":"Lưu ảnh hoàn thiện"},{"text":"Xác nhận không còn hạng mục treo"}]'::jsonb, false),
        (tpl_id, 'Chăm sóc sau bàn giao', 'low', 1, 2, '[{"text":"Gọi hỏi thăm khách (nếu quy trình yêu cầu)"},{"text":"Ghi nhận phản hồi"},{"text":"Đóng ticket nội bộ"}]'::jsonb, false);

    ELSIF n LIKE '%bảo hành%' OR n LIKE '%cskh%' OR s LIKE '%customer%' THEN
      INSERT INTO workshop_task_template_items (template_id, title, priority, deadline_days, order_index, checklist, blocks_stage_advance)
      VALUES
        (tpl_id, 'Tiếp nhận yêu cầu CSKH', 'high', 0, 1, '[{"text":"Ghi nội dung yêu cầu"},{"text":"Phân loại bảo hành / phát sinh"},{"text":"Hẹn lịch xử lý"}]'::jsonb, false),
        (tpl_id, 'Xử lý và đóng yêu cầu', 'high', 2, 2, '[{"text":"Thực hiện sửa / bảo hành"},{"text":"Khách xác nhận hoàn tất"},{"text":"Lưu biên bản"}]'::jsonb, true);

    ELSE
      INSERT INTO workshop_task_template_items (template_id, title, priority, deadline_days, order_index, checklist, blocks_stage_advance)
      VALUES
        (tpl_id, 'Thực hiện công việc — ' || r.name, 'medium', 1, 1, '[{"text":"Hoàn thành hạng mục chính"},{"text":"Cập nhật tiến độ"},{"text":"Ghi chú phát sinh (nếu có)"}]'::jsonb, false),
        (tpl_id, 'Kiểm tra trước khi rời cột — ' || r.name, 'high', 0, 2, '[{"text":"Đủ chứng từ / ảnh"},{"text":"Không còn hạng mục chặn"},{"text":"Sẵn sàng chuyển cột kế tiếp"}]'::jsonb, true);
    END IF;

    RAISE NOTICE 'Created template % for stage % (%)', tpl_id, r.name, r.company_id;
  END LOOP;
END $$;

