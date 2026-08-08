import { api } from '../api/client';
import type {
  KanbanStage,
  PersonalPlanner,
  ProductionBoard,
  ProductionProject,
} from '../types';

const LOGISTICS_STAGE_SLUGS = new Set(['delivery', 'installation', 'customer-care']);
const LOGISTICS_STATUSES = new Set(['shipping', 'installing', 'warranty', 'completed']);
const INTAKE_BUCKET = 'delivery_pending';

export function mapProjectRow(raw: Record<string, unknown>): ProductionProject {
  const customer = (raw.customer || {}) as { full_name?: string; phone?: string };
  const stage = (raw.current_stage || {}) as { id?: string; name?: string; slug?: string };
  const logisticsPerson = (raw.logistics_person || {}) as { id?: string; full_name?: string };
  const installerPerson = (raw.installer_person || {}) as { id?: string; full_name?: string };
  const productionPerson = (raw.production_person || {}) as { id?: string; full_name?: string };
  const salesPerson = (raw.sales_person || {}) as { id?: string; full_name?: string };
  const company = (raw.company || raw.logistics_company || {}) as { id?: string; short_name?: string; name?: string };
  const workshopType = (raw.workshop_type || {}) as { id?: string; name?: string };
  const crmDeals = Array.isArray(raw.crm_deals) ? (raw.crm_deals as Array<Record<string, unknown>>) : [];
  const dealWithRegion = crmDeals.find((d) => d && (d.region_id || d.crm_region));
  const crmRegion = (dealWithRegion?.crm_region || {}) as { id?: string; name?: string };
  return {
    id: String(raw.id || ''),
    code: String(raw.code || ''),
    name: String(raw.name || raw.code || 'Dự án VC'),
    customer_name: customer.full_name ?? (raw.customer_name as string) ?? null,
    customer_phone: customer.phone ?? null,
    status: (raw.status as string) || null,
    priority: (raw.priority as string) || null,
    deadline: (raw.deadline as string) || null,
    production_deadline: (raw.production_deadline as string) || null,
    created_at: (raw.created_at as string) || null,
    estimated_value: Number(raw.estimated_value || 0),
    progress: Number(raw.progress || 0),
    task_total: Number(raw.task_total || 0),
    done_tasks: Number(raw.done_tasks || 0),
    task_total_vc: Number(raw.task_total_vc || 0),
    done_tasks_vc: Number(raw.done_tasks_vc || 0),
    task_total_install: Number(raw.task_total_install || 0),
    done_tasks_install: Number(raw.done_tasks_install || 0),
    is_overdue: Boolean(raw.is_overdue),
    vc_intake: Boolean(raw.vc_intake),
    vc_kanban_column_id: (raw.vc_kanban_column_id as string) ?? null,
    current_stage_id: (raw.current_stage_id as string) ?? stage.id ?? null,
    workshop_type_id: (raw.workshop_type_id as string) ?? workshopType.id ?? null,
    stage_name: stage.name ?? null,
    stage_slug: stage.slug ?? null,
    logistics_person_id: logisticsPerson.id ?? (raw.logistics_person_id as string) ?? null,
    logistics_person_name: logisticsPerson.full_name ?? null,
    installer_person_id: installerPerson.id ?? (raw.installer_person_id as string) ?? null,
    installer_person_name: installerPerson.full_name ?? null,
    production_person_id: productionPerson.id ?? null,
    production_person_name: productionPerson.full_name ?? null,
    sales_person_id: salesPerson.id ?? (raw.sales_person_id as string) ?? null,
    sales_person_name: salesPerson.full_name ?? null,
    company_name: company.short_name || company.name || null,
    company_id: (raw.logistics_company_id as string) ?? (raw.company_id as string) ?? company.id ?? null,
    workshop_type_name: workshopType.name ?? null,
    region_id: (dealWithRegion?.region_id as string) ?? crmRegion.id ?? null,
    region_name: crmRegion.name ?? null,
    crm_deals: crmDeals.map((d) => {
      const assignee = (d.assignee || {}) as { id?: string; full_name?: string };
      const leadOwner = (d.lead_owner || {}) as { id?: string; full_name?: string };
      return {
        id: d.id != null ? String(d.id) : undefined,
        type: d.type != null ? String(d.type) : undefined,
        title: d.title != null ? String(d.title) : null,
        region_id: d.region_id != null ? String(d.region_id) : null,
        external_company_name: d.external_company_name != null ? String(d.external_company_name) : null,
        external_catalog_id: d.external_catalog_id != null ? String(d.external_catalog_id) : null,
        assignee: assignee.full_name ? { id: assignee.id, full_name: assignee.full_name } : null,
        lead_owner: leadOwner.full_name ? { id: leadOwner.id, full_name: leadOwner.full_name } : null,
      };
    }),
  };
}

function mapStageRow(raw: Record<string, unknown>, index: number): KanbanStage {
  const wfStage = (raw.workflow_stage || {}) as { id?: string; slug?: string };
  return {
    id: String(raw.id || ''),
    name: String(raw.name || `Cột ${index + 1}`),
    color: (raw.color as string) ?? null,
    icon: (raw.icon as string) ?? null,
    order_index: Number(raw.order_index ?? index),
    slug: (raw.slug as string) ?? wfStage.slug ?? null,
    bucket_slug: (raw.bucket_slug as string) ?? null,
    workflow_stage_id: (raw.workflow_stage_id as string) ?? wfStage.id ?? null,
    workflow_stage: wfStage.slug ? { slug: wfStage.slug } : null,
    is_handover_to_install: Boolean(raw.is_handover_to_install),
    crm_sync_type: (raw.crm_sync_type as string) ?? null,
    count: raw.count != null ? Number(raw.count) : undefined,
    total_value: raw.total_value != null ? Number(raw.total_value) : undefined,
  };
}

/** Resolve cột Kanban VC — replicate enrichOneLogisticsProject (backend). */
export function resolveColumnId(
  project: ProductionProject,
  sortedStages: KanbanStage[],
): string | null {
  const intakeCol = sortedStages.find((c) => c.bucket_slug === INTAKE_BUCKET);
  const firstCol = sortedStages[0] || null;
  const colIdSet = new Set(sortedStages.map((c) => String(c.id)));
  const stageSlug = project.stage_slug || null;
  const status = project.status;
  let matchedCol: KanbanStage | null = null;

  if (project.vc_kanban_column_id && colIdSet.has(String(project.vc_kanban_column_id))) {
    matchedCol = sortedStages.find((c) => String(c.id) === String(project.vc_kanban_column_id)) || null;
  }

  if (!matchedCol) {
    for (const col of sortedStages) {
      if (col.bucket_slug === INTAKE_BUCKET) continue;
      const wsSlug = col.workflow_stage_id
        ? sortedStages.find((s) => s.workflow_stage_id === col.workflow_stage_id)?.bucket_slug
        : null;
      if (stageSlug && (col.bucket_slug === stageSlug || wsSlug === stageSlug)) {
        matchedCol = col;
        break;
      }
      if (status && col.bucket_slug === status) {
        matchedCol = col;
        break;
      }
    }
  }

  const inScope = (status && LOGISTICS_STATUSES.has(status))
    || (stageSlug && LOGISTICS_STAGE_SLUGS.has(stageSlug));
  if (!matchedCol && inScope) {
    matchedCol = intakeCol || firstCol;
  }

  return matchedCol?.id || project.vc_kanban_column_id || null;
}

export type BoardFilters = {
  companyId?: string;
  dealCompanyId?: string;
  workshopTypeId?: string;
};

const PROJECTS_PAGE_LIMIT = 200;
const PROJECTS_MAX_PAGES = 40;
const PROJECTS_FETCH_CONCURRENCY = 5;

const boardInflight = new Map<string, Promise<ProductionBoard>>();

function boardInflightKey(filters: BoardFilters = {}): string {
  return `${filters.companyId || ''}|${filters.dealCompanyId || ''}|${filters.workshopTypeId || ''}`;
}

async function fetchAllProjects(noCache = false, filters: BoardFilters = {}): Promise<ProductionProject[]> {
  const buildParams = (page: number): Record<string, unknown> => {
    const params: Record<string, unknown> = {
      page,
      limit: PROJECTS_PAGE_LIMIT,
      lite: 1,
      view: 'mobile',
    };
    if (noCache) params._t = Date.now();
    if (filters.companyId) params.company_id = filters.companyId;
    if (filters.workshopTypeId) params.workshop_type_id = filters.workshopTypeId;
    return params;
  };
  const getPage = async (page: number) => {
    const { data } = await api.get<{
      projects?: Array<Record<string, unknown>>;
      totalPages?: number;
      total?: number;
    }>('/logistics/projects', { params: buildParams(page) });
    const rows = Array.isArray(data?.projects) ? data.projects : [];
    const total = Number(data?.total ?? rows.length);
    const reportedPages = Number(data?.totalPages);
    const totalPages = Number.isFinite(reportedPages) && reportedPages > 0
      ? reportedPages
      : Math.max(1, Math.ceil(total / PROJECTS_PAGE_LIMIT));
    return { rows, totalPages };
  };

  const first = await getPage(1);
  const out: ProductionProject[] = first.rows.map(mapProjectRow);
  let totalPages = Math.min(first.totalPages, PROJECTS_MAX_PAGES);

  // Backend cũ: total = độ dài trang → totalPages=1 dù còn data. Probe thêm trang đầy.
  if (totalPages <= 1 && first.rows.length >= PROJECTS_PAGE_LIMIT) {
    for (let p = 2; p <= PROJECTS_MAX_PAGES; p += 1) {
      const next = await getPage(p);
      for (const row of next.rows) out.push(mapProjectRow(row));
      if (next.rows.length < PROJECTS_PAGE_LIMIT) break;
    }
    return out;
  }

  if (totalPages <= 1 || first.rows.length < PROJECTS_PAGE_LIMIT) return out;

  const remaining: number[] = [];
  for (let p = 2; p <= totalPages; p += 1) remaining.push(p);

  for (let i = 0; i < remaining.length; i += PROJECTS_FETCH_CONCURRENCY) {
    const batch = remaining.slice(i, i + PROJECTS_FETCH_CONCURRENCY);
    const results = await Promise.all(batch.map((p) => getPage(p)));
    results.forEach((r) => {
      for (const row of r.rows) out.push(mapProjectRow(row));
    });
  }
  return out;
}

async function fetchLogisticsBoardUncapped(
  noCache = false,
  filters: BoardFilters = {},
): Promise<ProductionBoard> {
  const stageParams: Record<string, unknown> = {};
  if (noCache) stageParams._t = Date.now();
  if (filters.companyId) stageParams.company_id = filters.companyId;
  if (filters.workshopTypeId) stageParams.workshop_type_id = filters.workshopTypeId;

  const [stageRes, projects] = await Promise.all([
    api
      .get<Array<Record<string, unknown>>>('/logistics/pipeline-stages', {
        params: Object.keys(stageParams).length ? stageParams : undefined,
      })
      .then((r) => (Array.isArray(r.data) ? r.data : []))
      .catch(() => [] as Array<Record<string, unknown>>),
    fetchAllProjects(noCache, filters),
  ]);

  const stages = stageRes.map((s, i) => mapStageRow(s, i)).sort((a, b) => a.order_index - b.order_index);
  const kpis = null;
  const stageById = new Map(stages.map((s) => [String(s.id), s]));

  const resolved = projects.map((p) => {
    const resolved_column_id =
      p.vc_kanban_column_id && stageById.has(String(p.vc_kanban_column_id))
        ? p.vc_kanban_column_id
        : resolveColumnId(p, stages);
    const col = resolved_column_id ? stageById.get(String(resolved_column_id)) : undefined;
    // Chỉ đánh dấu intake khi đúng cột tiếp nhận — không suy từ thiếu workflow_stage_id
    // (cột «Đã giao» tùy chỉnh thường không gắn workflow nhưng không phải intake).
    const vc_intake = col
      ? (col.bucket_slug === INTAKE_BUCKET
        || String(col.id || '').startsWith('__vc_intake')
        || (() => {
          const name = String(col.name || '').toLowerCase();
          return name.includes('tiếp nhận') || name.includes('tiep nhan')
            || name.includes('chờ vc') || name.includes('chờ vận');
        })())
      : Boolean(p.vc_intake);
    return { ...p, resolved_column_id, vc_intake };
  });
  return { stages, projects: resolved, kpis };
}

export function fetchLogisticsBoard(
  noCache = false,
  filters: BoardFilters = {},
): Promise<ProductionBoard> {
  const key = boardInflightKey(filters);
  const existing = boardInflight.get(key);
  if (existing) return existing;
  const pending = fetchLogisticsBoardUncapped(noCache, filters).finally(() => {
    if (boardInflight.get(key) === pending) boardInflight.delete(key);
  });
  boardInflight.set(key, pending);
  return pending;
}

/** Alias tương thích màn hình copy từ vc-mobile. */
export const fetchProductionBoard = fetchLogisticsBoard;

export async function fetchProductionProject(projectId: string): Promise<ProductionProject> {
  const { data } = await api.get<{ project?: Record<string, unknown> }>(
    `/logistics/projects/${projectId}`,
  );
  const raw = (data?.project ?? data) as Record<string, unknown>;
  return mapProjectRow(raw);
}

export type MoveStageResult = {
  vc_kanban_column_id?: string;
  current_stage_id?: string | null;
  jumped_to_install?: boolean;
  install_stage_id?: string | null;
  install_stage_name?: string | null;
};

export async function moveProjectToStage(
  projectId: string,
  targetStageId: string,
  options: {
    currentStageId?: string | null;
    isIntake?: boolean;
    companyId?: string | null;
    workflowStageId?: string | null;
  } = {},
): Promise<MoveStageResult> {
  if (options.isIntake) {
    const { data } = await api.patch(`/logistics/projects/${projectId}/stage`, { move_to_intake: true });
    return {
      vc_kanban_column_id: data?.project?.vc_kanban_column_id ?? targetStageId,
      current_stage_id: data?.project?.current_stage_id ?? null,
    };
  }
  const body: Record<string, unknown> = { vc_stage_id: targetStageId };
  if (options.workflowStageId) body.stage_id = options.workflowStageId;
  const { data } = await api.patch(`/logistics/projects/${projectId}/stage`, body);
  return {
    vc_kanban_column_id: data?.project?.vc_kanban_column_id ?? targetStageId,
    current_stage_id: data?.project?.current_stage_id ?? null,
    jumped_to_install: Boolean(data?.jumped_to_install),
    install_stage_id: data?.install_stage_id ?? null,
    install_stage_name: data?.install_stage_name ?? null,
  };
}

export async function assignProjectWorkshopType(
  projectId: string,
  workshopTypeId: string,
): Promise<ProductionProject> {
  const { data } = await api.put<{ project?: Record<string, unknown> }>(
    `/projects/${projectId}`,
    { workshop_type_id: workshopTypeId },
  );
  const raw = (data?.project ?? data) as Record<string, unknown>;
  return mapProjectRow(raw);
}

export type CreateDealInput = {
  title: string;
  estimatedValue?: number | null;
  customerName?: string | null;
  customerPhone?: string | null;
  notes?: string | null;
  companyId?: string | null;
};

export async function createDeal(input: CreateDealInput): Promise<{ id: string; code?: string }> {
  let customerId: string | null = null;
  const name = input.customerName?.trim();
  if (name) {
    try {
      const { data: cust } = await api.post('/crm/customers', {
        full_name: name,
        phone: input.customerPhone?.trim() || null,
        company_id: input.companyId || undefined,
      });
      customerId = cust?.id ?? null;
    } catch {
      customerId = null;
    }
  }

  const payload: Record<string, unknown> = { title: input.title.trim() };
  if (input.estimatedValue != null && !Number.isNaN(input.estimatedValue)) {
    payload.estimated_value = input.estimatedValue;
  }
  if (customerId) payload.customer_id = customerId;
  if (input.notes?.trim()) payload.notes = input.notes.trim();
  if (input.companyId) payload.company_id = input.companyId;

  const { data } = await api.post('/crm/deals', payload);
  return { id: String(data?.id || ''), code: data?.code };
}

/** Planner VC — dùng board làm nguồn (backend chưa có /logistics/planner/me). */
export async function fetchPersonalPlanner(): Promise<PersonalPlanner> {
  return { columns: [], items: [] };
}

export type CompanyOption = { id: string; name: string };

export async function fetchCompanies(): Promise<CompanyOption[]> {
  const { data } = await api.get<{ companies?: unknown[] } | unknown[]>(
    '/companies',
    { params: { for_module: 'logistics' } },
  );
  const list = Array.isArray(data)
    ? data
    : Array.isArray(data?.companies)
      ? data.companies
      : [];
  return list.map((c) => {
    const row = c as Record<string, unknown>;
    return {
      id: String(row.id || ''),
      name: String(row.short_name || row.name || row.id || ''),
    };
  }).filter((c) => c.id);
}

export type WorkshopTypeOption = { id: string; name: string };

export type CommentIndexEntry = {
  count: number;
  last_at: string | null;
  last_user_id: string | null;
};

export type ProjectCommentUser = {
  id?: string;
  full_name?: string;
  avatar?: string | null;
};

export type CommentAttachment = {
  url: string;
  name: string;
  mime?: string;
  size?: number;
};

export type ProjectComment = {
  id: string;
  project_id?: string;
  lead_id?: string;
  user_id: string;
  parent_id?: string | null;
  content: string;
  created_at: string;
  updated_at?: string | null;
  comment_type?: string | null;
  metadata?: Record<string, unknown> | null;
  attachments?: CommentAttachment[];
  user?: ProjectCommentUser;
  reactions?: {
    summary: { emoji: string; count: number }[];
    mine: string | null;
  };
};

export function isCommentImageAttachment(att: CommentAttachment): boolean {
  const mime = String(att.mime || '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  if (
    mime
    && (
      mime.includes('pdf')
      || mime.includes('word')
      || mime.includes('sheet')
      || mime.includes('excel')
      || mime.includes('presentation')
      || mime.includes('zip')
      || mime.startsWith('video/')
      || mime.startsWith('audio/')
      || mime.includes('msword')
      || mime.includes('officedocument')
    )
  ) {
    return false;
  }
  const path = String(att.name || att.url || '').split('?')[0].split('#')[0];
  if (/\.(jpe?g|png|gif|webp|bmp|heic|heif|avif|svg)$/i.test(path)) return true;
  // Ảnh chụp/chọn từ app thường đặt tên anh-*.jpg — vẫn nhận khi storage đổi tên mất đuôi.
  if (/^anh[-_]/i.test(String(att.name || '')) || /\b(image|photo|img)[-_]/i.test(String(att.name || ''))) {
    return true;
  }
  return false;
}

function mapCommentAttachment(raw: unknown): CommentAttachment | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  const url = String(a.url || a.file_url || '').trim();
  if (!url || url.startsWith('data:')) return null;
  const name = String(a.name || a.file_name || 'file').trim() || 'file';
  let mime = String(a.type || a.mime_type || '').trim() || undefined;
  if (!mime) {
    const path = `${name} ${url}`.split('?')[0];
    const m = path.match(/\.(jpe?g|png|gif|webp|bmp|heic|heif|avif|svg)$/i);
    if (m) {
      const ext = m[1].toLowerCase();
      mime = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    }
  }
  return {
    url: url.slice(0, 800),
    name: name.slice(0, 400),
    mime,
    size: Number.isFinite(Number(a.size ?? a.file_size)) ? Number(a.size ?? a.file_size) : undefined,
  };
}

function mapCommentAttachments(raw: unknown): CommentAttachment[] {
  let list: unknown[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) list = parsed;
    } catch {
      return [];
    }
  }
  return list.map(mapCommentAttachment).filter(Boolean) as CommentAttachment[];
}

const RAW_URL_RE = /^(https?:\/\/|\/uploads\/)\S+$/i;

function mimeFromFileName(name: string): string | undefined {
  const m = String(name || '').split('?')[0].match(/\.(jpe?g|png|gif|webp|bmp|heic|heif|avif|svg|pdf)$/i);
  if (!m) return undefined;
  const ext = m[1].toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  return `image/${ext === 'jpg' ? 'jpeg' : ext}`;
}

/**
 * Tin hệ thống web: «tên|https://…supabase…/t13.png»
 * → tách thành attachment + rút gọn text «tên» (giống preview ảnh trên web).
 */
function enrichSystemFileLinksInContent(
  content: string,
  attachments: CommentAttachment[],
): { content: string; attachments: CommentAttachment[] } {
  if (!content.includes('«') || !content.includes('|')) {
    return { content, attachments };
  }
  const existing = new Set(
    attachments.map((a) => String(a.url || '').split('?')[0].toLowerCase()).filter(Boolean),
  );
  const extra: CommentAttachment[] = [];
  const cleaned = content.replace(/«([^»|]+)\|([^»]+)»/g, (_full, labelRaw: string, urlRaw: string) => {
    const label = String(labelRaw || '').trim();
    let url = String(urlRaw || '').trim();
    if (!label || !url) return _full;
    if (url.startsWith('hidden:')) return `«${label}» (đã ẩn)`;
    const key = url.split('?')[0].toLowerCase();
    if (!existing.has(key)) {
      existing.add(key);
      extra.push({
        url: url.slice(0, 800),
        name: label.slice(0, 400),
        mime: mimeFromFileName(label) || mimeFromFileName(url),
      });
    }
    return `«${label}»`;
  });
  return {
    content: cleaned,
    attachments: extra.length ? [...attachments, ...extra] : attachments,
  };
}

/** Body chỉ là URL/JSON file → chuyển sang attachments, tránh hiện link thô. */
function sanitizeCommentContent(
  content: string,
  attachments: CommentAttachment[],
): { content: string; attachments: CommentAttachment[] } {
  const trimmed = String(content || '').trim();
  if (!trimmed) return { content: '', attachments };

  const looksLikeJson =
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
    || (trimmed.startsWith('{') && trimmed.endsWith('}'));
  if (looksLikeJson && trimmed.includes('url')) {
    try {
      const fromBody = mapCommentAttachments(JSON.parse(trimmed));
      if (fromBody.length) {
        return { content: '', attachments: attachments.length ? attachments : fromBody };
      }
    } catch {
      /* keep */
    }
  }

  if (RAW_URL_RE.test(trimmed)) {
    if (attachments.length) return { content: '', attachments };
    const url = trimmed.slice(0, 800);
    const namePart = decodeURIComponent(url.split('/').pop()?.split('?')[0] || 'file');
    const mapped = mapCommentAttachment({ url, name: namePart });
    return { content: '', attachments: mapped ? [mapped] : [] };
  }

  // Bình luận hệ thống từ web: «t13.png|https://…»
  return enrichSystemFileLinksInContent(trimmed, attachments);
}

/** Deal CRM gắn dự án — bình luận dùng crm_lead_comments (đồng bộ tab deal trên web). */
export function resolveProjectDealId(project?: {
  crm_deals?: Array<{ id?: string; type?: string } | null> | null;
  /** Chi tiết dự án map camelCase từ API logistics. */
  crmDeals?: Array<{ id?: string; type?: string } | null> | null;
  crm_lead_id?: string | null;
} | null): string | null {
  if (!project) return null;
  if (project.crm_lead_id) return String(project.crm_lead_id);
  const deals = Array.isArray(project.crm_deals) && project.crm_deals.length
    ? project.crm_deals
    : (Array.isArray(project.crmDeals) ? project.crmDeals : []);
  const deal = deals.find((d) => String(d?.type || '') === 'deal') || deals[0];
  return deal?.id ? String(deal.id) : null;
}

export function partitionProjectsByCommentSource(projects: ProductionProject[] = []) {
  const projectOnlyIds: string[] = [];
  const leadIds: string[] = [];
  const leadIdToProjectId: Record<string, string> = {};
  for (const p of projects || []) {
    const pid = p?.id ? String(p.id) : '';
    if (!pid) continue;
    const leadId = resolveProjectDealId(p);
    if (leadId) {
      leadIds.push(leadId);
      leadIdToProjectId[leadId] = pid;
    } else {
      projectOnlyIds.push(pid);
    }
  }
  return {
    projectOnlyIds: [...new Set(projectOnlyIds)],
    leadIds: [...new Set(leadIds)],
    leadIdToProjectId,
  };
}

function mapCommentRow(raw: Record<string, unknown>): ProjectComment {
  const user = (raw.user || {}) as Record<string, unknown>;
  const reactions = (raw.reactions || { summary: [], mine: null }) as ProjectComment['reactions'];
  const meta = raw.metadata && typeof raw.metadata === 'object' && !Array.isArray(raw.metadata)
    ? (raw.metadata as Record<string, unknown>)
    : null;
  const attachments = mapCommentAttachments(raw.attachments);
  const sanitized = sanitizeCommentContent(String(raw.content ?? raw.body ?? ''), attachments);
  return {
    id: String(raw.id || ''),
    project_id: raw.project_id != null ? String(raw.project_id) : undefined,
    lead_id: raw.lead_id != null ? String(raw.lead_id) : undefined,
    user_id: String(raw.user_id || ''),
    parent_id: raw.parent_id != null && raw.parent_id !== '' ? String(raw.parent_id) : null,
    content: sanitized.content,
    created_at: String(raw.created_at || ''),
    updated_at: raw.updated_at != null ? String(raw.updated_at) : null,
    comment_type: raw.comment_type != null ? String(raw.comment_type) : null,
    metadata: meta,
    attachments: sanitized.attachments,
    user: {
      id: user.id != null ? String(user.id) : undefined,
      full_name: user.full_name != null ? String(user.full_name) : undefined,
      avatar: user.avatar != null ? String(user.avatar) : null,
    },
    reactions: {
      summary: Array.isArray(reactions?.summary) ? reactions!.summary : [],
      mine: reactions?.mine ?? null,
    },
  };
}

export type CommentListOpts = { limit?: number; before?: string };

export type CommentListResult = {
  comments: ProjectComment[];
  hasMore: boolean;
};

function commentListParams(opts?: CommentListOpts): Record<string, string | number> | undefined {
  if (!opts?.limit && !opts?.before) return undefined;
  const params: Record<string, string | number> = {};
  if (opts.limit) params.limit = opts.limit;
  if (opts.before) params.before = opts.before;
  return params;
}

function commentHeaderHasMore(headers: Record<string, unknown> | undefined, fallback: boolean): boolean {
  const raw = String(headers?.['x-has-more'] ?? headers?.['X-Has-More'] ?? '').toLowerCase();
  if (raw === '1' || raw === 'true') return true;
  if (raw === '0' || raw === 'false') return false;
  return fallback;
}

export async function fetchProjectCommentsPage(
  projectId: string,
  opts?: CommentListOpts,
): Promise<CommentListResult> {
  const res = await api.get<{ comments?: unknown[]; has_more?: boolean }>(
    `/projects/${projectId}/comments`,
    { params: commentListParams(opts) },
  );
  const list = Array.isArray(res.data?.comments) ? res.data.comments : [];
  const fallback = !!(opts?.limit && list.length >= opts.limit);
  return {
    comments: list.map((row) => mapCommentRow(row as Record<string, unknown>)),
    hasMore: res.data?.has_more === true || commentHeaderHasMore(res.headers as Record<string, unknown> | undefined, fallback),
  };
}

export async function fetchProjectComments(
  projectId: string,
  opts?: CommentListOpts,
): Promise<ProjectComment[]> {
  const page = await fetchProjectCommentsPage(projectId, opts);
  return page.comments;
}

/** Bình luận deal CRM — cùng nguồn với tab Bình luận trên LeadDetail. */
export async function fetchDealCommentsPage(
  dealId: string,
  opts?: CommentListOpts,
): Promise<CommentListResult> {
  const res = await api.get<unknown>(`/crm/leads/${dealId}/comments`, {
    params: commentListParams(opts),
  });
  const list = Array.isArray(res.data) ? res.data : [];
  const fallback = !!(opts?.limit && list.length >= opts.limit);
  return {
    comments: list.map((row) => mapCommentRow(row as Record<string, unknown>)),
    hasMore: commentHeaderHasMore(res.headers as Record<string, unknown> | undefined, fallback),
  };
}

export async function fetchDealComments(
  dealId: string,
  opts?: CommentListOpts,
): Promise<ProjectComment[]> {
  const page = await fetchDealCommentsPage(dealId, opts);
  return page.comments;
}

export async function fetchProjectCommentIndex(
  projectIds: string[],
): Promise<Record<string, CommentIndexEntry>> {
  const ids = [...new Set(projectIds.map(String).filter(Boolean))];
  if (!ids.length) return {};
  const { data } = await api.get<Record<string, CommentIndexEntry>>('/projects/comments/index', {
    params: { project_ids: ids.join(',') },
  });
  return data && typeof data === 'object' ? data : {};
}

export async function fetchDealCommentIndex(
  leadIds: string[],
): Promise<Record<string, CommentIndexEntry>> {
  const ids = [...new Set(leadIds.map(String).filter(Boolean))];
  if (!ids.length) return {};
  const { data } = await api.get<Record<string, CommentIndexEntry>>('/crm/lead-comments/index', {
    params: { lead_ids: ids.join(',') },
  });
  return data && typeof data === 'object' ? data : {};
}

/** Badge bình luận Kanban: có deal → crm_lead_comments; không deal → project_comments. */
export async function fetchCommentsIndexForProjects(
  projects: ProductionProject[],
): Promise<Record<string, CommentIndexEntry>> {
  const { projectOnlyIds, leadIds, leadIdToProjectId } = partitionProjectsByCommentSource(projects);
  const merged: Record<string, CommentIndexEntry> = {};

  if (projectOnlyIds.length) {
    Object.assign(merged, await fetchProjectCommentIndex(projectOnlyIds).catch(() => ({})));
  }
  if (leadIds.length) {
    const leadIndex = (await fetchDealCommentIndex(leadIds).catch(() => ({}))) as Record<string, CommentIndexEntry>;
    for (const leadId of leadIds) {
      const meta = leadIndex[leadId] || leadIndex[String(leadId)];
      const pid = leadIdToProjectId[leadId];
      if (pid && meta) merged[pid] = meta;
    }
  }
  return merged;
}

export async function postProjectComment(
  projectId: string,
  content: string,
  parentId?: string | null,
  attachments?: CommentAttachment[],
): Promise<ProjectComment> {
  const payload: {
    content: string;
    parent_id?: string;
    attachments?: { file_url: string; file_name: string; mime_type?: string; file_size?: number }[];
  } = { content: content.trim() };
  if (parentId) payload.parent_id = parentId;
  if (attachments?.length) {
    payload.attachments = attachments.map((a) => ({
      file_url: a.url,
      file_name: a.name,
      mime_type: a.mime,
      file_size: a.size,
    }));
  }
  const { data } = await api.post<{ comment?: unknown } & Record<string, unknown>>(
    `/projects/${projectId}/comments`,
    payload,
  );
  const row = (data?.comment ?? data) as Record<string, unknown>;
  return mapCommentRow(row);
}

export async function postDealComment(
  dealId: string,
  content: string,
  parentId?: string | null,
  attachments?: CommentAttachment[],
): Promise<ProjectComment> {
  const payload: {
    body: string;
    parent_id?: number | string;
    attachments?: { url: string; name: string; type?: string; size?: number }[];
  } = { body: content.trim() };
  if (parentId) {
    const n = Number(parentId);
    payload.parent_id = Number.isFinite(n) && n > 0 ? n : parentId;
  }
  if (attachments?.length) {
    payload.attachments = attachments.map((a) => ({
      url: a.url,
      name: a.name,
      type: a.mime,
      size: a.size,
    }));
  }
  const { data } = await api.post<Record<string, unknown>>(`/crm/leads/${dealId}/comments`, payload);
  return mapCommentRow((data || {}) as Record<string, unknown>);
}

export async function uploadCommentFiles(
  files: { uri: string; name: string; mime: string }[],
): Promise<CommentAttachment[]> {
  if (!files.length) return [];
  const { postMultipart } = await import('../api/client');
  const form = new FormData();
  for (const f of files) {
    form.append('files', { uri: f.uri, name: f.name, type: f.mime } as unknown as Blob);
  }
  const { data: up } = await postMultipart<{
    files: { file_url?: string; file_name?: string; file_size?: number; mime_type?: string }[];
  }>('/upload', form);
  return (up?.files || [])
    .filter((u) => u.file_url)
    .map((u) => ({
      url: String(u.file_url),
      name: String(u.file_name || 'file'),
      mime: u.mime_type || undefined,
      size: u.file_size != null ? Number(u.file_size) : undefined,
    }));
}

export async function toggleProjectCommentReaction(
  projectId: string,
  commentId: string,
  emoji: string,
): Promise<ProjectComment['reactions']> {
  const { data } = await api.put<ProjectComment['reactions']>(
    `/projects/${projectId}/comments/${commentId}/reaction`,
    { emoji },
  );
  return data || { summary: [], mine: null };
}

export async function toggleDealCommentReaction(
  commentId: string,
  emoji: string,
): Promise<ProjectComment['reactions']> {
  const { data } = await api.put<ProjectComment['reactions']>(
    `/crm/lead-comments/${commentId}/reaction`,
    { emoji },
  );
  return data || { summary: [], mine: null };
}

/** Xác nhận một phía (SX / VC) trên bình luận bàn giao — PATCH /vc-handover/comments/:cid/confirm */
export async function confirmVcHandoverComment(
  commentId: string,
  side: 'production' | 'logistics',
): Promise<ProjectComment> {
  const { data } = await api.patch<{ comment?: Record<string, unknown> }>(
    `/vc-handover/comments/${commentId}/confirm`,
    { side },
  );
  const row = (data?.comment || data || {}) as Record<string, unknown>;
  return mapCommentRow(row);
}

export async function fetchWorkshopTypes(
  companyId?: string | null,
  _clientCompanyId?: string | null,
): Promise<WorkshopTypeOption[]> {
  if (!companyId) return [];
  const params: Record<string, string> = { company_id: companyId, module: 'logistics' };
  const { data } = await api.get<unknown>('/workshop/project-types', { params });
  const list = Array.isArray(data) ? data : [];
  return list.map((t) => {
    const row = t as Record<string, unknown>;
    return { id: String(row.id || ''), name: String(row.name || row.id || '') };
  }).filter((t) => t.id);
}

export type ClientCompanyOption = {
  id: string;
  name: string;
  short_name?: string | null;
  client_company_id?: string | null;
  external_catalog_id?: string | null;
  source?: string;
};

export async function fetchClientCompanies(_workshopCompanyId: string): Promise<ClientCompanyOption[]> {
  return [];
}

export async function fetchWorkshopOptionsForDeal(_dealCompanyId: string): Promise<CompanyOption[]> {
  return [];
}

export type ExternalCompanyOption = { id: string; name: string };

export async function fetchExternalCompanies(_companyId: string): Promise<ExternalCompanyOption[]> {
  return [];
}

export type RegionOption = { id: string; name: string; divisionName?: string | null };

export async function fetchCompanyRegions(
  companyId: string,
  opts?: { forModule?: 'production' | 'crm' | 'logistics' | null },
): Promise<RegionOption[]> {
  const params: Record<string, string> = { company_id: companyId };
  if (opts?.forModule) params.for_module = opts.forModule;
  const { data } = await api.get<unknown>('/crm/company-regions', { params });
  const list = Array.isArray(data) ? data : [];
  return list
    .filter((r) => (r as Record<string, unknown>).is_active !== false)
    .map((r) => {
      const row = r as Record<string, unknown>;
      const division = (row.division || {}) as Record<string, unknown>;
      const divisionName = division.short_name || division.name || null;
      return {
        id: String(row.id || ''),
        name: String(row.name || row.id || ''),
        divisionName: divisionName ? String(divisionName) : null,
      };
    })
    .filter((r) => r.id);
}

export type WorkshopIntakeInput = {
  title: string;
  company_id: string;
  workshop_type_id: string;
  region_id?: string | null;
  customer_name: string;
  customer_phone: string;
  customer_email?: string | null;
  install_address?: string | null;
  estimated_value?: number;
  description?: string | null;
  external_company_name?: string | null;
};

export type WorkshopIntakeResult = {
  project_id?: string;
  project_code?: string;
  project_name?: string;
  deal_id?: string;
  deal_code?: string;
};

export async function createWorkshopIntake(input: WorkshopIntakeInput): Promise<WorkshopIntakeResult> {
  // Tạo dự án VC — khớp web NewLogisticsProjectModal (POST /projects, status shipping).
  const { data } = await api.post<Record<string, unknown>>('/projects', {
    name: input.title.trim(),
    company_id: input.company_id || null,
    workshop_type_id: input.workshop_type_id || null,
    estimated_value: input.estimated_value || null,
    priority: 'medium',
    status: 'shipping',
    customer_name: input.customer_name || null,
    customer_phone: input.customer_phone || null,
    customer_email: input.customer_email || null,
    install_address: input.install_address || null,
    description: input.description || null,
    region_id: input.region_id || null,
    external_company_name: input.external_company_name || null,
  });
  const row = (data || {}) as Record<string, unknown>;
  const project = (row.project || row) as Record<string, unknown>;
  return {
    project_id: project.id != null ? String(project.id) : undefined,
    project_code: project.code != null ? String(project.code) : undefined,
    project_name: project.name != null ? String(project.name) : undefined,
  };
}
