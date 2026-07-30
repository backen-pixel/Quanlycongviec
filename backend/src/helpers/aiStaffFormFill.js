/**
 * Parse câu lệnh tiếng Việt → gợi ý điền form tạo/sửa nhân viên.
 * Có OpenAI thì dùng JSON schema; không có thì fallback regex/heuristic.
 */

const ROLE_ALIASES = [
  { role: 'region_admin', patterns: [/admin\s*khu\s*vực/, /region[_\s-]?admin/, /admin\s*vùng/] },
  { role: 'sales_admin', patterns: [/sales[_\s-]*admin/, /admin\s*kinh\s*doanh/, /admin\s*crm(?!\s*\+)/] },
  { role: 'crm_production_admin', patterns: [/admin\s*crm\s*\+?\s*sản\s*xuất/, /crm[_\s-]*production[_\s-]*admin/, /admin\s*crm\s*sx/] },
  { role: 'crm_production_staff', patterns: [/nv\s*crm\s*\+?\s*(admin\s*)?sx/, /crm[_\s-]*production[_\s-]*staff/, /nhân\s*viên\s*crm\s*\+?\s*sx/] },
  { role: 'production_admin', patterns: [/admin\s*sản\s*xuất/, /production[_\s-]*admin/, /admin\s*sx(?!\s*\+)/] },
  { role: 'production_staff', patterns: [/nv\s*sản\s*xuất/, /production[_\s-]*staff/, /admin\s*cv\s*\+?\s*sx/] },
  { role: 'logistics_admin', patterns: [/admin\s*vận\s*chuyển/, /logistics[_\s-]*admin/, /admin\s*vc/] },
  { role: 'customer_care', patterns: [/\bcskh\b/, /chăm\s*sóc\s*khách/, /customer[_\s-]*care/] },
  { role: 'manager', patterns: [/quản\s*lý/, /\bmanager\b/] },
  { role: 'sales', patterns: [/kinh\s*doanh(?:\s*\(sae\))?/, /\bsae\b/, /(?<![\w])sales(?![_\s-]*admin)\b/] },
  { role: 'designer', patterns: [/thiết\s*kế/, /\bdesigner\b/] },
  { role: 'production', patterns: [/sản\s*xuất/, /(?<![\w])production(?![_\s-]*(?:admin|staff))\b/] },
  { role: 'driver', patterns: [/tài\s*xế/, /\bdriver\b/] },
  { role: 'installer', patterns: [/lắp\s*đặt/, /\binstaller\b/] },
  { role: 'accounting', patterns: [/k[eế]\s*to[aá]n/, /\baccountant\b/, /\baccounting\b/, /\bketoan\b/] },
  { role: 'admin', patterns: [/(?<![\w])admin(?![_\s-]*(?:khu|vùng|crm|sx|sản|kinh|vận))(?!\s+(?:khu\s*vực|crm|sản\s*xuất|kinh\s*doanh|vận\s*chuyển))\b/, /quản\s*trị/, /admin\s*công\s*ty/] },
  { role: 'staff', patterns: [/nhân\s*viên(?!\s*crm)/, /\bstaff\b/] },
];

/**
 * Nghề / ngành → chức vụ + preset quyền mặc định.
 * Dùng khi prompt nói «kế toán», «quan sát»… để AI tự bật xem / tắt tương tác.
 */
const JOB_PROFILES = [
  {
    key: 'accounting',
    role: 'accounting',
    position: 'Kế toán',
    department_hint: 'kế toán',
    // Baseline role đã xem CRM/SX/VC + sửa Kế toán; preset bổ sung view-only toàn module nếu prompt nói không tương tác
    default_presets: ['all_modules_view_only', 'accounting_view_all'],
    patterns: [/k[eế]\s*to[aá]n/, /\baccountant\b/, /\baccounting\b/, /\bketoan\b/],
  },
  {
    key: 'observer',
    role: null,
    position: 'Quan sát / chỉ xem',
    department_hint: null,
    default_presets: ['all_modules_view_only'],
    patterns: [/quan\s*s[aá]t/, /\bobserver\b/, /viewer\b/, /ch[iỉ]\s*xem\s*(to[aà]n\s*b[oộ]|h[eệ]t|tat\s*ca)/],
  },
  {
    key: 'auditor',
    role: 'accounting',
    position: 'Kiểm soát / kiểm toán nội bộ',
    department_hint: null,
    default_presets: ['all_modules_view_only', 'accounting_view_all'],
    patterns: [/ki[eể]m\s*so[aá]t/, /ki[eể]m\s*to[aá]n/, /\bauditor\b/, /\baudit\b/],
  },
];

const ALLOWED_ROLES = new Set(ROLE_ALIASES.map((r) => r.role));

function stripDiacritics(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

function slugEmailLocal(fullName) {
  const base = stripDiacritics(fullName)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .join('');
  return base || `nv${Date.now().toString(36).slice(-6)}`;
}

function detectRole(text) {
  const m = String(text || '').toLowerCase();
  for (const item of ROLE_ALIASES) {
    if (item.patterns.some((re) => re.test(m))) return item.role;
  }
  // Mã role gõ đúng (sales_admin, …) — bỏ qua tên ngắn dễ nhầm (admin/staff/sales)
  const SKIP_EXACT = new Set(['admin', 'staff', 'sales', 'production', 'manager', 'driver', 'installer', 'designer']);
  for (const item of ROLE_ALIASES) {
    if (SKIP_EXACT.has(item.role)) continue;
    if (new RegExp(`(?:^|[^a-z0-9_])${item.role}(?:[^a-z0-9_]|$)`).test(m)) return item.role;
  }
  return null;
}

function detectCrmScope(text, role) {
  const m = String(text || '').toLowerCase();
  if (/chỉ\s*khu\s*vực|khu\s*vực\s*chỉ\s*định|phạm\s*vi\s*khu\s*vực/.test(m)) return 'regions';
  if (/cả\s*công\s*ty|toàn\s*công\s*ty|phạm\s*vi\s*công\s*ty/.test(m)) return 'company';
  if (role === 'region_admin') return 'regions';
  return 'company';
}

function extractPhone(text) {
  const m = String(text || '').match(/(?:\+?84|0)\d{8,10}\b/);
  return m ? m[0] : null;
}

function extractEmail(text) {
  const m = String(text || '').match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
  return m ? m[0].toLowerCase() : null;
}

function extractPassword(text) {
  const m = String(text || '').match(/(?:mật\s*khẩu|password|pass)\s*[:=]?\s*([^\s,;]+)/i);
  return m ? m[1] : null;
}

function extractFullName(text) {
  const raw = String(text || '');
  const patterns = [
    /(?:họ\s*tên|tên(?:\s*nv)?|full[_\s-]?name)\s*[:=]?\s*([A-Za-zÀ-ỹĐđ][A-Za-zÀ-ỹĐđ\s.'-]{1,60})/i,
  ];
  for (const re of patterns) {
    const m = raw.match(re);
    if (!m?.[1]) continue;
    let name = m[1].trim().replace(/\s+/g, ' ');
    if (/^(tùy\s*chọn|tuy\s*chon|optional|any|bất\s*kỳ)$/i.test(name)) return null;
    name = name.replace(/\s+(công\s*ty|vai\s*trò|role|email|sđt|phone|mật\s*khẩu|khu\s*vực).*$/i, '').trim();
    if (name.length >= 2) return name;
  }

  // "Tạo NV Nguyễn Văn A công ty Metalla..." — tên ngay sau NV, không phải brand/role
  const afterNv = raw.match(/(?:tạo|thêm)\s*(?:nhân\s*viên|nv)\s+([A-Za-zÀ-ỹĐđ][A-Za-zÀ-ỹĐđ\s.'-]{1,40}?)(?:\s+(?:công\s*ty|cty|vai\s*trò|role|email|sđt|phone|mật\s*khẩu|khu\s*vực)|$)/i);
  if (afterNv?.[1]) {
    let name = afterNv[1].trim().replace(/\s+/g, ' ');
    const lower = name.toLowerCase();
    if (/^(tùy\s*chọn|tuy\s*chon|optional)$/i.test(name)) return null;
    if (/\b(metalla|vpt|tubep|admin|manager|sales|staff|cskh|k[eế]\s*to[aá]n|quan\s*s[aá]t)\b/i.test(lower)) return null;
    if (detectRole(name)) return null;
    if (name.split(/\s+/).length >= 2 && name.length >= 5) return name;
  }
  return null;
}

function extractCompanyHint(text) {
  const raw = String(text || '');
  const m = raw.match(/(?:công\s*ty|cty|company)\s*[:=]?\s*([A-Za-zÀ-ỹĐđ0-9][A-Za-zÀ-ỹĐđ0-9\s.&-]{1,60}?)(?:\s*,|\s+vai\s*trò|\s+role|\s+tên|\s+email|\s+sđt|\s+phòng|\s+khu\s*vực|$)/i);
  if (m?.[1]) return m[1].trim().replace(/\s+/g, ' ');
  // "metalla admin" style — từ khóa thương hiệu phổ biến
  const brand = raw.match(/\b(metalla|vpt|tủ\s*bếp|tubep)\b/i);
  return brand ? brand[1].trim() : null;
}

function extractPosition(text) {
  const m = String(text || '').match(/(?:chức\s*vụ|position)\s*[:=]?\s*([A-Za-zÀ-ỹĐđ][A-Za-zÀ-ỹĐđ\s]{1,40})/i);
  return m?.[1]?.trim() || null;
}

function detectJobProfile(text) {
  const raw = String(text || '');
  const folded = stripDiacritics(raw).toLowerCase();
  for (const job of JOB_PROFILES) {
    if (job.patterns.some((re) => re.test(raw) || re.test(folded))) return job;
  }
  return null;
}

/** «Chỉ xem / không tương tác / không tham gia» — áp dụng mọi module. */
function detectViewOnlyNoInteract(text) {
  const m = stripDiacritics(String(text || '')).toLowerCase();
  if (/khong\s*(duoc\s*)?(tuong\s*tac|tham\s*gia|chinh\s*sua|sua|tao|xoa)/.test(m)) return true;
  if (/quyen\s*xem(\s|$)|chi\s*(duoc\s*)?xem|view\s*only|read\s*only|observer/.test(m)) return true;
  if (/xem\s*(het|tat\s*ca|toan\s*bo).*(khong|cam)/.test(m)) return true;
  if (/(khong|cam).*(tuong\s*tac|tham\s*gia)/.test(m)) return true;
  return false;
}

function extractRegionHints(text) {
  const raw = String(text || '');
  // Tránh bắt cụm «chỉ khu vực» (phạm vi), chỉ lấy tên sau «khu vực:» / «region»
  const m = raw.match(/(?:khu\s*vực|region)\s*[:=]\s*([A-Za-zÀ-ỹĐđ0-9][A-Za-zÀ-ỹĐđ0-9,\s/-]{1,80})/i);
  if (!m?.[1]) return [];
  return m[1]
    .split(/[,/;]+/)
    .map((s) => s.trim())
    .filter((s) => s && !/^chỉ$/i.test(s));
}

function heuristicParse(prompt) {
  const job = detectJobProfile(prompt);
  // Nghề kế toán ưu tiên role accounting (tránh «nhân viên kế toán» → staff)
  let role = detectRole(prompt) || 'staff';
  if (job?.role && ALLOWED_ROLES.has(job.role)) role = job.role;
  const presets = detectPermissionPresets(prompt, job);
  return {
    full_name: extractFullName(prompt),
    email: extractEmail(prompt),
    phone: extractPhone(prompt),
    password: extractPassword(prompt),
    role,
    company_hint: extractCompanyHint(prompt),
    position: extractPosition(prompt) || job?.position || null,
    crm_scope_mode: detectCrmScope(prompt, role),
    region_hints: extractRegionHints(prompt),
    department_hint: job?.department_hint || null,
    job_profile: job?.key || null,
    permission_presets: presets,
    permission_tweaks: [],
  };
}

/** Parse yêu cầu bật/tắt quyền từ câu tiếng Việt (+ mặc định theo nghề). */
function detectPermissionPresets(text, jobProfile = null) {
  const m = stripDiacritics(String(text || '')).toLowerCase();
  const presets = [];
  const job = jobProfile || detectJobProfile(text);
  const globalViewOnly = detectViewOnlyNoInteract(text);

  const mentionsDrive = /\b(drive|file|tep|thu muc|tai lieu)\b/.test(m)
    || /file|tệp|thư mục|tài liệu|drive/.test(String(text || '').toLowerCase());
  const mentionsSx = /\b(sx|san xuat|xuong|production)\b/.test(m)
    || /sản xuất|xưởng/.test(String(text || '').toLowerCase());
  const mentionsCrm = /\b(crm|lead|deal)\b/.test(m);
  const mentionsVc = /\b(vc|van chuyen|logistics|lap dat)\b/.test(m)
    || /vận chuyển|lắp đặt/.test(String(text || '').toLowerCase());
  const mentionsKetoan = /\b(ketoan|ke toan|accounting)\b/.test(m)
    || /kế toán/.test(String(text || '').toLowerCase());

  const viewOnly = /chi\s*(duoc\s*)?xem|chi\s*xem|khong\s*(duoc\s*)?(xoa|sua|upload|chinh\s*sua|tao|tuong\s*tac|tham\s*gia)|view\s*only|read\s*only/.test(m);
  const noDelete = /khong\s*(duoc\s*)?xoa|cam\s*xoa|khong\s*xoa/.test(m);
  const noEdit = /khong\s*(duoc\s*)?(sua|chinh\s*sua|upload|tao)|cam\s*sua/.test(m);
  const viewAll = /xem\s*(duoc\s*)?(tat\s*ca|het|toan\s*bo)|tat\s*ca.*(xem|view)|view\s*all|quyen\s*xem/.test(m);
  const fullAdmin = /full\s*quyen|toan\s*quyen|admin\s*(module|day\s*du)/.test(m);

  // Nghề kế toán / quan sát / kiểm soát → mặc định xem hết, không tương tác
  if (job?.default_presets?.length) {
    presets.push(...job.default_presets);
  }

  // Câu «quyền xem / không tương tác» (không chỉ một module) → mọi module chỉ xem
  if (globalViewOnly && !fullAdmin) {
    const moduleScoped = (mentionsDrive || mentionsSx || mentionsCrm || mentionsVc)
      && !mentionsKetoan
      && !job;
    if (!moduleScoped) {
      presets.push('all_modules_view_only');
    }
  }

  // Drive: chỉ xem / không sửa xóa file
  if (mentionsDrive && (viewOnly || (noDelete && noEdit) || (noDelete || noEdit))) {
    presets.push('drive_view_only');
  } else if (mentionsDrive && viewAll) {
    presets.push('drive_view_all');
  }

  // Không nói "drive/file" nhưng nói rõ không xóa/sửa file
  if (!presets.includes('drive_view_only')
    && /(file|tep|drive)/.test(m)
    && (viewOnly || noDelete || noEdit)) {
    presets.push('drive_view_only');
  }

  // Sản xuất: xem tất cả
  if (mentionsSx && (viewAll || viewOnly || /xem\s*(duoc\s*)?san\s*xuat|san\s*xuat.*xem/.test(m))) {
    if (fullAdmin && mentionsSx) presets.push('production_admin_all');
    else presets.push('production_view_all');
  }

  // CRM xem tất cả
  if (mentionsCrm && (viewAll || viewOnly)) {
    presets.push(fullAdmin ? 'crm_admin_all' : 'crm_view_all');
  }

  // VC xem tất cả
  if (mentionsVc && (viewAll || viewOnly || fullAdmin)) {
    presets.push(fullAdmin ? 'vc_admin_all' : 'vc_view_all');
  }

  // Kế toán module
  if (mentionsKetoan && (viewAll || viewOnly || fullAdmin || job?.key === 'accounting')) {
    presets.push(fullAdmin ? 'accounting_admin_all' : 'accounting_view_all');
  }

  return [...new Set(presets)];
}

async function openaiParse(prompt, roleKeys) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  const system = `Bạn trích xuất thông tin tạo nhân viên ERP từ câu tiếng Việt.
Trả về ĐÚNG 1 JSON object (không markdown) với các key:
full_name, email, phone, password, role, company_hint, position, crm_scope_mode, region_hints, department_hint,
permission_presets, permission_tweaks.
- role phải là một trong: ${roleKeys.join(', ')}
- crm_scope_mode: "company" hoặc "regions"
- region_hints: mảng tên khu vực (có thể [])
- Nếu tên là "tùy chọn"/không rõ → full_name = null
- company_hint: tên công ty người dùng nói (vd Metalla)
- position: chức vụ nếu nêu (vd "Kế toán")
- department_hint: gợi ý phòng ban (vd "kế toán") nếu có
QUY ĐỊNH NGHỀ / QUYỀN (bắt buộc áp dụng khi khớp):
- «Kế toán» / accountant → role "accounting", position "Kế toán", permission_presets gồm all_modules_view_only + accounting_view_all (xem CRM/SX/VC/Drive; module Kế toán xem; không sửa pipeline CRM)
- «Quan sát / chỉ xem / không tương tác / không tham gia / quyền xem» (toàn hệ thống) → all_modules_view_only
- «Kiểm soát / kiểm toán» → role "accounting", all_modules_view_only + accounting_view_all
permission_presets hợp lệ:
  all_modules_view_only (xem mọi module, tắt tương tác),
  drive_view_only, drive_view_all,
  production_view_all, production_admin_all,
  crm_view_all, crm_admin_all,
  vc_view_all, vc_admin_all,
  accounting_view_all, accounting_admin_all
Ví dụ:
  "tạo NV kế toán Metalla quyền xem không được tương tác" → role accounting, position Kế toán, company_hint Metalla, presets ["all_modules_view_only","accounting_view_all"]
  "chỉ xem không sửa xóa file, xem tất cả sản xuất" → ["drive_view_only","production_view_all"]
- permission_tweaks: mảng {resource, action, granted} nếu cần chi tiết thêm (có thể [])
- Chỉ điền field chắc chắn; field không có thì null hoặc [].`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_STAFF_FILL_MODEL || 'gpt-4o-mini',
      temperature: 0,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: String(prompt || '').slice(0, 2000) },
      ],
      response_format: { type: 'json_object' },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`OpenAI ${res.status}: ${t.slice(0, 180)}`);
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content || '{}';
  try {
    return JSON.parse(content);
  } catch {
    return null;
  }
}

const ALLOWED_PRESETS = new Set([
  'all_modules_view_only',
  'drive_view_only',
  'drive_view_all',
  'production_view_all',
  'production_admin_all',
  'crm_view_all',
  'crm_admin_all',
  'vc_view_all',
  'vc_admin_all',
  'accounting_view_all',
  'accounting_admin_all',
]);

function normalizePresets(list) {
  if (!Array.isArray(list)) return [];
  return [...new Set(list.map((x) => String(x || '').trim()).filter((x) => ALLOWED_PRESETS.has(x)))];
}

function normalizeTweaks(list) {
  if (!Array.isArray(list)) return [];
  return list
    .map((t) => ({
      resource: String(t?.resource || '').trim(),
      action: String(t?.action || '').trim(),
      granted: t?.granted === true,
    }))
    .filter((t) => t.resource && t.action);
}

function mergeParsed(ai, fallback) {
  const pick = (a, b) => (a != null && String(a).trim() !== '' ? a : b);
  const roleRaw = String(pick(ai?.role, fallback.role) || 'staff').trim().toLowerCase();
  const role = ALLOWED_ROLES.has(roleRaw) ? roleRaw : (fallback.role || 'staff');
  let crm = pick(ai?.crm_scope_mode, fallback.crm_scope_mode) || 'company';
  if (crm !== 'regions' && crm !== 'company') crm = detectCrmScope('', role);
  if (role === 'region_admin') crm = 'regions';

  const regionHints = Array.isArray(ai?.region_hints) && ai.region_hints.length
    ? ai.region_hints.map((x) => String(x).trim()).filter(Boolean)
    : (fallback.region_hints || []);

  const presets = [
    ...normalizePresets(fallback.permission_presets),
    ...normalizePresets(ai?.permission_presets),
  ];
  const tweaks = [
    ...normalizeTweaks(fallback.permission_tweaks),
    ...normalizeTweaks(ai?.permission_tweaks),
  ];

  return {
    full_name: pick(ai?.full_name, fallback.full_name),
    email: pick(ai?.email, fallback.email),
    phone: pick(ai?.phone, fallback.phone),
    password: pick(ai?.password, fallback.password),
    role,
    company_hint: pick(ai?.company_hint, fallback.company_hint),
    position: pick(ai?.position, fallback.position),
    crm_scope_mode: crm,
    region_hints: regionHints,
    department_hint: pick(ai?.department_hint, fallback.department_hint),
    permission_presets: [...new Set(presets)],
    permission_tweaks: tweaks,
  };
}

function scoreCompanyMatch(company, hint) {
  const h = stripDiacritics(hint).toLowerCase().trim();
  if (!h) return 0;
  const name = stripDiacritics(company.name || '').toLowerCase();
  const short = stripDiacritics(company.short_name || '').toLowerCase();
  if (short && short === h) return 100;
  if (name === h) return 95;
  if (short && short.includes(h)) return 85;
  if (name.includes(h)) return 80;
  if (h.includes(name) && name.length >= 3) return 70;
  return 0;
}

async function resolveCompany(supabase, hint, { lockedCompanyId, tenantId } = {}) {
  if (lockedCompanyId) {
    const { data } = await supabase.from('companies').select('id, name, short_name').eq('id', lockedCompanyId).maybeSingle();
    return data || null;
  }
  if (!hint) return null;
  let q = supabase.from('companies').select('id, name, short_name').limit(200);
  if (tenantId) q = q.eq('tenant_id', tenantId);
  const { data: companies, error } = await q;
  if (error) throw error;
  let best = null;
  let bestScore = 0;
  for (const c of companies || []) {
    const sc = scoreCompanyMatch(c, hint);
    if (sc > bestScore) {
      bestScore = sc;
      best = c;
    }
  }
  return bestScore >= 70 ? best : null;
}

async function resolveDepartment(supabase, companyId, departmentHint) {
  if (!companyId) return null;
  const { data: depts, error } = await supabase
    .from('departments')
    .select('id, name, company_id')
    .eq('company_id', companyId)
    .order('name')
    .limit(50);
  if (error) throw error;
  if (!depts?.length) return null;
  if (departmentHint) {
    const h = stripDiacritics(departmentHint).toLowerCase();
    const hit = depts.find((d) => stripDiacritics(d.name).toLowerCase().includes(h));
    if (hit) return hit;
  }
  return depts[0];
}

async function resolveRegions(supabase, companyId, regionHints) {
  if (!companyId || !regionHints?.length) return [];
  const { data: regions, error } = await supabase
    .from('company_regions')
    .select('id, name, code, is_active')
    .eq('company_id', companyId)
    .limit(100);
  if (error) throw error;
  const active = (regions || []).filter((r) => r.is_active !== false);
  const ids = [];
  for (const hint of regionHints) {
    const h = stripDiacritics(hint).toLowerCase();
    const hit = active.find(
      (r) => stripDiacritics(r.name).toLowerCase().includes(h)
        || stripDiacritics(r.code || '').toLowerCase() === h,
    );
    if (hit && !ids.includes(hit.id)) ids.push(hit.id);
  }
  return ids;
}

function buildDefaultEmail(fullName, company) {
  const local = slugEmailLocal(fullName || 'nhanvien');
  const domainBase = stripDiacritics(company?.short_name || company?.name || 'company')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 24) || 'company';
  return `${local}@${domainBase}.local`;
}

/**
 * @returns {Promise<{ fields: object, summary: string[], source: string, warnings: string[] }>}
 */
async function fillStaffFormFromPrompt(supabase, prompt, options = {}) {
  const text = String(prompt || '').trim();
  if (!text) {
    const err = new Error('Nhập mô tả nhân viên cần tạo');
    err.status = 400;
    throw err;
  }

  const fallback = heuristicParse(text);
  let source = 'heuristic';
  let ai = null;
  try {
    ai = await openaiParse(text, [...ALLOWED_ROLES]);
    if (ai) source = 'openai';
  } catch (e) {
    // giữ heuristic
    source = 'heuristic';
  }

  const parsed = mergeParsed(ai || {}, fallback);
  const warnings = [];
  const summary = [];

  const company = await resolveCompany(supabase, parsed.company_hint, {
    lockedCompanyId: options.lockedCompanyId || null,
    tenantId: options.tenantId || null,
  });
  if (parsed.company_hint && !company) {
    warnings.push(`Không tìm thấy công ty khớp «${parsed.company_hint}»`);
  }

  const department = await resolveDepartment(supabase, company?.id, parsed.department_hint);
  const crm_region_ids = await resolveRegions(supabase, company?.id, parsed.region_hints);

  let full_name = parsed.full_name;
  if (!full_name) {
    full_name = company?.short_name || company?.name
      ? `NV ${String(company.short_name || company.name).trim()}`
      : 'Nhân viên mới';
    summary.push('Chưa có tên rõ — tạm điền tên mặc định (bạn sửa lại)');
  }

  let email = parsed.email;
  if (!email) {
    email = buildDefaultEmail(full_name, company);
    summary.push(`Email gợi ý: ${email}`);
  }

  const password = parsed.password || options.defaultPassword || '123456';
  const role = parsed.role || 'staff';
  let crm_scope_mode = parsed.crm_scope_mode || 'company';
  if (role === 'region_admin') crm_scope_mode = 'regions';
  if (crm_scope_mode === 'regions' && !crm_region_ids.length) {
    warnings.push('Phạm vi khu vực nhưng chưa khớp tên khu vực — hãy tick khu vực thủ công');
  }

  if (company) summary.push(`Công ty: ${company.name}`);
  summary.push(`Vai trò: ${role}`);
  summary.push(`Phạm vi CRM: ${crm_scope_mode === 'regions' ? 'chỉ khu vực' : 'cả công ty'}`);
  if (department) summary.push(`Phòng ban: ${department.name}`);

  const permission_presets = parsed.permission_presets || [];
  const permission_tweaks = parsed.permission_tweaks || [];
  if (permission_presets.length) {
    const labels = {
      all_modules_view_only: 'Mọi module: chỉ xem (không tương tác)',
      drive_view_only: 'Drive chỉ xem (không sửa/xóa)',
      drive_view_all: 'Drive: bật xem',
      production_view_all: 'SX: xem tất cả',
      production_admin_all: 'SX: full quyền',
      crm_view_all: 'CRM: xem tất cả',
      crm_admin_all: 'CRM: full quyền',
      vc_view_all: 'VC: xem tất cả',
      vc_admin_all: 'VC: full quyền',
      accounting_view_all: 'Kế toán: xem',
      accounting_admin_all: 'Kế toán: full quyền',
    };
    summary.push(`Phân quyền: ${permission_presets.map((p) => labels[p] || p).join('; ')}`);
  }

  return {
    source,
    warnings,
    summary,
    fields: {
      full_name,
      email,
      phone: parsed.phone || '',
      password,
      role,
      position: parsed.position || '',
      company_id: company?.id || null,
      company_name: company?.name || null,
      department_id: department?.id || null,
      department_name: department?.name || null,
      team_id: null,
      crm_scope_mode,
      crm_region_ids,
      company_hint: parsed.company_hint || null,
      permission_presets,
      permission_tweaks,
    },
  };
}

module.exports = {
  fillStaffFormFromPrompt,
  heuristicParse,
  detectPermissionPresets,
  detectJobProfile,
  JOB_PROFILES,
  ALLOWED_ROLES,
  ALLOWED_PRESETS,
};
