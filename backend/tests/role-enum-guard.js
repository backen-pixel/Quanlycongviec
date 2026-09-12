/**
 * ============================================================================
 * CHOT: moi gia tri role ghi trong code phai ton tai trong enum user_role
 * ============================================================================
 *
 * Vi sao can test nay?
 *   users.role la kieu enum user_role. PostgREST dich .in('role', [...]) thanh
 *       WHERE role = ANY ($1)
 *   Neu MOT phan tu trong mang khong co trong enum, Postgres bao 22P02
 *   "invalid input value for enum user_role" va HUY CA CAU QUERY.
 *   Code goi kieu `const { data } = await supabase...` se nhan data = undefined,
 *   tra ve [] va tinh nang chet IM LANG - khong ai biet.
 *
 *   Da xay ra that (08/09/2026): 'logistics' bi nham la role trong
 *     - routes/workshopTeams.js  -> GET /workshop-teams/users luon tra ve []
 *     - helpers/vcLogisticsNotify.js -> blast VC/LD mat het nguoi nhan theo role
 *   'logistics' la MODULE KEY (crm | production | logistics | projects...),
 *   khong phai role. Role tuong ung la 'logistics_admin'.
 *
 * Cap nhat danh sach enum khi them role moi:
 *   SELECT string_agg(quote_literal(v), ', ' ORDER BY v)
 *   FROM unnest(enum_range(NULL::user_role)::text[]) v;
 *
 * Chay:  npm run test:role-enum
 */

const fs = require('fs');
const path = require('path');

// Chup tu DB prod kdxypztstbeovyedmvem ngay 08/09/2026.
const USER_ROLE_ENUM = new Set([
  'accounting', 'admin', 'administrator',
  'crm_production_admin', 'crm_production_staff', 'customer_care',
  'designer', 'director', 'driver', 'installer', 'logistics_admin',
  'manager', 'platform_admin', 'production', 'production_admin',
  'production_staff', 'region_admin', 'sales', 'sales_admin',
  'staff', 'super_admin', 'superadmin', 'supervisor',
]);

const SRC = path.join(__dirname, '..', 'src');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && p.endsWith('.js')) out.push(p);
  }
  return out;
}

/** Tach cac chuoi 'abc' / "abc" trong mot doan text. */
function literals(chunk) {
  const out = [];
  const re = /['"]([^'"\n]*)['"]/g;
  let m;
  while ((m = re.exec(chunk))) out.push(m[1]);
  return out;
}

/** Tim `const TEN = [ ... ]` hoac `const TEN = new Set([ ... ])` trong 1 file. */
function resolveConst(src, name) {
  const re = new RegExp(
    'const\\s+' + name + '\\s*=\\s*(?:new\\s+Set\\s*\\()?\\[([^\\]]*)\\]',
    'm'
  );
  const m = src.match(re);
  return m ? literals(m[1]) : null;
}

const problems = [];
const checked = [];

for (const file of walk(SRC)) {
  const src = fs.readFileSync(file, 'utf8');
  const rel = path.relative(path.join(__dirname, '..'), file).replace(/\\/g, '/');

  // A) .in('role', [ ... ])  — mang viet thang
  for (const m of src.matchAll(/\.in\(\s*['"]role['"]\s*,\s*\[([^\]]*)\]/g)) {
    checked.push({ rel, nguon: "in('role', [...])", vals: literals(m[1]) });
  }

  // B) .in('role', TEN_HANG)  — hang so trong cung file
  for (const m of src.matchAll(/\.in\(\s*['"]role['"]\s*,\s*([A-Za-z_$][\w$]*)\s*\)/g)) {
    const vals = resolveConst(src, m[1]);
    if (vals) checked.push({ rel, nguon: `in('role', ${m[1]})`, vals });
  }

  // C) getCompanyScopedRoleUserIds(x, [ ... ])
  for (const m of src.matchAll(/getCompanyScopedRoleUserIds\s*\([^,]*,\s*\[([^\]]*)\]/g)) {
    checked.push({ rel, nguon: 'getCompanyScopedRoleUserIds([...])', vals: literals(m[1]) });
  }

  // D) getCompanyScopedRoleUserIds(x, TEN_HANG)
  for (const m of src.matchAll(/getCompanyScopedRoleUserIds\s*\([^,]*,\s*([A-Za-z_$][\w$]*)\s*[,)]/g)) {
    const vals = resolveConst(src, m[1]);
    if (vals) checked.push({ rel, nguon: `getCompanyScopedRoleUserIds(${m[1]})`, vals });
  }

  // E) .from('users') ... .eq('role', 'literal')  — chi xet khi cung 1 chuoi goi
  for (const m of src.matchAll(/from\(\s*['"]users['"]\s*\)[\s\S]{0,400}?\.eq\(\s*['"]role['"]\s*,\s*['"]([^'"]+)['"]\s*\)/g)) {
    checked.push({ rel, nguon: "from('users').eq('role', '...')", vals: [m[1]] });
  }
}

for (const c of checked) {
  const xau = c.vals.filter((v) => v && !USER_ROLE_ENUM.has(v));
  if (xau.length) problems.push({ ...c, xau });
}

console.log(`Da quet ${checked.length} cho loc theo users.role trong backend/src`);

if (problems.length) {
  console.error('\nTHAT BAI — co gia tri KHONG nam trong enum user_role:\n');
  for (const p of problems) {
    console.error(`  ${p.rel}`);
    console.error(`    ${p.nguon}`);
    console.error(`    gia tri sai: ${p.xau.map((v) => `'${v}'`).join(', ')}`);
    console.error('    -> Postgres tra 22P02 va HUY CA CAU QUERY, tinh nang chet im lang.\n');
  }
  process.exit(1);
}

if (!checked.length) {
  console.error('THAT BAI — khong quet duoc cho nao, regex co the da hong.');
  process.exit(1);
}

console.log('DAT — moi gia tri role trong code deu ton tai trong enum user_role.');
