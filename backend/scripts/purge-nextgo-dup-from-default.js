/**
 * Xóa bản trùng của NextGo còn nằm ở công ty cũ (HST mặc định).
 * Không thêm dòng mới vào HST NextGo. Lead không có bản trên NextGo được giữ.
 *
 *   node scripts/purge-nextgo-dup-from-default.js
 *   node scripts/purge-nextgo-dup-from-default.js --apply
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { primaryProjectRef } = require('../src/config/pgConnection');

const APPLY = process.argv.includes('--apply');
const OLD_COMPANY = '87479a83-1145-43b7-b090-3e40812cb5a9';
const NEW_COMPANY = '842cff41-0f8b-4cee-b7ec-d78ce27e7308';

const COUNT_SQL = `
WITH dup AS (
  SELECT o.id
  FROM crm_leads o
  WHERE o.company_id = '${OLD_COMPANY}'
    AND (
      EXISTS (
        SELECT 1 FROM crm_leads n
        WHERE n.company_id = '${NEW_COMPANY}' AND n.code = o.code
      )
      OR (
        COALESCE(o.title, '') <> ''
        AND NOT EXISTS (
          SELECT 1 FROM crm_leads n
          WHERE n.company_id = '${NEW_COMPANY}' AND n.code = o.code
        )
        AND (
          SELECT count(*) FROM crm_leads n
          WHERE n.company_id = '${NEW_COMPANY}' AND n.title = o.title
        ) = 1
      )
    )
)
SELECT
  (SELECT count(*)::int FROM dup) AS se_xoa,
  (SELECT count(*)::int FROM crm_leads WHERE company_id = '${OLD_COMPANY}' AND id NOT IN (SELECT id FROM dup)) AS se_giu,
  (SELECT count(*)::int FROM crm_leads WHERE company_id = '${NEW_COMPANY}') AS lead_nextgo,
  (SELECT count(*)::int FROM facebook_contacts WHERE page_id = '1102202982968909') AS contact_nextgo,
  (SELECT count(*)::int FROM facebook_messages m
     JOIN facebook_contacts c ON c.id = m.contact_id
     WHERE c.page_id = '1102202982968909') AS tin_nextgo
`;

const APPLY_SQL = `
DO $$
DECLARE
  n int;
  nextgo_before int;
  contacts_before int;
  messages_before int;
BEGIN
  SELECT count(*) INTO nextgo_before FROM crm_leads WHERE company_id = '${NEW_COMPANY}';
  SELECT count(*) INTO contacts_before FROM facebook_contacts WHERE page_id = '1102202982968909';
  SELECT count(*) INTO messages_before
  FROM facebook_messages m
  JOIN facebook_contacts c ON c.id = m.contact_id
  WHERE c.page_id = '1102202982968909';

  CREATE TEMP TABLE dup ON COMMIT DROP AS
  SELECT o.id AS old_id, o.project_id, o.code, o.title,
    (
      SELECT n.id FROM crm_leads n
      WHERE n.company_id = '${NEW_COMPANY}'
        AND (n.code = o.code OR (COALESCE(o.title, '') <> '' AND n.title = o.title))
      ORDER BY CASE WHEN n.code = o.code THEN 0 ELSE 1 END
      LIMIT 1
    ) AS new_id
  FROM crm_leads o
  WHERE o.company_id = '${OLD_COMPANY}'
    AND (
      EXISTS (
        SELECT 1 FROM crm_leads n
        WHERE n.company_id = '${NEW_COMPANY}' AND n.code = o.code
      )
      OR (
        COALESCE(o.title, '') <> ''
        AND NOT EXISTS (
          SELECT 1 FROM crm_leads n
          WHERE n.company_id = '${NEW_COMPANY}' AND n.code = o.code
        )
        AND (
          SELECT count(*) FROM crm_leads n
          WHERE n.company_id = '${NEW_COMPANY}' AND n.title = o.title
        ) = 1
      )
    );

  SELECT count(*) INTO n FROM dup;
  IF n <> 230 THEN
    RAISE EXCEPTION 'So lead trung khong dung: %', n;
  END IF;
  SELECT count(*) INTO n FROM crm_leads
  WHERE company_id = '${OLD_COMPANY}' AND id NOT IN (SELECT old_id FROM dup);
  IF n <> 8 THEN
    RAISE EXCEPTION 'So lead giu lai khong dung: %', n;
  END IF;

  UPDATE facebook_messages fm
  SET lead_id = d.new_id
  FROM dup d
  WHERE fm.lead_id = d.old_id
    AND d.new_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM facebook_messages x
      WHERE x.lead_id = d.new_id AND x.fb_message_id = fm.fb_message_id AND x.id <> fm.id
    );
  UPDATE facebook_messages fm
  SET lead_id = NULL
  WHERE fm.lead_id IN (SELECT old_id FROM dup);

  UPDATE facebook_contacts fc
  SET lead_id = NULL
  WHERE fc.lead_id IN (SELECT old_id FROM dup)
    AND EXISTS (
      SELECT 1 FROM facebook_contacts x
      JOIN dup d ON d.old_id = fc.lead_id
      WHERE x.lead_id = d.new_id
    );
  UPDATE facebook_contacts fc
  SET lead_id = d.new_id
  FROM dup d
  WHERE fc.lead_id = d.old_id
    AND d.new_id IS NOT NULL;

  CREATE TEMP TABLE dup_projects ON COMMIT DROP AS
  SELECT DISTINCT pr.id
  FROM projects pr
  WHERE pr.company_id = '${OLD_COMPANY}'
    AND NOT EXISTS (
      SELECT 1 FROM crm_leads keep
      WHERE keep.project_id = pr.id
        AND keep.company_id = '${OLD_COMPANY}'
        AND keep.id NOT IN (SELECT old_id FROM dup)
    )
    AND (
      EXISTS (
        SELECT 1 FROM dup d
        JOIN crm_leads n ON n.id = d.new_id
        WHERE d.project_id = pr.id
          AND n.project_id IS NOT NULL
      )
      OR EXISTS (
        SELECT 1 FROM crm_leads n
        WHERE n.company_id = '${NEW_COMPANY}'
          AND n.project_id IS NOT NULL
          AND n.title = pr.name
      )
    );

  DELETE FROM crm_task_attachments a USING dup d WHERE a.lead_id = d.old_id;
  DELETE FROM crm_tasks a USING dup d WHERE a.lead_id = d.old_id;
  DELETE FROM crm_assignments a USING dup d WHERE a.lead_id = d.old_id;
  DELETE FROM unified_task_history a USING dup d WHERE a.lead_id = d.old_id;
  DELETE FROM crm_events a USING dup d WHERE a.lead_id = d.old_id;
  DELETE FROM crm_call_logs a USING dup d WHERE a.lead_id = d.old_id;
  DELETE FROM voice_recordings a USING dup d WHERE a.lead_id = d.old_id;
  DELETE FROM purchase_orders a USING dup d WHERE a.lead_id = d.old_id;
  DELETE FROM cost_entries a USING dup d WHERE a.lead_id = d.old_id;
  DELETE FROM cost_excel_uploads a USING dup d WHERE a.lead_id = d.old_id;
  DELETE FROM crm_leads l USING dup d WHERE l.id = d.old_id;

  DELETE FROM tasks t USING dup_projects p WHERE t.project_id = p.id;
  DELETE FROM unified_task_history h USING dup_projects p WHERE h.project_id = p.id;
  DELETE FROM stage_transitions s USING dup_projects p WHERE s.project_id = p.id;
  UPDATE quotations q SET project_id = NULL FROM dup_projects p WHERE q.project_id = p.id;
  UPDATE orders o SET project_id = NULL FROM dup_projects p WHERE o.project_id = p.id;
  UPDATE invoices i SET project_id = NULL FROM dup_projects p WHERE i.project_id = p.id;
  DELETE FROM projects pr USING dup_projects p WHERE pr.id = p.id;

  DELETE FROM customers cu
  WHERE cu.company_id = '${OLD_COMPANY}'
    AND NOT EXISTS (SELECT 1 FROM crm_leads l WHERE l.customer_id = cu.id)
    AND NOT EXISTS (SELECT 1 FROM projects p WHERE p.customer_id = cu.id)
    AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = cu.id)
    AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i.customer_id = cu.id)
    AND NOT EXISTS (SELECT 1 FROM quotations q WHERE q.customer_id = cu.id)
    AND NOT EXISTS (SELECT 1 FROM facebook_contacts fc WHERE fc.customer_id = cu.id);

  SELECT count(*) INTO n FROM crm_leads WHERE company_id = '${NEW_COMPANY}';
  IF n <> nextgo_before THEN
    RAISE EXCEPTION 'Lead NextGo doi % -> %', nextgo_before, n;
  END IF;
  SELECT count(*) INTO n FROM facebook_contacts WHERE page_id = '1102202982968909';
  IF n <> contacts_before THEN
    RAISE EXCEPTION 'Contact NextGo doi % -> %', contacts_before, n;
  END IF;
  SELECT count(*) INTO n
  FROM facebook_messages m
  JOIN facebook_contacts c ON c.id = m.contact_id
  WHERE c.page_id = '1102202982968909';
  IF n <> messages_before THEN
    RAISE EXCEPTION 'Tin NextGo doi % -> %', messages_before, n;
  END IF;
  SELECT count(*) INTO n FROM crm_leads WHERE company_id = '${OLD_COMPANY}';
  IF n <> 8 THEN
    RAISE EXCEPTION 'Cong ty cu khong con dung 8 lead: %', n;
  END IF;
END $$;
`;

async function runSql(query) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = primaryProjectRef();
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) throw new Error(body && body.message ? body.message : String(text).slice(0, 800));
  return body;
}

async function main() {
  const before = await runSql(COUNT_SQL);
  const snap = Array.isArray(before) ? before[0] : before;
  console.log(APPLY ? 'APPLY' : 'DRY-RUN', snap);
  if (Number(snap.se_xoa) !== 230 || Number(snap.se_giu) !== 8) {
    throw new Error('So lieu khong dung ky vong');
  }
  if (!APPLY) {
    console.log('Dry-run xong. Khong ghi vao HST NextGo.');
    return;
  }
  await runSql(APPLY_SQL);
  const after = await runSql(COUNT_SQL);
  const done = Array.isArray(after) ? after[0] : after;
  console.log('Sau', done);
  if (Number(done.lead_nextgo) !== Number(snap.lead_nextgo)) {
    throw new Error('Lead NextGo bi doi');
  }
  if (Number(done.se_giu) !== 8 || Number(done.se_xoa) !== 0) {
    throw new Error(`Ket qua lech: ${JSON.stringify(done)}`);
  }
  const file = path.join(__dirname, '..', 'uploads', `_purge_nextgo_dup_from_default_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify({ at: new Date().toISOString(), before: snap, after: done, kept: 8, deleted_duplicates: 230 }, null, 2));
  console.log('Xong', file);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
