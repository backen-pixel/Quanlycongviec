/**
 * Backup-only: crm_leads thiếu PK (duplicate ids) → tạo bảng không FK.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const REF = process.env.BACKUP_PROJECT_REF || 'atcfpgxkgbszglrelfgr';

async function q(query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${REF}/database/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${res.status}: ${text}`);
  return text;
}

const SQL = `
CREATE TABLE IF NOT EXISTS public.crm_deal_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id uuid NOT NULL,
  project_id uuid NOT NULL,
  is_primary boolean NOT NULL DEFAULT false,
  label text NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT crm_deal_projects_deal_project_unique UNIQUE (deal_id, project_id)
);
CREATE INDEX IF NOT EXISTS idx_crm_deal_projects_deal_id ON public.crm_deal_projects (deal_id);
CREATE INDEX IF NOT EXISTS idx_crm_deal_projects_project_id ON public.crm_deal_projects (project_id);
INSERT INTO public.crm_deal_projects (deal_id, project_id, is_primary, created_at)
SELECT DISTINCT ON (l.id) l.id, l.project_id, true, COALESCE(l.updated_at, l.created_at, now())
FROM public.crm_leads l
WHERE l.project_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.crm_deal_projects d
    WHERE d.deal_id = l.id AND d.project_id = l.project_id
  )
ON CONFLICT (deal_id, project_id) DO NOTHING;
SELECT COUNT(*)::int AS n FROM crm_deal_projects;
`;

q(SQL).then((t) => console.log(t)).catch((e) => { console.error(e.message); process.exit(1); });
