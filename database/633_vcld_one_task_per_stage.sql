-- 633: VC/LĐ — mỗi cột pipeline chỉ còn ĐÚNG 1 nhiệm vụ
-- Các việc nhỏ (ký nhận, biên bản, chụp hình...) gộp thành checklist của nhiệm vụ đó.
-- Tắt "Bộ mẫu chung VC/LĐ" (6 việc, không gắn cột) vì nó nhả 6 nhiệm vụ ở MỌI cột.
-- Vá cột đang trống (Dự án sắp tới, Tiếp nhận giao hàng) và bộ rỗng (Đang giao).
-- Idempotent. Backup: _bak_20260924_vcld_templates / _bak_20260924_vcld_template_items

BEGIN;

-- 1) BACKUP trước khi sửa
CREATE TABLE IF NOT EXISTS _bak_20260924_vcld_templates AS
SELECT * FROM workshop_task_templates WHERE workshop_area = 'logistics';

CREATE TABLE IF NOT EXISTS _bak_20260924_vcld_template_items AS
SELECT i.* FROM workshop_task_template_items i
JOIN workshop_task_templates t ON t.id = i.template_id
WHERE t.workshop_area = 'logistics';

-- 2) Tắt mọi bộ mẫu VC/LĐ không gắn cột (nguồn gây 6 nhiệm vụ ở mọi cột)
UPDATE workshop_task_templates
SET is_active = false, is_default = false, updated_at = now()
WHERE workshop_area = 'logistics'
  AND logistics_stage_id IS NULL
  AND is_active IS NOT FALSE;

-- 3) Mỗi cột đúng 1 bộ mẫu, mỗi bộ đúng 1 nhiệm vụ
DO $$
DECLARE
  st record;
  tpl_id uuid;
  keep_id uuid;
  v_title text;
  v_desc  text;
  v_days  int;
  v_check jsonb;
BEGIN
  FOR st IN
    SELECT s.id, s.name, s.company_id, s.order_index
    FROM logistics_pipeline_stages s
    WHERE s.is_active IS NOT FALSE
    ORDER BY s.company_id NULLS FIRST, s.order_index
  LOOP
    IF st.name = 'Dự án sắp tới' THEN
      v_title := 'Lên kế hoạch vận chuyển';
      v_desc  := 'Chốt lịch và nguồn lực trước khi xuất hàng.';
      v_days  := 2;
      v_check := '[{"text":"Chốt ngày giao với khách"},{"text":"Bố trí xe và nhân sự"},{"text":"Xác nhận mặt bằng công trình sẵn sàng"}]'::jsonb;

    ELSIF st.name = 'Chờ giao hàng' THEN
      v_title := 'Chuẩn bị và kiểm hàng trước khi xuất';
      v_desc  := 'Kiểm đủ hàng tại xưởng và chụp ảnh trước khi lên xe.';
      v_days  := 1;
      v_check := '[{"text":"Đối chiếu mã dự án với packing list"},{"text":"Kiểm số kiện và phụ kiện"},{"text":"Chụp ảnh kiện hàng và nhãn tại xưởng"},{"text":"Xác nhận đủ điều kiện xuất hàng"}]'::jsonb;

    ELSIF st.name IN ('Tiếp nhận', 'Tiếp nhận giao hàng') THEN
      v_title := 'Tiếp nhận yêu cầu giao hàng';
      v_desc  := 'Nhận bàn giao từ xưởng và xác nhận thông tin giao hàng.';
      v_days  := 1;
      v_check := '[{"text":"Nhận thông tin bàn giao từ xưởng"},{"text":"Kiểm tra hồ sơ / bản vẽ đi kèm"},{"text":"Xác nhận địa chỉ và người nhận"},{"text":"Chụp ảnh kiện hàng tại xưởng"}]'::jsonb;

    ELSIF st.name = 'Đang giao' THEN
      v_title := 'Vận chuyển hàng tới công trình';
      v_desc  := 'Xếp hàng, xuất phát và theo dõi tới khi đến công trình.';
      v_days  := 1;
      v_check := '[{"text":"Xếp hàng lên xe an toàn"},{"text":"Chụp ảnh hàng trên xe"},{"text":"Xuất phát và theo dõi hành trình"}]'::jsonb;

    ELSIF st.name = 'Đã giao' THEN
      v_title := 'Giao hàng và ký nhận tại công trình';
      v_desc  := 'Bàn giao hàng tại công trình, ký biên bản, chuyển cho lắp đặt.';
      v_days  := 0;
      v_check := '[{"text":"Chụp ảnh kiện hàng tại công trình"},{"text":"Đối chiếu số lượng với packing list"},{"text":"Ghi nhận thiếu / hư hỏng (nếu có)"},{"text":"Ký biên bản bàn giao"},{"text":"Chuyển biên bản cho bộ phận lắp đặt"}]'::jsonb;

    ELSIF st.name = 'Lắp đặt' THEN
      v_title := 'Thi công lắp đặt và kiểm tra';
      v_desc  := 'Lắp theo bản vẽ, kiểm tra kỹ thuật và vệ sinh hiện trường.';
      v_days  := 2;
      v_check := '[{"text":"Lắp đúng vị trí và kích thước theo bản vẽ"},{"text":"Ghi nhận phát sinh tại hiện trường"},{"text":"Kiểm tra độ chắc chắn và vận hành"},{"text":"Vệ sinh, thu dọn hiện trường"}]'::jsonb;

    ELSIF st.name = 'Phát sinh' THEN
      v_title := 'Xử lý phát sinh';
      v_desc  := 'Ghi nhận và xử lý dứt điểm vấn đề phát sinh trong VC/LĐ.';
      v_days  := 1;
      v_check := '[{"text":"Ghi nguyên nhân và mức độ ảnh hưởng"},{"text":"Đính kèm hình ảnh hiện trường"},{"text":"Chốt hướng xử lý và người phụ trách"},{"text":"Xác nhận đã xử lý xong"}]'::jsonb;

    ELSIF st.name IN ('Nghiệm thu - bàn giao', 'Đang nghiệm thu - bàn giao') THEN
      v_title := 'Nghiệm thu và bàn giao công trình';
      v_desc  := 'Nghiệm thu với khách, ký biên bản và hoàn tất giấy tờ.';
      v_days  := 1;
      v_check := '[{"text":"Khách kiểm tra hạng mục lắp đặt"},{"text":"Ghi nhận tồn đọng / hẹn xử lý (nếu có)"},{"text":"Ký biên bản nghiệm thu"},{"text":"Chụp ảnh công trình hoàn thiện"},{"text":"Hoàn thành giấy tờ bàn giao"}]'::jsonb;

    ELSIF st.name = 'Hoàn thiện' THEN
      v_title := 'Đóng hồ sơ VC/LĐ';
      v_desc  := 'Tập hợp hồ sơ, đóng nhiệm vụ còn mở và xác nhận kết thúc.';
      v_days  := 1;
      v_check := '[{"text":"Bổ sung đủ ảnh và tài liệu"},{"text":"Kiểm tra nhiệm vụ còn mở"},{"text":"Người phụ trách xác nhận hoàn tất"}]'::jsonb;

    ELSE
      v_title := 'Xử lý bước « ' || st.name || ' »';
      v_desc  := 'Thực hiện công việc của cột « ' || st.name || ' ».';
      v_days  := 1;
      v_check := '[{"text":"Thực hiện công việc của bước này"},{"text":"Ghi chú hoặc đính kèm bằng chứng"},{"text":"Xác nhận hoàn tất"}]'::jsonb;
    END IF;

    -- bộ mẫu của cột: ưu tiên bộ đang bật, nếu chưa có thì tạo
    SELECT id INTO tpl_id
    FROM workshop_task_templates
    WHERE workshop_area = 'logistics'
      AND logistics_stage_id = st.id
      AND company_id IS NOT DISTINCT FROM st.company_id
    ORDER BY (is_active IS TRUE) DESC, order_index NULLS LAST, created_at
    LIMIT 1;

    IF tpl_id IS NULL THEN
      INSERT INTO workshop_task_templates
        (name, workshop_area, description, company_id, is_active, is_default, order_index, logistics_stage_id)
      VALUES
        ('VC/LĐ — ' || st.name, 'logistics',
         'Bộ mẫu 1 nhiệm vụ cho cột « ' || st.name || ' ».',
         st.company_id, true, false, COALESCE(st.order_index, 0), st.id)
      RETURNING id INTO tpl_id;
    ELSE
      UPDATE workshop_task_templates
      SET name        = 'VC/LĐ — ' || st.name,
          description = 'Bộ mẫu 1 nhiệm vụ cho cột « ' || st.name || ' ».',
          is_active   = true,
          order_index = COALESCE(st.order_index, 0),
          updated_at  = now()
      WHERE id = tpl_id;

      -- tắt các bộ dư của cùng một cột
      UPDATE workshop_task_templates
      SET is_active = false, updated_at = now()
      WHERE workshop_area = 'logistics'
        AND logistics_stage_id = st.id
        AND company_id IS NOT DISTINCT FROM st.company_id
        AND id <> tpl_id;
    END IF;

    -- giữ lại nhiệm vụ đầu tiên (để không mất cờ chặn cột / người phụ trách mặc định)
    SELECT id INTO keep_id
    FROM workshop_task_template_items
    WHERE template_id = tpl_id
    ORDER BY order_index NULLS LAST, created_at
    LIMIT 1;

    IF keep_id IS NULL THEN
      INSERT INTO workshop_task_template_items
        (template_id, title, description, priority, deadline_days, order_index, checklist)
      VALUES
        (tpl_id, v_title, v_desc, 'high', v_days, 1, v_check);
    ELSE
      UPDATE workshop_task_template_items
      SET title = v_title, description = v_desc, priority = 'high',
          deadline_days = v_days, order_index = 1, checklist = v_check
      WHERE id = keep_id;

      DELETE FROM workshop_task_template_items
      WHERE template_id = tpl_id AND id <> keep_id;
    END IF;
  END LOOP;
END $$;

COMMIT;
