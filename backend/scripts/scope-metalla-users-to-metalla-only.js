/**
 * Huy Metalla + Lê Huy Tiến Toại: chỉ thuộc công ty Metalla.
 * Gỡ khỏi lead_members / assignee / owner trên deal không thuộc Metalla.
 *
 * Usage:
 *   node scripts/scope-metalla-users-to-metalla-only.js
 *   node scripts/scope-metalla-users-to-metalla-only.js --dry-run
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const PRIMARY_REF = process.env.PRIMARY_PROJECT_REF || 'kdxypztstbeovyedmvem';
const BACKUP_REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';
const DRY = process.argv.includes('--dry-run');

const METALLA = 'b78baba2-2486-434c-a72d-9c937fac2164';
const USER_IDS = [
  'defa39da-c514-4cd8-bfe5-68fcbb8eb09b', // Huy Metalla
  '717cee7b-dedc-4226-8979-9829cf110cb0', // Lê Huy Tiến Toại
];

const idsList = USER_IDS.map((id) => `'${id}'`).join(',');

function sqlFor(dry) {
  const prefix = dry ? '-- DRY\n' : '';
  return `
${prefix}
-- 0) Snapshot trước
SELECT 'before_users' AS step, u.full_name, u.role, u.company_id, c.name AS company
FROM users u
LEFT JOIN companies c ON c.id = u.company_id
WHERE u.id IN (${idsList});

SELECT 'before_lead_members' AS step, c.name AS deal_company, u.full_name, COUNT(*)::int AS n
FROM lead_members lm
JOIN crm_leads l ON l.id = lm.lead_id
JOIN companies c ON c.id = l.company_id
JOIN users u ON u.id = lm.user_id
WHERE lm.user_id IN (${idsList})
GROUP BY c.name, u.full_name
ORDER BY c.name, u.full_name;

${dry ? 'SELECT 1 AS dry_run;' : `
-- 1) Khóa company_id = Metalla
UPDATE users
SET company_id = '${METALLA}'
WHERE id IN (${idsList})
  AND (company_id IS DISTINCT FROM '${METALLA}');

-- 2) user_companies: chỉ giữ Metalla
DELETE FROM user_companies
WHERE user_id IN (${idsList})
  AND company_id <> '${METALLA}';

INSERT INTO user_companies (user_id, company_id, is_primary)
SELECT u.id, '${METALLA}', true
FROM users u
WHERE u.id IN (${idsList})
  AND NOT EXISTS (
    SELECT 1 FROM user_companies uc
    WHERE uc.user_id = u.id AND uc.company_id = '${METALLA}'
  );

-- 3) Gỡ lead_members khỏi deal không thuộc Metalla
WITH doomed AS (
  SELECT lm.lead_id, lm.user_id
  FROM lead_members lm
  JOIN crm_leads l ON l.id = lm.lead_id
  WHERE lm.user_id IN (${idsList})
    AND l.company_id IS DISTINCT FROM '${METALLA}'
)
DELETE FROM lead_members lm
USING doomed d
WHERE lm.lead_id = d.lead_id AND lm.user_id = d.user_id;

-- 4) Clear phụ trách deal ngoài Metalla
UPDATE crm_leads l
SET assigned_to = NULL
WHERE l.assigned_to IN (${idsList})
  AND l.company_id IS DISTINCT FROM '${METALLA}';

UPDATE crm_leads l
SET lead_owner_id = NULL
WHERE l.lead_owner_id IN (${idsList})
  AND l.company_id IS DISTINCT FROM '${METALLA}';

-- 5) Gỡ assignee nhiệm vụ CRM ngoài Metalla
DELETE FROM crm_task_assignees ta
USING crm_tasks t, crm_leads l
WHERE ta.task_id = t.id
  AND t.lead_id = l.id
  AND ta.user_id IN (${idsList})
  AND l.company_id IS DISTINCT FROM '${METALLA}';

UPDATE crm_tasks t
SET assignee_id = NULL
FROM crm_leads l
WHERE t.lead_id = l.id
  AND t.assignee_id IN (${idsList})
  AND l.company_id IS DISTINCT FROM '${METALLA}';

-- 6) Gỡ project_production_staff ngoài Metalla (nếu có)
DELETE FROM project_production_staff pps
USING projects p
WHERE pps.project_id = p.id
  AND pps.user_id IN (${idsList})
  AND p.company_id IS DISTINCT FROM '${METALLA}';
`}

-- Sau
SELECT 'after_users' AS step, u.full_name, u.role, u.company_id, c.name AS company
FROM users u
LEFT JOIN companies c ON c.id = u.company_id
WHERE u.id IN (${idsList});

SELECT 'after_lead_members' AS step, COALESCE(c.name, '(none)') AS deal_company, u.full_name, COUNT(*)::int AS n
FROM users u
LEFT JOIN lead_members lm ON lm.user_id = u.id
LEFT JOIN crm_leads l ON l.id = lm.lead_id
LEFT JOIN companies c ON c.id = l.company_id
WHERE u.id IN (${idsList})
GROUP BY c.name, u.full_name
ORDER BY c.name NULLS LAST, u.full_name;

SELECT 'after_non_metalla_members' AS step, COUNT(*)::int AS leftover
FROM lead_members lm
JOIN crm_leads l ON l.id = lm.lead_id
WHERE lm.user_id IN (${idsList})
  AND l.company_id IS DISTINCT FROM '${METALLA}';

SELECT 'after_non_metalla_task_assignees' AS step, COUNT(*)::int AS leftover
FROM crm_task_assignees ta
JOIN crm_tasks t ON t.id = ta.task_id
JOIN crm_leads l ON l.id = t.lead_id
WHERE ta.user_id IN (${idsList})
  AND l.company_id IS DISTINCT FROM '${METALLA}';
`;
}

async function runQuery(ref, label) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TOKEN}`,
    },
    body: JSON.stringify({ query: sqlFor(DRY) }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`[${label}] ${res.status}: ${text}`);
  console.log(`\n========== ${label}${DRY ? ' (DRY)' : ''} ==========`);
  try {
    console.log(JSON.stringify(JSON.parse(text), null, 2));
  } catch {
    console.log(text);
  }
}

async function main() {
  if (!TOKEN) {
    console.error('Thiếu SUPABASE_ACCESS_TOKEN');
    process.exit(1);
  }
  console.log('Users:', USER_IDS.join(', '));
  console.log('Metalla:', METALLA);
  await runQuery(PRIMARY_REF, 'PRIMARY');
  await runQuery(BACKUP_REF, 'BACKUP');
  console.log(DRY ? '\n(Dry-run — chưa ghi DB)' : '\n✅ Đã khóa Huy/Toại chỉ ở Metalla + gỡ deal ngoài Metalla');
}

main().catch((e) => {
  console.error('❌', e.message || e);
  process.exit(1);
});
