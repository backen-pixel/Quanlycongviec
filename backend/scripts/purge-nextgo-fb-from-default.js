/**
 * Gỡ lead Facebook của NextGo còn nằm ở công ty cũ (HST mặc định / Phúc Đạt).
 * Giữ nguyên lead, hội thoại, tin nhắn và page của HST NextGo.
 *
 *   node scripts/purge-nextgo-fb-from-default.js
 *   node scripts/purge-nextgo-fb-from-default.js --apply
 *   node scripts/purge-nextgo-fb-from-default.js --apply --backup
 */
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { primaryProjectRef, backupProjectRef } = require('../src/config/pgConnection');

const APPLY = process.argv.includes('--apply');
const USE_BACKUP = process.argv.includes('--backup');

const OLD_COMPANY = '87479a83-1145-43b7-b090-3e40812cb5a9';
const NEW_COMPANY = '842cff41-0f8b-4cee-b7ec-d78ce27e7308';
const OLD_SOURCE = '445ad66b-ba86-4032-b172-595cc573204b';
const ORPHAN = '45781669-6557-4d9d-b3c5-cb5c1b0152de';
const PAGE = '1102202982968909';

const COUNT_SQL = `
WITH map_fb AS (
  SELECT o.id AS old_id, n.id AS new_id
  FROM crm_leads o
  LEFT JOIN crm_leads n
    ON n.company_id = '${NEW_COMPANY}'
   AND (n.code = o.code OR (o.code = 'DEAL-2073' AND n.code = 'DEAL-2073-NGC'))
  WHERE o.company_id = '${OLD_COMPANY}'
    AND o.source_id = '${OLD_SOURCE}'
)
SELECT
  (SELECT count(*)::int FROM map_fb) AS lead_cu,
  (SELECT count(*)::int FROM map_fb WHERE new_id IS NOT NULL) AS da_co_ban_nextgo,
  (SELECT count(*)::int FROM map_fb WHERE new_id IS NULL) AS chua_co_ban,
  (SELECT count(*)::int FROM crm_leads WHERE company_id = '${NEW_COMPANY}') AS lead_nextgo,
  (SELECT count(*)::int FROM facebook_contacts WHERE page_id = '${PAGE}') AS contact_nextgo,
  (SELECT count(*)::int FROM facebook_messages m
     JOIN facebook_contacts c ON c.id = m.contact_id
     WHERE c.page_id = '${PAGE}') AS tin_nextgo,
  (SELECT count(*)::int FROM crm_leads
     WHERE company_id = '${OLD_COMPANY}' AND source_id = '${OLD_SOURCE}') AS con_lead_fb_cu,
  (SELECT count(*)::int FROM crm_sources WHERE id = '${OLD_SOURCE}') AS con_nguon_cu
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
  SELECT count(*) INTO contacts_before FROM facebook_contacts WHERE page_id = '${PAGE}';
  SELECT count(*) INTO messages_before
  FROM facebook_messages m
  JOIN facebook_contacts c ON c.id = m.contact_id
  WHERE c.page_id = '${PAGE}';

  CREATE TEMP TABLE map_fb ON COMMIT DROP AS
  SELECT o.id AS old_id, n.id AS new_id, o.customer_id, o.code, o.title
  FROM crm_leads o
  LEFT JOIN crm_leads n
    ON n.company_id = '${NEW_COMPANY}'
   AND (n.code = o.code OR (o.code = 'DEAL-2073' AND n.code = 'DEAL-2073-NGC'))
  WHERE o.company_id = '${OLD_COMPANY}'
    AND o.source_id = '${OLD_SOURCE}';

  SELECT count(*) INTO n FROM map_fb;
  IF n <> 365 THEN
    RAISE EXCEPTION 'So lead FB cu khong dung: %', n;
  END IF;
  SELECT count(*) INTO n FROM map_fb WHERE new_id IS NULL AND old_id <> '${ORPHAN}';
  IF n <> 0 THEN
    RAISE EXCEPTION 'Con lead chua co ban NextGo: %', n;
  END IF;

  UPDATE facebook_contacts fc
  SET lead_id = sub.new_id,
      customer_id = CASE
        WHEN sub.old_customer_company = '${OLD_COMPANY}' THEN sub.new_customer_id
        ELSE fc.customer_id
      END
  FROM (
    SELECT m.new_id, nl.customer_id AS new_customer_id, cu.company_id AS old_customer_company, fc2.id AS contact_id
    FROM map_fb m
    JOIN crm_leads nl ON nl.id = m.new_id
    JOIN facebook_contacts fc2 ON fc2.lead_id = m.old_id
    LEFT JOIN customers cu ON cu.id = fc2.customer_id
    WHERE m.new_id IS NOT NULL
  ) sub
  WHERE fc.id = sub.contact_id;

  UPDATE facebook_messages fm
  SET lead_id = m.new_id
  FROM map_fb m
  WHERE fm.lead_id = m.old_id
    AND m.new_id IS NOT NULL;

  DELETE FROM crm_task_attachments a USING map_fb m WHERE a.lead_id = m.old_id;
  DELETE FROM crm_tasks a USING map_fb m WHERE a.lead_id = m.old_id;
  DELETE FROM crm_assignments a USING map_fb m WHERE a.lead_id = m.old_id;
  DELETE FROM unified_task_history a USING map_fb m WHERE a.lead_id = m.old_id;
  DELETE FROM crm_events a USING map_fb m WHERE a.lead_id = m.old_id;
  DELETE FROM crm_call_logs a USING map_fb m WHERE a.lead_id = m.old_id;
  DELETE FROM voice_recordings a USING map_fb m WHERE a.lead_id = m.old_id;
  DELETE FROM purchase_orders a USING map_fb m WHERE a.lead_id = m.old_id;
  DELETE FROM cost_entries a USING map_fb m WHERE a.lead_id = m.old_id;
  DELETE FROM cost_excel_uploads a USING map_fb m WHERE a.lead_id = m.old_id;

  DELETE FROM crm_leads l USING map_fb m WHERE l.id = m.old_id;

  DELETE FROM crm_sources s
  WHERE s.id = '${OLD_SOURCE}'
    AND NOT EXISTS (SELECT 1 FROM crm_leads l WHERE l.source_id = s.id);

  DELETE FROM customers cu
  WHERE cu.id IN (SELECT customer_id FROM map_fb WHERE customer_id IS NOT NULL)
    AND cu.company_id = '${OLD_COMPANY}'
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
  SELECT count(*) INTO n FROM facebook_contacts WHERE page_id = '${PAGE}';
  IF n <> contacts_before THEN
    RAISE EXCEPTION 'Contact NextGo doi % -> %', contacts_before, n;
  END IF;
  SELECT count(*) INTO n
  FROM facebook_messages m
  JOIN facebook_contacts c ON c.id = m.contact_id
  WHERE c.page_id = '${PAGE}';
  IF n <> messages_before THEN
    RAISE EXCEPTION 'Tin nhan NextGo doi % -> %', messages_before, n;
  END IF;

  SELECT count(*) INTO n
  FROM crm_leads
  WHERE company_id = '${OLD_COMPANY}' AND source_id = '${OLD_SOURCE}';
  IF n <> 0 THEN
    RAISE EXCEPTION 'Con lead FB tren cong ty cu: %', n;
  END IF;
END $$;
`;

async function runSql(query) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const ref = USE_BACKUP ? backupProjectRef() : primaryProjectRef();
  if (!token || !ref) throw new Error('Thieu SUPABASE_ACCESS_TOKEN hoac project ref');
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  if (!res.ok) {
    const msg = body && body.message ? body.message : String(text).slice(0, 800);
    throw new Error(`SQL ${res.status}: ${msg}`);
  }
  return body;
}

async function main() {
  console.log(USE_BACKUP ? 'Backup' : 'Primary', APPLY ? 'APPLY' : 'DRY-RUN');
  const before = await runSql(COUNT_SQL);
  const snap = Array.isArray(before) ? before[0] : before;
  console.log('Truoc:', snap);
  if (Number(snap.lead_cu) !== 365 && Number(snap.con_lead_fb_cu) !== 0) {
    throw new Error(`So lead FB cu khong dung: ${snap.lead_cu}`);
  }
  if (!APPLY) {
    if (Number(snap.chua_co_ban) !== 1) throw new Error(`So lead chua co ban NextGo: ${snap.chua_co_ban}`);
    console.log('Dry-run dung so lieu. Chay lai voi --apply de xoa.');
    return;
  }
  if (Number(snap.con_lead_fb_cu) === 0) {
    console.log('Khong con lead FB cu. Bo qua.');
    return;
  }
  await runSql(APPLY_SQL);
  const after = await runSql(COUNT_SQL);
  const done = Array.isArray(after) ? after[0] : after;
  console.log('Sau:', done);
  if (Number(done.lead_nextgo) !== Number(snap.lead_nextgo)) {
    throw new Error(`Lead NextGo doi ${snap.lead_nextgo} -> ${done.lead_nextgo}`);
  }
  if (Number(done.contact_nextgo) !== Number(snap.contact_nextgo)) {
    throw new Error(`Contact NextGo doi ${snap.contact_nextgo} -> ${done.contact_nextgo}`);
  }
  if (Number(done.tin_nextgo) !== Number(snap.tin_nextgo)) {
    throw new Error(`Tin NextGo doi ${snap.tin_nextgo} -> ${done.tin_nextgo}`);
  }
  if (Number(done.con_lead_fb_cu) !== 0 || Number(done.con_nguon_cu) !== 0) {
    throw new Error(`Con du lieu FB cu: ${JSON.stringify(done)}`);
  }
  const summary = {
    at: new Date().toISOString(),
    target: USE_BACKUP ? 'backup' : 'primary',
    orphan: { id: ORPHAN, code: 'DEAL-2026-998', title: '[FL Deal]_Nhã Vy Nguyễn' },
    before: snap,
    after: done,
  };
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(
    __dirname,
    '..',
    'uploads',
    `_purge_nextgo_fb_from_default_${USE_BACKUP ? 'backup' : 'primary'}_${stamp}.json`,
  );
  fs.writeFileSync(file, JSON.stringify(summary, null, 2));
  console.log('Xong', file);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
