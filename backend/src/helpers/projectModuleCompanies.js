/**
 * System of Record — công ty theo từng module trên dự án.
 *
 * CRM  → crm_leads.company_id (deal gắn dự án)
 * SX   → projects.company_id (ưu tiên) / deal.sx_template_company_id
 * VC   → projects.logistics_company_id
 *
 * Không lấy company_unit mặc định trên mẫu luồng làm nguồn chính.
 */

const { supabase } = require('../config/supabase');

async function hydrateCompany(id) {
  if (!id) return null;
  const { data } = await supabase
    .from('companies')
    .select('id, name, short_name')
    .eq('id', id)
    .maybeSingle();
  return data || null;
}

async function resolveLinkedDeal(projectId) {
  const { data: byProject } = await supabase
    .from('crm_leads')
    .select('id, company_id, sx_template_company_id, type, updated_at')
    .eq('project_id', projectId)
    .order('updated_at', { ascending: false });

  let deal = (byProject || []).find((d) => d.type === 'deal') || (byProject || [])[0] || null;

  if (!deal) {
    const { data: links } = await supabase
      .from('crm_deal_projects')
      .select('deal_id')
      .eq('project_id', projectId)
      .limit(5);
    const dealIds = [...new Set((links || []).map((r) => r.deal_id).filter(Boolean))];
    if (dealIds.length) {
      const { data: deals } = await supabase
        .from('crm_leads')
        .select('id, company_id, sx_template_company_id, type, updated_at')
        .in('id', dealIds)
        .order('updated_at', { ascending: false });
      deal = (deals || []).find((d) => d.type === 'deal') || (deals || [])[0] || null;
    }
  }

  return deal;
}

function pack(row, source) {
  if (!row?.id) return null;
  return {
    id: String(row.id),
    name: row.name || null,
    short_name: row.short_name || null,
    source,
  };
}

/**
 * @param {string} projectId
 * @param {{ project?: object }} [opts]
 */
async function resolveProjectModuleCompanies(projectId, opts = {}) {
  if (!projectId) {
    return { crm: null, production: null, logistics: null, deal_id: null };
  }

  let project = opts.project || null;
  if (!project?.company_id && !project?.logistics_company_id && !project?.id) {
    const { data } = await supabase
      .from('projects')
      .select(`
        id, company_id, logistics_company_id,
        company:companies!projects_company_id_fkey(id, name, short_name),
        logistics_company:companies!projects_logistics_company_id_fkey(id, name, short_name)
      `)
      .eq('id', projectId)
      .maybeSingle();
    project = data;
  } else if (project && (!project.company || (project.logistics_company_id && !project.logistics_company))) {
    // Bổ sung embed nếu thiếu
    const { data } = await supabase
      .from('projects')
      .select(`
        id, company_id, logistics_company_id,
        company:companies!projects_company_id_fkey(id, name, short_name),
        logistics_company:companies!projects_logistics_company_id_fkey(id, name, short_name)
      `)
      .eq('id', projectId)
      .maybeSingle();
    if (data) project = { ...project, ...data };
  }

  if (!project) {
    return { crm: null, production: null, logistics: null, deal_id: null };
  }

  const deal = await resolveLinkedDeal(projectId);

  const crmId = deal?.company_id || null;
  const sxId = project.company_id || deal?.sx_template_company_id || null;
  const vcId = project.logistics_company_id || null;

  const need = [];
  if (crmId) need.push(crmId);
  if (sxId && !(project.company && String(project.company_id) === String(sxId))) need.push(sxId);
  if (vcId && !(project.logistics_company && String(project.logistics_company_id) === String(vcId))) {
    need.push(vcId);
  }

  const uniqueNeed = [...new Set(need.map(String))];
  const hydrated = {};
  if (uniqueNeed.length) {
    const { data: rows } = await supabase
      .from('companies')
      .select('id, name, short_name')
      .in('id', uniqueNeed);
    for (const r of rows || []) hydrated[String(r.id)] = r;
  }

  const crmCompany = crmId
    ? (hydrated[String(crmId)] || await hydrateCompany(crmId))
    : null;
  const sxCompany = sxId
    ? (
      (project.company && String(project.company_id) === String(sxId) ? project.company : null)
      || hydrated[String(sxId)]
      || await hydrateCompany(sxId)
    )
    : null;
  const vcCompany = vcId
    ? (
      (project.logistics_company && String(project.logistics_company_id) === String(vcId)
        ? project.logistics_company
        : null)
      || hydrated[String(vcId)]
      || await hydrateCompany(vcId)
    )
    : null;

  return {
    crm: pack(crmCompany, 'deal.company_id'),
    production: pack(sxCompany, project.company_id ? 'project.company_id' : 'deal.sx_template_company_id'),
    logistics: pack(vcCompany, 'project.logistics_company_id'),
    deal_id: deal?.id ? String(deal.id) : null,
  };
}

function displayCompanyForModule(moduleKey, moduleCompanies) {
  const key = moduleKey === 'sx' || moduleKey === 'production'
    ? 'production'
    : moduleKey === 'vc' || moduleKey === 'logistics'
      ? 'logistics'
      : moduleKey === 'crm'
        ? 'crm'
        : null;
  if (!key) return null;
  const row = moduleCompanies?.[key];
  if (row?.id) {
    return {
      id: row.id,
      name: row.name,
      short_name: row.short_name,
      source: row.source || `module.${key}`,
    };
  }
  const unsetLabel = key === 'crm'
    ? 'Chưa gán công ty CRM'
    : key === 'logistics'
      ? 'Chưa bàn giao VC/LĐ'
      : 'Chưa gán công ty SX';
  return {
    id: null,
    name: unsetLabel,
    short_name: null,
    source: 'unset',
  };
}

module.exports = {
  resolveProjectModuleCompanies,
  displayCompanyForModule,
  resolveLinkedDeal,
  enrichProjectsModulePresence,
};

/**
 * Gắn module CRM/SX/VC + nguồn tạo + người phụ trách + deadline (giống thẻ CRM).
 * @param {object[]} projects
 * @returns {Promise<object[]>}
 */
async function enrichProjectsModulePresence(projects) {
  const list = Array.isArray(projects) ? projects : [];
  if (!list.length) return list;

  const ids = list.map((p) => p.id).filter(Boolean);
  const crmByProject = new Map();

  const dealCols =
    'id, project_id, company_id, type, code, title, assigned_to, lead_owner_id, created_by, '
    + 'kanban_deadline_at, expected_close_date, updated_at';

  // ── Đường nhanh: RPC gộp 3 lượt REST thành 1 truy vấn (migration 569) ──
  // Đo thực tế: 3 lượt REST (crm_leads theo project_id 400ms → crm_deal_projects 143ms →
  // crm_tasks deadline 300ms) mất ~950ms; cùng logic bằng SQL chạy ~15ms.
  // Lỗi hoặc chưa chạy migration → rơi về đường REST cũ bên dưới.
  const nextTaskDeadlineByDeal = new Map();
  let usedRpc = false;
  try {
    const { data: rows, error } = await supabase.rpc('project_list_enrich', {
      p_project_ids: ids,
    });
    if (error) throw error;
    for (const r of rows || []) {
      if (r.next_task_deadline && r.deal_id) {
        nextTaskDeadlineByDeal.set(String(r.deal_id), r.next_task_deadline);
      }
      if (!r.deal_id) continue;
      crmByProject.set(String(r.project_id), {
        id: r.deal_id,
        project_id: r.project_id,
        company_id: r.deal_company_id,
        type: r.deal_type,
        code: r.deal_code,
        title: r.deal_title,
        assigned_to: r.assigned_to,
        lead_owner_id: r.lead_owner_id,
        created_by: r.deal_created_by,
        kanban_deadline_at: r.kanban_deadline_at,
        expected_close_date: r.expected_close_date,
      });
    }
    usedRpc = true;
  } catch (rpcErr) {
    console.warn('[enrichProjectsModulePresence] RPC project_list_enrich không dùng được'
      + `: ${rpcErr.message} — dùng đường REST cũ (chậm hơn ~60 lần).`);
  }

  if (!usedRpc) {
    // Không ORDER BY ở DB: sắp xếp 500 dòng bằng JS rẻ hơn ~100ms so với sort phía Postgres.
    const { data: byProject, error } = await supabase
      .from('crm_leads')
      .select(dealCols)
      .in('project_id', ids);
    if (error) {
      console.warn('[enrichProjectsModulePresence] deals by project:', error.message);
    }
    const sortedByProject = [...(byProject || [])].sort(
      (a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0),
    );
    for (const row of sortedByProject) {
      const pid = String(row.project_id);
      if (crmByProject.has(pid)) continue;
      crmByProject.set(pid, row);
    }

    const missing = ids.filter((id) => !crmByProject.has(String(id)));
    if (missing.length) {
      try {
        const { data: links } = await supabase
          .from('crm_deal_projects')
          .select('project_id, deal_id')
          .in('project_id', missing);
        const dealIds = [...new Set((links || []).map((r) => r.deal_id).filter(Boolean))];
        const dealMap = new Map();
        if (dealIds.length) {
          const { data: deals } = await supabase
            .from('crm_leads')
            .select(dealCols)
            .in('id', dealIds);
          for (const d of deals || []) dealMap.set(String(d.id), d);
        }
        for (const link of links || []) {
          const pid = String(link.project_id);
          if (crmByProject.has(pid)) continue;
          const deal = dealMap.get(String(link.deal_id));
          if (!deal) continue;
          crmByProject.set(pid, { ...deal, project_id: link.project_id });
        }
      } catch (_) { /* bảng có thể chưa có */ }
    }
  }

  // Deadline NV CRM mở gần nhất theo deal
  const allDealIds = [...new Set([...crmByProject.values()].map((d) => d.id).filter(Boolean))];

  const companyIds = new Set();
  const userIds = new Set();
  for (const p of list) {
    const crm = crmByProject.get(String(p.id));
    if (crm?.company_id) companyIds.add(String(crm.company_id));
    if (p.company_id) companyIds.add(String(p.company_id));
    if (p.logistics_company_id) companyIds.add(String(p.logistics_company_id));

    [
      p.created_by,
      p.sales_person_id,
      p.production_person_id,
      p.project_manager_id,
      p.logistics_person_id,
      p.shipping_person_id,
      p.installation_person_id,
      p.sales_person?.id,
      p.production_person?.id,
      p.project_manager?.id,
      p.logistics_person?.id,
      p.shipping_person?.id,
      p.installation_person?.id,
      p.created_by_user?.id,
      crm?.assigned_to,
      crm?.lead_owner_id,
      crm?.created_by,
    ].forEach((uid) => { if (uid) userIds.add(String(uid)); });
  }

  // Đường nhanh đã trả sẵn deadline nhiệm vụ trong cùng truy vấn → bỏ hẳn lượt crm_tasks.
  // (Lượt cũ còn có `.limit(dealIds*8, tối đa 2000)` nên với >250 deal là bị cắt âm thầm.)
  const [taskRows, companyRows, userRows] = await Promise.all([
    (!usedRpc && allDealIds.length)
      ? supabase
        .from('crm_tasks')
        .select('lead_id, deadline, status, updated_at')
        .in('lead_id', allDealIds)
        .not('deadline', 'is', null)
        .order('deadline', { ascending: true })
        .limit(Math.min(allDealIds.length * 8, 2000))
        .then((r) => r.data || [])
        .catch((e) => { console.warn('[enrichProjectsModulePresence] task deadlines:', e.message); return []; })
      : Promise.resolve([]),
    companyIds.size
      ? supabase.from('companies').select('id, name, short_name').in('id', [...companyIds])
        .then((r) => r.data || []).catch(() => [])
      : Promise.resolve([]),
    userIds.size
      ? supabase.from('users').select('id, full_name, avatar').in('id', [...userIds])
        .then((r) => r.data || []).catch(() => [])
      : Promise.resolve([]),
  ]);

  if (!usedRpc) {
    const done = new Set(['done', 'completed', 'cancelled', 'canceled']);
    for (const t of taskRows) {
      if (done.has(String(t.status || '').toLowerCase())) continue;
      const lid = String(t.lead_id);
      if (nextTaskDeadlineByDeal.has(lid)) continue;
      nextTaskDeadlineByDeal.set(lid, t.deadline);
    }
  }

  const companyMap = new Map();
  for (const c of companyRows) companyMap.set(String(c.id), c);

  const userMap = new Map();
  for (const u of userRows) userMap.set(String(u.id), u);

  const packCo = (id) => {
    if (!id) return null;
    const c = companyMap.get(String(id));
    if (!c) return { id: String(id), name: null, short_name: null };
    return { id: String(c.id), name: c.name || null, short_name: c.short_name || null };
  };

  const packPerson = (uOrId) => {
    if (!uOrId) return null;
    if (typeof uOrId === 'object') {
      const fromEmbed = uOrId.full_name || uOrId.id
        ? { id: uOrId.id ? String(uOrId.id) : null, full_name: uOrId.full_name || null, avatar: uOrId.avatar || null }
        : null;
      if (fromEmbed?.full_name) return fromEmbed;
      if (fromEmbed?.id && userMap.has(fromEmbed.id)) {
        const u = userMap.get(fromEmbed.id);
        return { id: String(u.id), full_name: u.full_name || null, avatar: u.avatar || null };
      }
      return fromEmbed?.id ? fromEmbed : null;
    }
    const u = userMap.get(String(uOrId));
    if (!u) return null;
    return { id: String(u.id), full_name: u.full_name || null, avatar: u.avatar || null };
  };

  const pickDeadline = (candidates) => {
    for (const c of candidates) {
      if (!c?.at) continue;
      const ts = new Date(c.at).getTime();
      if (!Number.isFinite(ts)) continue;
      return { at: c.at, source: c.source, label: c.label, ts };
    }
    return null;
  };

  return list.map((p) => {
    const crmLink = crmByProject.get(String(p.id)) || null;
    const hasCrm = !!crmLink?.id;
    const hasSx = !!(p.company_id || p.sx_kanban_column_id);
    const hasVc = !!(p.logistics_company_id || p.vc_kanban_column_id);

    const crmPerson = packPerson(crmLink?.assigned_to)
      || packPerson(crmLink?.lead_owner_id)
      || packPerson(p.sales_person)
      || packPerson(p.sales_person_id);
    const sxPerson = packPerson(p.production_person)
      || packPerson(p.production_person_id)
      || packPerson(p.project_manager)
      || packPerson(p.project_manager_id);
    const vcPerson = packPerson(p.logistics_person)
      || packPerson(p.logistics_person_id)
      || packPerson(p.shipping_person)
      || packPerson(p.shipping_person_id)
      || packPerson(p.installation_person)
      || packPerson(p.installation_person_id);

    const createdBy = packPerson(p.created_by_user)
      || packPerson(p.created_by)
      || packPerson(crmLink?.created_by);

    const dealTaskDeadline = crmLink?.id
      ? nextTaskDeadlineByDeal.get(String(crmLink.id))
      : null;

    const schedule = pickDeadline([
      { at: p.deadline, source: 'project', label: 'Hạn DA' },
      { at: p.sx_kanban_deadline_at, source: 'sx_kanban', label: 'Hạn SX' },
      { at: p.production_deadline, source: 'production', label: 'Hạn SX' },
      { at: p.design_deadline, source: 'design', label: 'Hạn TK' },
      { at: p.delivery_date, source: 'delivery', label: 'Giao' },
      { at: p.install_date, source: 'install', label: 'Lắp' },
      { at: crmLink?.kanban_deadline_at, source: 'kanban', label: 'Hạn CRM' },
      { at: dealTaskDeadline, source: 'task', label: 'Hạn NV' },
      { at: crmLink?.expected_close_date, source: 'expected_close', label: 'Dự kiến chốt' },
    ]);

    const origin = hasCrm
      ? {
        kind: 'crm_deal',
        label: 'Từ CRM',
        deal_id: String(crmLink.id),
        deal_code: crmLink.code || null,
        deal_title: crmLink.title || null,
        company: packCo(crmLink.company_id),
        created_by: createdBy,
      }
      : {
        kind: 'manual',
        label: 'Tạo thủ công',
        deal_id: null,
        deal_code: null,
        deal_title: null,
        company: packCo(p.company_id) || (p.company ? {
          id: String(p.company.id || p.company_id),
          name: p.company.name || null,
          short_name: p.company.short_name || null,
        } : null),
        created_by: createdBy,
      };

    return {
      ...p,
      origin,
      schedule,
      dates: {
        order_date: p.order_date || null,
        delivery_date: p.delivery_date || null,
        production_deadline: p.production_deadline || null,
        install_date: p.install_date || null,
        design_deadline: p.design_deadline || null,
        deadline: p.deadline || null,
        sx_kanban_deadline_at: p.sx_kanban_deadline_at || null,
        deal_kanban_deadline_at: crmLink?.kanban_deadline_at || null,
        deal_task_deadline: dealTaskDeadline || null,
        expected_close_date: crmLink?.expected_close_date || null,
      },
      modules: {
        crm: hasCrm
          ? {
            active: true,
            deal_id: String(crmLink.id),
            company: packCo(crmLink.company_id),
            person: crmPerson,
            person_role: crmLink?.assigned_to ? 'Phụ trách deal' : (crmLink?.lead_owner_id ? 'Chủ deal' : 'Kinh doanh'),
          }
          : { active: false, deal_id: null, company: null, person: null, person_role: null },
        production: hasSx
          ? {
            active: true,
            company: packCo(p.company_id) || (p.company ? {
              id: String(p.company.id || p.company_id),
              name: p.company.name || null,
              short_name: p.company.short_name || null,
            } : null),
            person: sxPerson,
            person_role: (p.production_person_id || p.production_person) ? 'Tiếp nhận SX' : (p.project_manager_id ? 'QLDA' : 'Tiếp nhận SX'),
          }
          : { active: false, company: null, person: null, person_role: null },
        logistics: hasVc
          ? {
            active: true,
            company: packCo(p.logistics_company_id),
            person: vcPerson,
            person_role: (p.logistics_person_id || p.logistics_person)
              ? 'VC'
              : ((p.shipping_person_id || p.shipping_person) ? 'Giao hàng' : ((p.installation_person_id || p.installation_person) ? 'Lắp đặt' : 'Phụ trách')),
          }
          : { active: false, company: null, person: null, person_role: null },
      },
    };
  });
}
