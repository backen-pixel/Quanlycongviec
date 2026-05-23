-- =====================================================================
-- 228. Dọn nhiệm vụ trùng cho MỘT deal/lead (dùng mã code, không cần UUID)
-- ---------------------------------------------------------------------
-- Dùng khi 1 deal cụ thể đang hiện 6/8/9 nhiệm vụ thay vì 3 (Tư vấn lần
-- 1/2/3 bị nhân lên). Không động đến deal khác, không xoá template.
--
-- CÁCH DÙNG:
--   1) Chạy bước (A) để xem các deal đang có nhiệm vụ trùng.
--   2) Copy mã deal (cột `lead_code`) bạn muốn xử lý.
--   3) Trong bước (B)(C), thay 'DEAL-XXX' bằng mã thật rồi chạy.
--
-- An toàn:
--   - Chỉ xoá task chưa có attachment / chưa có note nội dung.
--   - Giữ bản: completed > in_progress > pending, cùng status thì giữ
--     bản tạo sớm nhất.
-- =====================================================================


-- ─── (A) TÌM DEAL ĐANG BỊ LỖI — chạy luôn, không cần thay gì ──────
SELECT
  l.code                          AS lead_code,
  l.title                         AS lead_title,
  l.type                          AS lead_type,
  COUNT(*) FILTER (WHERE 1=1)     AS tasks_total,
  COUNT(*) - COUNT(DISTINCT (
    COALESCE(ct.pipeline_stage_id::text, 'slug:' || COALESCE(ct.stage_slug, '')) ||
    '|' || lower(trim(ct.title))
  ))                              AS duplicates_count,
  l.id                            AS lead_id_for_reference
FROM crm_tasks ct
JOIN crm_leads l ON l.id = ct.lead_id
WHERE NOT (ct.stage_slug IS NOT NULL AND ct.stage_slug LIKE 'sx_%')
GROUP BY l.id, l.code, l.title, l.type
HAVING COUNT(*) - COUNT(DISTINCT (
    COALESCE(ct.pipeline_stage_id::text, 'slug:' || COALESCE(ct.stage_slug, '')) ||
    '|' || lower(trim(ct.title))
  )) > 0
ORDER BY duplicates_count DESC, l.code;


-- ─── (B) PREVIEW deal cụ thể — THAY 'DEAL-XXX' bằng mã thật ───────
WITH target AS (
  SELECT id FROM crm_leads WHERE code = 'DEAL-XXX'   -- ← thay ở đây
),
ranked AS (
  SELECT
    ct.id,
    ct.lead_id,
    ct.pipeline_stage_id,
    ct.stage_slug,
    ct.title,
    ct.status,
    ct.created_at,
    ROW_NUMBER() OVER (
      PARTITION BY
        ct.lead_id,
        COALESCE(ct.pipeline_stage_id::text, 'slug:' || COALESCE(ct.stage_slug, '')),
        lower(trim(ct.title))
      ORDER BY
        CASE ct.status
          WHEN 'completed'   THEN 0
          WHEN 'in_progress' THEN 1
          WHEN 'pending'     THEN 2
          ELSE 3
        END,
        ct.created_at
    ) AS rn,
    COUNT(*) OVER (
      PARTITION BY
        ct.lead_id,
        COALESCE(ct.pipeline_stage_id::text, 'slug:' || COALESCE(ct.stage_slug, '')),
        lower(trim(ct.title))
    ) AS dup_count
  FROM crm_tasks ct
  JOIN target t ON t.id = ct.lead_id
  WHERE NOT (ct.stage_slug IS NOT NULL AND ct.stage_slug LIKE 'sx_%')
)
SELECT
  CASE WHEN rn = 1 THEN '✅ KEEP' ELSE '🗑️ DELETE' END AS action,
  rn, dup_count,
  id, title, status, stage_slug, pipeline_stage_id, created_at
FROM ranked
WHERE dup_count > 1
ORDER BY title, rn;


-- ─── (C) DELETE deal cụ thể — THAY 'DEAL-XXX' và uncomment ────────
-- BEGIN;
-- WITH target AS (
--   SELECT id FROM crm_leads WHERE code = 'DEAL-XXX'   -- ← thay ở đây
-- ),
-- ranked AS (
--   SELECT
--     ct.id,
--     ROW_NUMBER() OVER (
--       PARTITION BY
--         ct.lead_id,
--         COALESCE(ct.pipeline_stage_id::text, 'slug:' || COALESCE(ct.stage_slug, '')),
--         lower(trim(ct.title))
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
--   JOIN target t ON t.id = ct.lead_id
--   WHERE NOT (ct.stage_slug IS NOT NULL AND ct.stage_slug LIKE 'sx_%')
-- ),
-- to_delete AS (
--   SELECT r.id
--   FROM   ranked r
--   LEFT JOIN crm_task_attachments a ON a.task_id = r.id
--   LEFT JOIN crm_tasks t            ON t.id     = r.id
--   WHERE  r.rn > 1
--     AND  (t.notes IS NULL OR length(trim(t.notes)) = 0)
--   GROUP BY r.id
--   HAVING COUNT(a.id) = 0
-- )
-- DELETE FROM crm_tasks WHERE id IN (SELECT id FROM to_delete);
-- COMMIT;
-- -- Đổi COMMIT → ROLLBACK để dry-run.


-- ─── (D) XÁC MINH deal đã sạch ─────────────────────────────────────
-- WITH target AS (
--   SELECT id FROM crm_leads WHERE code = 'DEAL-XXX'   -- ← thay ở đây
-- )
-- SELECT ct.title, COUNT(*)
-- FROM crm_tasks ct
-- JOIN target t ON t.id = ct.lead_id
-- WHERE NOT (ct.stage_slug IS NOT NULL AND ct.stage_slug LIKE 'sx_%')
-- GROUP BY ct.pipeline_stage_id, ct.stage_slug, lower(trim(ct.title))
-- HAVING COUNT(*) > 1;


-- =====================================================================
-- TIP: muốn dọn TẤT CẢ deal cùng lúc → dùng block (B2) trong file 225.
-- =====================================================================
