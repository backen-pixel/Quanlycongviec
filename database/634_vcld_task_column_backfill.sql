-- 634: VC/LĐ — gán lại đúng cột pipeline cho nhiệm vụ đã tạo
-- Lỗi gốc: cột của task được ĐOÁN theo tiêu đề (guessLogisticsPipelineBucketFromTitle)
-- thay vì lấy cột mà bộ mẫu đang gắn → tiêu đề không khớp từ khoá thì task rơi hết
-- vào cột đầu tiên của bảng (frontend fallback `stages[0]`).
-- Đã sửa backend: workshopApplyTemplates.js dùng tpl.logistics_stage_id.
-- Migration này vá dữ liệu cũ. Idempotent.
-- Backup: _bak_20260924_vcld_task_meta

BEGIN;

CREATE TABLE IF NOT EXISTS _bak_20260924_vcld_task_meta AS
SELECT t.id, t.metadata, now() AS backed_up_at
FROM tasks t
WHERE t.metadata->>'workshop_area' = 'logistics';

-- A) Task sinh từ bộ mẫu CÓ gắn cột → lấy thẳng cột của bộ mẫu
WITH m AS (
  SELECT t.id AS task_id, w.logistics_stage_id AS cot
  FROM tasks t
  JOIN workshop_task_templates w ON w.id = (t.metadata->>'workshop_template_id')::uuid
  JOIN logistics_pipeline_stages s ON s.id = w.logistics_stage_id
  JOIN projects p ON p.id = t.project_id
  WHERE t.metadata->>'workshop_area' = 'logistics'
    AND w.logistics_stage_id IS NOT NULL
    AND s.company_id IS NOT DISTINCT FROM COALESCE(p.logistics_company_id, p.company_id)
    AND (t.metadata->>'logistics_pipeline_stage_id') IS DISTINCT FROM w.logistics_stage_id::text
)
UPDATE tasks t
SET metadata   = t.metadata || jsonb_build_object('logistics_pipeline_stage_id', m.cot::text),
    updated_at = now()
FROM m
WHERE m.task_id = t.id;

-- B) Task sinh từ "Bộ mẫu chung VC/LĐ" (không gắn cột) → map theo tên việc gốc
WITH tgt AS (
  SELECT t.id AS task_id,
         COALESCE(p.logistics_company_id, p.company_id) AS cid,
         b.title AS item_title
  FROM tasks t
  JOIN workshop_task_templates w ON w.id = (t.metadata->>'workshop_template_id')::uuid
  JOIN projects p ON p.id = t.project_id
  JOIN _bak_20260924_vcld_template_items b ON b.id = (t.metadata->>'workshop_template_item_id')::uuid
  WHERE t.metadata->>'workshop_area' = 'logistics'
    AND w.logistics_stage_id IS NULL
),
pick AS (
  SELECT tgt.task_id,
    COALESCE(
      (SELECT s.id FROM logistics_pipeline_stages s
        WHERE s.is_active IS NOT FALSE
          AND s.company_id IS NOT DISTINCT FROM tgt.cid
          AND CASE
                WHEN tgt.item_title = 'Kiểm tra trước khi lấy hàng'   THEN s.name IN ('Tiếp nhận', 'Tiếp nhận giao hàng', 'Chờ giao hàng')
                WHEN tgt.item_title = 'Hàng lên xe và vận chuyển'     THEN s.name = 'Đang giao'
                WHEN tgt.item_title = 'Kiểm tra trước khi giao hàng'  THEN s.name = 'Đang giao'
                WHEN tgt.item_title = 'Kiểm tra và nhận hàng'         THEN s.name = 'Đã giao'
                WHEN tgt.item_title = 'Quy trình lắp đặt'             THEN s.name = 'Lắp đặt'
                WHEN tgt.item_title = 'Nghiệm thu sau khi lắp'        THEN s.name LIKE '%Nghiệm thu%'
                ELSE false
              END
        ORDER BY s.order_index
        LIMIT 1),
      (SELECT s.id FROM logistics_pipeline_stages s
        WHERE s.is_active IS NOT FALSE
          AND s.company_id IS NULL
          AND CASE
                WHEN tgt.item_title = 'Kiểm tra trước khi lấy hàng'   THEN s.name IN ('Tiếp nhận', 'Tiếp nhận giao hàng', 'Chờ giao hàng')
                WHEN tgt.item_title = 'Hàng lên xe và vận chuyển'     THEN s.name = 'Đang giao'
                WHEN tgt.item_title = 'Kiểm tra trước khi giao hàng'  THEN s.name = 'Đang giao'
                WHEN tgt.item_title = 'Kiểm tra và nhận hàng'         THEN s.name = 'Đã giao'
                WHEN tgt.item_title = 'Quy trình lắp đặt'             THEN s.name = 'Lắp đặt'
                WHEN tgt.item_title = 'Nghiệm thu sau khi lắp'        THEN s.name LIKE '%Nghiệm thu%'
                ELSE false
              END
        ORDER BY s.order_index
        LIMIT 1)
    ) AS cot
  FROM tgt
)
UPDATE tasks t
SET metadata   = t.metadata || jsonb_build_object('logistics_pipeline_stage_id', pick.cot::text),
    updated_at = now()
FROM pick
WHERE pick.task_id = t.id
  AND pick.cot IS NOT NULL
  AND (t.metadata->>'logistics_pipeline_stage_id') IS DISTINCT FROM pick.cot::text;

COMMIT;
