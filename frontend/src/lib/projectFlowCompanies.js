/**
 * Công ty theo module — nguồn chuẩn (SoR):
 *   CRM → deal.company_id · SX → projects.company_id · VC → projects.logistics_company_id
 *
 * `project_company_assignments.company_unit_id` chỉ là công ty mặc định trên mẫu luồng,
 * giống nhau ở mọi dự án nên không được dùng làm nguồn.
 */

const DIVISION_TO_MODULE = [
  { re: /kinh\s*doanh|crm|\bkd\b/i, key: 'crm' },
  { re: /s[aả]n\s*xu[aấ]t|\bsx\b/i, key: 'production' },
  { re: /l[aắ]p\s*[đd][aặ]t|v[aậ]n\s*chuy[eể]n|\bvc\b|\bld\b/i, key: 'logistics' },
  { re: /d[uự]\s*[aá]n|\bprojects?\b/i, key: 'projects' },
];

export function inferModuleKeyFromDivisionName(name) {
  const s = String(name || '').trim();
  if (!s) return null;
  for (const { re, key } of DIVISION_TO_MODULE) {
    if (re.test(s)) return key;
  }
  return null;
}

function moduleFromOrderIndex(orderIndex) {
  const oi = Number(orderIndex);
  if (oi === 0) return 'crm';
  if (oi === 1) return 'production';
  if (oi === 2) return 'logistics';
  return 'production';
}

function fromModuleCompanies(project) {
  const mc = project?.module_companies || null;
  if (!mc) return null;
  return {
    crm: mc.crm || null,
    production: mc.production || null,
    logistics: mc.logistics || null,
  };
}

/**
 * @param {'flow'|'sor'} mode
 *  - flow: CT khối trên Bộ Quy Trình (assignment)
 *  - sor: CT module SoR cho Không gian chung
 */
export function resolveCompaniesFromFlowAssignments(flowAssignments, project = null, mode = 'flow') {
  const moduleCos = fromModuleCompanies(project);
  const sorted = [...(flowAssignments || [])].sort(
    (a, b) => (a.order_index ?? 0) - (b.order_index ?? 0),
  );

  const byKey = { crm: null, production: null, logistics: null, projects: null };
  const modules = [];

  for (const a of sorted) {
    const divName = a.division?.name || a.division?.short_name || '';
    const key = a.module_key
      || inferModuleKeyFromDivisionName(divName)
      || moduleFromOrderIndex(a.order_index);

    let companyId = null;
    let companyName = null;
    let companySource = null;

    if (mode === 'sor') {
      const sor = key === 'crm' ? moduleCos?.crm
        : key === 'production' ? moduleCos?.production
          : key === 'logistics' ? moduleCos?.logistics
            : null;
      companyId = sor?.id || null;
      companyName = sor?.name || null;
      companySource = sor?.source || null;
      if (!companyId && key === 'production' && project?.company_id) {
        companyId = String(project.company_id);
        companyName = project.company?.name || null;
        companySource = 'project.company_id';
      }
      if (!companyId && key === 'logistics' && project?.logistics_company_id) {
        companyId = String(project.logistics_company_id);
        companyName = project.logistics_company?.name || null;
        companySource = 'project.logistics_company_id';
      }
    } else {
      // flow: dùng display_company backend đã giải theo SoR module
      const display = a.display_company;
      if (display?.id) {
        companyId = String(display.id);
        companyName = display.name;
        companySource = display.source || 'module_sor';
      } else if (display) {
        companyName = display.name || null;
        companySource = 'unset';
      }
    }

    const row = {
      key,
      label: divName || (key === 'crm' ? 'Kinh doanh' : key === 'logistics' ? 'Vận chuyển / Lắp đặt' : 'Sản xuất'),
      companyId,
      companyUnitId: a.company_unit_id || a.company?.id || null,
      companyName: companyName || '—',
      divisionName: divName,
      assignment: a,
      companySource,
    };
    modules.push(row);
    if (!byKey[key]?.companyId && companyId) byKey[key] = row;
    else if (!byKey[key]) byKey[key] = row;
  }

  return {
    modules,
    crmCompanyId: (mode === 'sor' ? moduleCos?.crm?.id : null)
      || byKey.crm?.companyId
      || moduleCos?.crm?.id
      || null,
    sxCompanyId: (mode === 'sor' ? moduleCos?.production?.id : null)
      || byKey.production?.companyId
      || moduleCos?.production?.id
      || (project?.company_id ? String(project.company_id) : null),
    vcCompanyId: (mode === 'sor' ? moduleCos?.logistics?.id : null)
      || byKey.logistics?.companyId
      || moduleCos?.logistics?.id
      || (project?.logistics_company_id ? String(project.logistics_company_id) : null),
  };
}
