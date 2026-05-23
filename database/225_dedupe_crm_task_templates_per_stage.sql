-- =====================================================================
-- 225. Phát hiện + dọn template CRM trùng theo pipeline_stage
-- ---------------------------------------------------------------------
-- Triệu chứng: giai đoạn có "Tư vấn lần 1/2/3" (3 mục đã setup)
-- nhưng deal/lead lại hiện 9 nhiệm vụ (mỗi mục lặp 3 lần).
--
-- ⚠️ QUAN TRỌNG: Phải chạy KÈM migration 227
-- (drop trigger fn_auto_gen_crm_tasks). Trigger cũ ở migration 39
-- là thủ phạm chính sinh duplicate khi tạo lead/deal mới — KHÔNG dọn
-- dữ liệu ở đây mà còn để trigger sống thì lead/deal mới vẫn nhân tasks.
--
-- Nguyên nhân: 1 pipeline_stage_id đang gắn nhiều bản crm_task_templates
-- (do user lỡ tạo trùng / clone), khi autoGenCrmTasks (và TRIGGER cũ) gộp
-- items từ tất cả template active ⇒ items bị nhân lên N lần.
--
-- File này:
--   (A) Chỉ chẩn đoán — KHÔNG xoá gì.
--   (B) Khối DELETE đã comment sẵn — admin tự uncomment để dọn theo từng
--       trường hợp. Đọc kỹ trước khi chạy.
-- =====================================================================

-- ─── (A1) Liệt kê các pipeline_stage_id có >1 template active ──────
SELECT
  ps.pipeline_id,
  p.name        AS pipeline_name,
  ps.id         AS pipeline_stage_id,
  ps.name       AS stage_name,
  COUNT(t.id)   AS active_template_count,
  array_agg(t.id ORDER BY t.created_at)            AS template_ids,
  array_agg(t.name ORDER BY t.created_at)          AS template_names,
  array_agg(t.created_at ORDER BY t.created_at)    AS created_ats
FROM crm_task_templates t
JOIN crm_pipeline_stages ps ON ps.id = t.pipeline_stage_id
LEFT JOIN crm_pipelines  p  ON p.id  = ps.pipeline_id
WHERE t.is_active = true
  AND t.pipeline_stage_id IS NOT NULL
GROUP BY ps.pipeline_id, p.name, ps.id, ps.name
HAVING COUNT(t.id) > 1
ORDER BY p.name, ps.order_index;

-- ─── (A2) Đếm crm_tasks bị nhân đôi theo (lead_id, pipeline_stage_id, title) ──
SELECT
  ct.lead_id,
  l.code            AS lead_code,
  l.title           AS lead_title,
  ct.pipeline_stage_id,
  ps.name           AS stage_name,
  ct.title          AS task_title,
  COUNT(*)          AS occurrences,
  array_agg(ct.id ORDER BY ct.created_at)        AS task_ids,
  array_agg(ct.status ORDER BY ct.created_at)    AS statuses,
  array_agg(ct.created_at ORDER BY ct.created_at) AS created_ats
FROM crm_tasks ct
JOIN crm_leads          l  ON l.id  = ct.lead_id
LEFT JOIN crm_pipeline_stages ps ON ps.id = ct.pipeline_stage_id
WHERE ct.pipeline_stage_id IS NOT NULL
  AND NOT (ct.stage_slug IS NOT NULL AND ct.stage_slug LIKE 'sx_%')  -- bỏ qua nhiệm vụ SX
GROUP BY ct.lead_id, l.code, l.title, ct.pipeline_stage_id, ps.name, ct.title
HAVING COUNT(*) > 1
ORDER BY l.code NULLS LAST, ps.name, ct.title;

-- ─── (A3) Tổng số task duplicate có thể xoá (giữ lại bản cũ nhất / có status tốt nhất) ──
WITH dup AS (
  SELECT
    ct.id,
    ct.lead_id,
    ct.pipeline_stage_id,
    ct.title,
    ct.status,
    ct.created_at,
    ROW_NUMBER() OVER (
      PARTITION BY ct.lead_id, ct.pipeline_stage_id, lower(trim(ct.title))
      ORDER BY
        CASE ct.status
          WHEN 'completed'   THEN 0
          WHEN 'in_progress' THEN 1
          WHEN 'pending'     THEN 2
          ELSE 3
        END,
        ct.created_at
    ) AS rn
  FROM crm_tasks ct
  WHERE ct.pipeline_stage_id IS NOT NULL
    AND NOT (ct.stage_slug IS NOT NULL AND ct.stage_slug LIKE 'sx_%')
)
SELECT
  COUNT(*)                              AS total_duplicates_to_delete,
  COUNT(DISTINCT lead_id)               AS affected_leads,
  COUNT(DISTINCT pipeline_stage_id)     AS affected_stages
FROM dup
WHERE rn > 1;


-- =====================================================================
-- (B) DỌN DỮ LIỆU — Comment sẵn. Uncomment khi đã review query (A) ở trên.
-- =====================================================================

-- ─── (B1) Xoá template trùng cho cùng pipeline_stage ─────────────────
-- Quy tắc: với mỗi pipeline_stage_id, giữ lại template ĐẦU TIÊN (tạo sớm nhất).
-- Soft-delete bằng cách is_active = false để vẫn còn dữ liệu lịch sử.
-- (Nếu muốn xoá cứng, đổi UPDATE thành DELETE — nhưng items sẽ bị xoá theo cascade.)
--
-- BEGIN;
-- WITH ranked AS (
--   SELECT
--     id, pipeline_stage_id,
--     ROW_NUMBER() OVER (
--       PARTITION BY pipeline_stage_id
--       ORDER BY created_at, id
--     ) AS rn
--   FROM crm_task_templates
--   WHERE is_active = true
--     AND pipeline_stage_id IS NOT NULL
-- )
-- UPDATE crm_task_templates t
-- SET    is_active = false,
--        name      = name || ' [auto-disabled duplicate ' || to_char(NOW(), 'YYYY-MM-DD') || ']'
-- FROM   ranked r
-- WHERE  t.id = r.id
--   AND  r.rn > 1;
-- COMMIT;


-- ─── (B2) Xoá crm_tasks duplicate cho từng (lead, pipeline_stage, title) ──
-- Giữ lại bản:
--   • Ưu tiên status completed > in_progress > pending > khác
--   • Trong cùng status, giữ bản tạo sớm nhất.
-- An toàn: chỉ xoá task chưa có attachment/note (tránh mất minh chứng).
--
-- BEGIN;
-- WITH ranked AS (
--   SELECT
--     ct.id,
--     ROW_NUMBER() OVER (
--       PARTITION BY ct.lead_id, ct.pipeline_stage_id, lower(trim(ct.title))
--       ORDER BY
--         CASE ct.status
--           WHEN 'completed'   THEN 0
--           WHEN 'in_progress' THEN 1
--           WHEN 'pending'     THEN 2
--           ELSE 3
--         END,
--         ct.created_at
--     ) AS rn
--   FROM crm_tasks ct
--   WHERE ct.pipeline_stage_id IS NOT NULL
--     AND NOT (ct.stage_slug IS NOT NULL AND ct.stage_slug LIKE 'sx_%')
-- ),
-- to_delete AS (
--   SELECT r.id
--   FROM   ranked r
--   LEFT JOIN crm_task_attachments a ON a.task_id = r.id
--   WHERE  r.rn > 1
--   GROUP BY r.id
--   HAVING COUNT(a.id) = 0
-- )
-- DELETE FROM crm_tasks WHERE id IN (SELECT id FROM to_delete);
-- COMMIT;

-- ─── (B3) Sau khi dọn, kiểm tra lại không còn duplicate ───────────────
-- SELECT lead_id, pipeline_stage_id, title, COUNT(*)
-- FROM   crm_tasks
-- WHERE  pipeline_stage_id IS NOT NULL
--   AND  NOT (stage_slug IS NOT NULL AND stage_slug LIKE 'sx_%')
-- GROUP BY lead_id, pipeline_stage_id, title
-- HAVING COUNT(*) > 1;
