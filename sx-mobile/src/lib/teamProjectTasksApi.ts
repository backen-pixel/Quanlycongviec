import { api } from '../api/client';
import { fetchAssignmentLookups } from './sharedWorkspaceApi';
import { QUERY_TTL_SHORT, cachedQuery } from './queryCache';
import { isTaskOverdue, mapUnifiedToWorkTask, type WorkTask } from './workTasksApi';

/**
 * Việc DỰ ÁN (bảng `tasks` + `crm_tasks` của deal đã có dự án) CHƯA XONG của cả đội — góc nhìn quản lý.
 *
 * Tổng quan / tab Công việc của quản lý trước đây chỉ đọc «Giao việc» (`/crm/assignments`), nên hàng nghìn
 * việc theo dự án — và mọi việc quá hạn của chúng — không bao giờ hiện, còn banner nói «Không có quá hạn».
 *
 * Nguồn chính: `GET /work-tasks/team-project-tasks` — máy chủ tính SỐ ĐẾM toàn bộ và trả từng TRANG theo
 * nhóm dự án (quá hạn lên trước), nên app chỉ tải phần đang xem: thời gian mở màn không còn tăng theo
 * khối lượng dữ liệu. Nếu máy chủ chưa có endpoint này (chưa deploy → 404) thì rơi về cách cũ: nạp hết rồi
 * tự đếm ở máy.
 *
 * Tiền tố khóa trùng `sx:workTasks:` để `invalidateWorkTasksCache` xóa luôn khi có thay đổi.
 */
const K_TEAM = 'sx:workTasks:team-project:';
export const TEAM_GROUPS_PER_PAGE = 20;
/** Lấy việc đến hạn trong N ngày tới (ngoài việc quá hạn). */
const DUE_SOON_DAYS = 7;

export type TeamProjectCounts = {
  overdue: number;
  soon: number;
  total: number;
  inProgress: number;
  groups: number;
};

export type TeamProjectPage = {
  tasks: WorkTask[];
  counts: TeamProjectCounts;
  hasMore: boolean;
  page: number;
};

type Opts = {
  companyId?: string | null;
  assigneeId?: string | null;
  q?: string;
  page?: number;
  pageSize?: number;
  force?: boolean;
  signal?: AbortSignal;
};

function mapRow(raw: Record<string, unknown>): WorkTask {
  const t = mapUnifiedToWorkTask(raw);
  const id = raw.assignee_id ? String(raw.assignee_id) : '';
  const name = String(raw.assignee_name || '').trim();
  const withWho = id && name ? { ...t, assignee: { id, full_name: name } as WorkTask['assignee'] } : t;
  // Gom nhóm THEO DỰ ÁN: một dự án có thể gắn nhiều deal, view trả mỗi việc một bản cho từng deal nên sau khi
  // khử trùng các việc cùng dự án mang `lead_id` khác nhau → bị tách thành nhiều nhóm trùng tên. Deal thật vẫn
  // nằm ở `deal_id` (dùng cho việc `crm_task` khi cập nhật).
  const projectId = raw.project_id ? String(raw.project_id) : '';
  return projectId ? { ...withWho, lead_id: projectId } : withWho;
}

/** Ngày (giờ VN) cách hôm nay `plusDays` ngày, dạng YYYY-MM-DD — chỉ cho đường dự phòng. */
function vnDate(plusDays = 0): string {
  return new Date(Date.now() + plusDays * 86_400_000)
    .toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' });
}

async function fetchLegacyAll(params: Record<string, unknown>): Promise<WorkTask[]> {
  const out: WorkTask[] = [];
  for (let page = 1; out.length < 3000; page += 1) {
    const { data } = await api.get<{ tasks?: unknown[]; total?: number }>('/work-tasks', {
      params: { ...params, page, page_size: 500 },
    });
    const rows = Array.isArray(data?.tasks) ? data.tasks : [];
    out.push(...rows.map((r) => mapRow(r as Record<string, unknown>)).filter((t) => t.id));
    const total = Number(data?.total);
    if (rows.length < 500 || (Number.isFinite(total) && out.length >= total)) break;
  }
  return out;
}

/** Đường dự phòng (máy chủ chưa có endpoint mới): nạp hết, khử trùng, tự đếm. */
async function fetchLegacy(o: Opts): Promise<TeamProjectPage> {
  const base: Record<string, unknown> = {
    open_only: 1,
    date_to: vnDate(DUE_SOON_DAYS),
    ...(o.companyId ? { company_id: o.companyId } : {}),
    ...(o.assigneeId ? { assignee_id: o.assigneeId } : {}),
    ...(o.q?.trim() ? { q: o.q.trim() } : {}),
  };
  const [sx, crm, users] = await Promise.all([
    fetchLegacyAll({ ...base, module_key: 'production' }),
    fetchLegacyAll({ ...base, task_kind: 'CRM-Deal' }),
    fetchAssignmentLookups(o.companyId || null).then((r) => r.users).catch(() => []),
  ]);
  const nameById = new Map(users.map((u) => [u.id, u.full_name || u.email || '']));
  const keyOf = (t: WorkTask) => `${t.lead?.project_id || ''}|${String(t.title || '').trim().toLowerCase()}`;
  const seen = new Set(sx.map(keyOf));
  const extra = crm.filter((t) => {
    if (!t.lead?.project_id) return false;
    const k = keyOf(t);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const tasks = [...sx, ...extra].map((t) => {
    const id = t.assignee_id ? String(t.assignee_id) : '';
    const name = id ? nameById.get(id) : '';
    return name ? { ...t, assignee: { id, full_name: name } as WorkTask['assignee'] } : t;
  });
  const overdue = tasks.filter((t) => isTaskOverdue(t)).length;
  const projects = new Set(tasks.map((t) => String(t.lead?.project_id || t.lead_id || '')));
  return {
    tasks,
    counts: {
      overdue,
      soon: tasks.length - overdue,
      total: tasks.length,
      inProgress: tasks.filter((t) => String(t.status) === 'in_progress').length,
      groups: projects.size,
    },
    hasMore: false,
    page: 1,
  };
}

/** Một TRANG nhóm dự án + số đếm toàn bộ (xem mô tả ở đầu file). */
export async function fetchTeamProjectTasksPage(o: Opts): Promise<TeamProjectPage> {
  const page = Math.max(1, o.page || 1);
  const pageSize = o.pageSize || TEAM_GROUPS_PER_PAGE;
  const key = `${K_TEAM}${o.companyId || ''}|${o.assigneeId || ''}|${(o.q || '').trim()}|${page}|${pageSize}`;
  return cachedQuery<TeamProjectPage>({
    key,
    ttlMs: QUERY_TTL_SHORT,
    force: o.force,
    signal: o.signal,
    fetcher: async () => {
      try {
        const { data } = await api.get<{
          counts?: Record<string, number>;
          tasks?: unknown[];
          has_more?: boolean;
        }>('/work-tasks/team-project-tasks', {
          params: {
            page,
            page_size: pageSize,
            due_days: DUE_SOON_DAYS,
            ...(o.companyId ? { company_id: o.companyId } : {}),
            ...(o.assigneeId ? { assignee_id: o.assigneeId } : {}),
            ...(o.q?.trim() ? { q: o.q.trim() } : {}),
          },
        });
        const c = data?.counts || {};
        return {
          tasks: (Array.isArray(data?.tasks) ? data.tasks : [])
            .map((r) => mapRow(r as Record<string, unknown>))
            .filter((t) => t.id),
          counts: {
            overdue: Number(c.overdue) || 0,
            soon: Number(c.soon) || 0,
            total: Number(c.total) || 0,
            inProgress: Number(c.in_progress) || 0,
            groups: Number(c.groups) || 0,
          },
          hasMore: Boolean(data?.has_more),
          page,
        };
      } catch (e) {
        const status = (e as { response?: { status?: number } })?.response?.status;
        // 404 = máy chủ chưa deploy endpoint mới → dùng đường cũ (chỉ trang 1, đã gồm hết).
        if (status === 404 && page === 1) return fetchLegacy(o);
        if (status === 404) return { tasks: [], counts: { overdue: 0, soon: 0, total: 0, inProgress: 0, groups: 0 }, hasMore: false, page };
        throw e;
      }
    },
  });
}
