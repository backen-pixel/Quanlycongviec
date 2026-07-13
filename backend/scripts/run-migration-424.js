require('dotenv').config();
const fs = require('fs');
const path = require('path');

const token = process.env.SUPABASE_ACCESS_TOKEN;
const url = process.env.SUPABASE_URL || '';
const refMatch = url.match(/https:\/\/([^.]+)\.supabase/);
const ref = process.env.SUPABASE_PROJECT_REF || (refMatch && refMatch[1]);

if (!token || !ref) {
  console.error('Missing SUPABASE_ACCESS_TOKEN or project ref');
  process.exit(1);
}

const query = fs.readFileSync(
  path.join(__dirname, '../../database/424_crm_pipeline_stage_revert_to_lead_target.sql'),
  'utf8',
);

fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  },
  body: JSON.stringify({ query }),
})
  .then(async (r) => {
    const t = await r.text();
    console.log('status', r.status);
    console.log(t.slice(0, 800));
    if (!r.ok) process.exit(1);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
