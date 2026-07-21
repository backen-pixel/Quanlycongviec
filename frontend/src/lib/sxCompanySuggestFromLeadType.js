/**
 * Gợi ý / lọc công ty + phân loại SX theo phân loại CRM (lead_type).
 * Ví dụ: «Tủ bếp» → chỉ hiện xưởng có phân loại tủ; «Cửa» → xưởng có cửa.
 */

export function foldViSx(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .trim();
}

/**
 * @returns {'door'|'cabinet'|'cabinet_inox'|null}
 */
export function classifyCrmLeadTypeForSx(leadTypeName) {
  const n = foldViSx(leadTypeName);
  if (!n) return null;
  if (n.includes('inox') && (n.includes('tu') || n.includes('bep'))) return 'cabinet_inox';
  if (n.includes('tu bep') || n === 'tu' || (n.includes('tu') && !n.includes('cua'))) return 'cabinet';
  if (n.includes('cua')) return 'door';
  return null;
}

export function sxKindLabel(kind) {
  if (kind === 'door') return 'Cửa';
  if (kind === 'cabinet') return 'Tủ bếp';
  if (kind === 'cabinet_inox') return 'Tủ bếp inox';
  return '';
}

export function isPhucDatCompany(company) {
  const blob = foldViSx(`${company?.short_name || ''} ${company?.name || ''}`);
  return blob.includes('phuc dat') || foldViSx(company?.short_name || '') === 'pd';
}

export function isHcbCompany(company) {
  const sn = foldViSx(company?.short_name || '');
  const blob = foldViSx(`${company?.short_name || ''} ${company?.name || ''}`);
  return sn === 'hcb' || blob.includes('hucabi') || blob.includes('hcb');
}

export function isMetallaCompany(company) {
  return foldViSx(`${company?.short_name || ''} ${company?.name || ''}`).includes('metalla');
}

/** Phân loại xưởng có khớp loại CRM không? */
export function workshopTypeMatchesSxKind(workshopTypeName, kind) {
  if (!kind) return true;
  const n = foldViSx(workshopTypeName);
  if (!n) return false;
  if (kind === 'door') {
    return n.includes('cua');
  }
  if (kind === 'cabinet_inox') {
    if (n.includes('inox')) return true;
    return n.includes('tu') || n.includes('bep');
  }
  if (kind === 'cabinet') {
    return (n.includes('tu') || n.includes('bep')) && !n.includes('cua');
  }
  return true;
}

/** Công ty được ưu tiên theo quy ước vận hành. */
export function companyPreferredForSxKind(company, kind) {
  if (!kind || !company) return false;
  if (kind === 'door') return isPhucDatCompany(company);
  if (kind === 'cabinet') return isHcbCompany(company);
  if (kind === 'cabinet_inox') return isMetallaCompany(company);
  return false;
}

/**
 * Lọc danh sách công ty SX theo loại CRM + map types đã tải.
 * Luôn giữ currentCompanyId. Phúc Đạt bị ẩn khi loại = tủ.
 */
export function filterSxCompaniesByLeadType(companies, typesByCompanyId, kind, currentCompanyId = '') {
  const list = Array.isArray(companies) ? companies : [];
  if (!kind) return list;
  const cur = String(currentCompanyId || '');
  const map = typesByCompanyId || {};
  const matched = list.filter((c) => {
    const id = String(c.id);
    if (cur && id === cur) return true;
    if ((kind === 'cabinet' || kind === 'cabinet_inox') && isPhucDatCompany(c)) return false;
    if (companyPreferredForSxKind(c, kind)) return true;
    const types = map[id];
    if (!types) return false;
    return types.some((t) => workshopTypeMatchesSxKind(t.name, kind));
  });
  return matched.length ? matched : list;
}

/** Chỉ hiện phân loại khớp nếu có; không thì hiện tất cả. */
export function orderWorkshopTypesForSxKind(types, kind) {
  const rows = Array.isArray(types) ? [...types] : [];
  if (!kind) return rows;
  const matched = rows.filter((t) => workshopTypeMatchesSxKind(t.name, kind));
  return matched.length ? matched : rows;
}

export function pickSuggestedWorkshopTypeId(types, kind) {
  const ordered = orderWorkshopTypesForSxKind(types, kind);
  if (!ordered.length) return '';
  if (kind === 'cabinet_inox') {
    const inox = ordered.find((t) => foldViSx(t.name).includes('inox'));
    if (inox?.id) return String(inox.id);
  }
  return ordered[0]?.id ? String(ordered[0].id) : '';
}

/**
 * Gợi ý theo cấu hình DB (ưu tiên) hoặc heuristic tên.
 * @param {{ leadTypeName?: string, kind?: string|null, companyName?: string, workshopTypeName?: string }} opts
 */
export function sxLeadTypeHintText(leadTypeName, kind, opts = {}) {
  const label = String(leadTypeName || opts.leadTypeName || '').trim() || sxKindLabel(kind) || '—';
  const co = String(opts.companyName || '').trim();
  const wt = String(opts.workshopTypeName || '').trim();
  if (co || wt) {
    const dest = [co, wt].filter(Boolean).join(' · ');
    return `Loại CRM «${label}» → ★ ${dest}. Các xưởng khác vẫn chọn được.`;
  }
  if (kind === 'door') {
    return `Deal CRM «${label}» → gợi ý ★ Phúc Đạt (cửa). Các xưởng khác vẫn chọn được.`;
  }
  if (kind === 'cabinet') {
    return `Deal CRM «${label}» → gợi ý ★ HCB (tủ bếp / Sang thiết kế). Các xưởng khác vẫn chọn được.`;
  }
  if (kind === 'cabinet_inox') {
    return `Deal CRM «${label}» → gợi ý ★ Metalla · Tủ bếp (inox). Các xưởng khác vẫn chọn được.`;
  }
  return '';
}

/** Dòng tóm tắt mapping cho bảng cấu hình: Loại CRM → SX · phân loại */
export function formatCrmToSxMappingLine({ leadTypeName, companyName, workshopTypeName }) {
  const crm = String(leadTypeName || '').trim() || '—';
  const co = String(companyName || '').trim();
  const wt = String(workshopTypeName || '').trim();
  if (!co && !wt) return `${crm} → (chưa gắn SX)`;
  if (co && wt) return `${crm} → ${co} · ${wt}`;
  if (co) return `${crm} → ${co} · (chưa chọn phân loại)`;
  return `${crm} → (thiếu công ty SX) · ${wt}`;
}

/**
 * Ưu tiên cấu hình DB trên loại CRM — hỗ trợ nhiều links.
 * @returns {{ companyId: string, workshopTypeId: string, companyIds: string[], links: Array<{companyId, workshopTypeId, isPrimary}> }}
 */
export function preferredSxFromLeadTypeRow(leadTypeRow) {
  const linksRaw = Array.isArray(leadTypeRow?.production_links) ? leadTypeRow.production_links : [];
  const links = linksRaw
    .map((l) => ({
      companyId: l?.production_company_id ? String(l.production_company_id) : '',
      workshopTypeId: l?.workshop_type_id ? String(l.workshop_type_id) : '',
      isPrimary: !!l?.is_primary,
    }))
    .filter((l) => l.companyId && l.workshopTypeId);

  if (links.length) {
    const primary = links.find((l) => l.isPrimary) || links[0];
    return {
      companyId: primary.companyId,
      workshopTypeId: primary.workshopTypeId,
      companyIds: [...new Set(links.map((l) => l.companyId))],
      links,
    };
  }

  const companyId = leadTypeRow?.default_production_company_id
    ? String(leadTypeRow.default_production_company_id)
    : '';
  const workshopTypeId = leadTypeRow?.default_workshop_type_id
    ? String(leadTypeRow.default_workshop_type_id)
    : '';
  return {
    companyId,
    workshopTypeId,
    companyIds: companyId ? [companyId] : [],
    links: companyId && workshopTypeId
      ? [{ companyId, workshopTypeId, isPrimary: true }]
      : [],
  };
}

/** ★ ưu tiên: công ty nằm trong production_links (hoặc default), fallback heuristic kind. */
export function companyPreferredForLeadType(company, leadTypeRow, kind) {
  const { companyIds } = preferredSxFromLeadTypeRow(leadTypeRow);
  if (companyIds.length && company && companyIds.includes(String(company.id))) return true;
  return companyPreferredForSxKind(company, kind);
}

/** Phân loại có trong links của công ty đang chọn? */
export function workshopTypePreferredForLeadType(workshopTypeId, leadTypeRow, companyId) {
  const { links } = preferredSxFromLeadTypeRow(leadTypeRow);
  const cid = String(companyId || '');
  const tid = String(workshopTypeId || '');
  if (!links.length || !tid) return false;
  return links.some((l) => l.workshopTypeId === tid && (!cid || l.companyId === cid));
}

/**
 * Id phân loại ★ gắn với công ty đang chọn (trong production_links).
 * Ưu tiên link is_primary của công ty đó; không có thì link đầu; fallback heuristic tên.
 */
export function preferredWorkshopTypeIdForCompany(leadTypeRow, companyId) {
  const { links, workshopTypeId: globalType } = preferredSxFromLeadTypeRow(leadTypeRow);
  const cid = String(companyId || '');
  if (!cid) return '';
  const forCo = links.filter((l) => l.companyId === cid);
  if (forCo.length) {
    const primary = forCo.find((l) => l.isPrimary) || forCo[0];
    return primary.workshopTypeId || '';
  }
  return globalType || '';
}

/**
 * Chọn phân loại khi đổi công ty SX: ★ theo links của công ty → còn trong danh sách → heuristic.
 */
export function pickWorkshopTypeIdForCompany(leadTypeRow, companyId, types, kind = null) {
  const rows = Array.isArray(types) ? types : [];
  const inList = (id) => !!id && rows.some((t) => String(t.id) === String(id));
  const linked = preferredWorkshopTypeIdForCompany(leadTypeRow, companyId);
  if (inList(linked)) return String(linked);
  const sug = pickSuggestedWorkshopTypeId(rows, kind);
  return sug || '';
}

/** Hiện tất cả công ty; đưa xưởng gợi ý lên đầu danh sách. */
export function orderSxCompaniesPreferredFirst(companies, kind, preferredCompanyId = '', preferredCompanyIds = []) {
  const list = Array.isArray(companies) ? [...companies] : [];
  const prefSet = new Set(
    [...(Array.isArray(preferredCompanyIds) ? preferredCompanyIds : []), preferredCompanyId]
      .map((id) => String(id || '').trim())
      .filter(Boolean),
  );
  if (!kind && !prefSet.size) return list;
  return list.sort((a, b) => {
    const pa = prefSet.has(String(a?.id)) || companyPreferredForSxKind(a, kind) ? 0 : 1;
    const pb = prefSet.has(String(b?.id)) || companyPreferredForSxKind(b, kind) ? 0 : 1;
    return pa - pb;
  });
}

/** Hiện tất cả phân loại; đưa loại khớp CRM / default_workshop_type_id lên đầu. */
export function orderWorkshopTypesPreferredFirst(types, kind, preferredTypeId = '') {
  const rows = Array.isArray(types) ? [...types] : [];
  const pref = String(preferredTypeId || '');
  if (!kind && !pref) return rows;
  return rows.sort((a, b) => {
    const pa = (pref && String(a?.id) === pref) || workshopTypeMatchesSxKind(a?.name, kind) ? 0 : 1;
    const pb = (pref && String(b?.id) === pref) || workshopTypeMatchesSxKind(b?.name, kind) ? 0 : 1;
    return pa - pb;
  });
}
