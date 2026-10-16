import { api } from '../api/client';
import { QUERY_TTL_SHORT, cachedQuery } from './queryCache';
import { vnYmd } from './vnDate';

/**
 * Nhiệm vụ QUÁ HẠN và đến hạn HÔM NAY — cùng nguồn và cùng cách chia nhóm với Kanban/Hạn của trang web «Quản lý nhiệm vụ Sản xuất».
 *
 * Nguồn: `GET /work-tasks/project-overview?module=sx` — mỗi dòng là một NHIỆM VỤ (danh mục) của một đơn, có số việc con
 * (`child_total`, `child_completed`) và hạn của nhiệm vụ. Máy chủ tự khoá phạm vi xưởng: không phải admin hệ thống thì luôn
 * chỉ trả xưởng của tài khoản (bất kể `company_id` gửi lên); admin hệ thống thấy mọi xưởng.
 *
 * Quy tắc quá hạn khớp web (`deadlineBucketOf`): ngày lịch VN của hạn < hôm nay, hoặc hạn là hôm nay nhưng đã quá 17:30 (giờ VN).
 */
const K_OVERDUE = 'sx:workTasks:overdue-cards:';

/**
 * NextGo đã tách sang hệ sinh thái riêng → không hiện ở màn quá hạn của xưởng. Có hai bản ghi công ty NextGo (hai tenant) nên
 * loại theo cả mã công ty lẫn tên, phòng khi có bản ghi thứ ba cùng tên.
 */
const NEXTGO_COMPANY_IDS = new Set([
  '842cff41-0f8b-4cee-b7ec-d78ce27e7308',
  '87479a83-1145-43b7-b090-3e40812cb5a9',
]);

function isNextGoCompany(companyId: string | null, companyName: string | null): boolean {
  if (companyId && NEXTGO_COMPANY_IDS.has(companyId)) return true;
  return /nextgo/i.test(companyName || '');
}

/** Mốc hết ngày làm việc (giờ VN) — khớp `DEFAULT_CLOCK` / HCB của backend & web. */
const WORK_END_HM = '17:30:00+07:00';

export type OverdueCard = {
  /** `overdue` = đã quá hạn; `today` = hạn là hôm nay và chưa quá 17:30 (cùng cách chia nhóm «Quá hạn» / «Hôm nay» của web). */
  kind: 'overdue' | 'today';
  id: string;
  projectId: string;
  projectCode: string;
  projectName: string;
  /** Tên nhiệm vụ (danh mục), vd. «Sản xuất kiểm tra chéo đặt kính». */
  title: string;
  deadline: string;
  childTotal: number;
  childCompleted: number;
  assigneeName: string | null;
  companyId: string | null;
  companyName: string | null;
};

/** Một việc con bên trong nhiệm vụ (thẻ). */
export type CardChild = {
  id: string;
  title: string;
  status: string;
  deadline: string | null;
  /** Đã xong theo cùng quy tắc đếm `child_completed` của thẻ. */
  done: boolean;
  assigneeName: string | null;
};

export type OverdueCardsResult = {
  cards: OverdueCard[];
  /** Số nhiệm vụ quá hạn do máy chủ đếm (`stats.overdue`) — để đối chiếu, không dùng để hiển thị. */
  serverOverdue: number;
};

/** Hạn đã quá theo quy tắc của web. */
export function isCardOverdue(deadlineIso: string | null | undefined, nowMs: number = Date.now()): boolean {
  if (!deadlineIso) return false;
  const ms = new Date(deadlineIso).getTime();
  if (!Number.isFinite(ms)) return false;
  const dueYmd = vnYmd(ms);
  const todayYmd = vnYmd(nowMs);
  if (dueYmd < todayYmd) return true;
  if (dueYmd === todayYmd) return nowMs > new Date(`${todayYmd}T${WORK_END_HM}`).getTime();
  return false;
}

/** Hạn là hôm nay (ngày lịch VN) và chưa quá mốc 17:30 — nhóm «Hôm nay» của web. */
export function isCardDueToday(deadlineIso: string | null | undefined, nowMs: number = Date.now()): boolean {
  if (!deadlineIso) return false;
  const ms = new Date(deadlineIso).getTime();
  if (!Number.isFinite(ms)) return false;
  return vnYmd(ms) === vnYmd(nowMs) && !isCardOverdue(deadlineIso, nowMs);
}

/** Số ngày lịch VN từ hạn tới hôm nay (0 = hạn hôm nay nhưng đã quá 17:30). */
export function cardDaysOverdue(deadlineIso: string, nowMs: number = Date.now()): number {
  const ms = new Date(deadlineIso).getTime();
  if (!Number.isFinite(ms)) return 0;
  const a = Date.parse(`${vnYmd(ms)}T00:00:00Z`);
  const b = Date.parse(`${vnYmd(nowMs)}T00:00:00Z`);
  return Math.max(0, Math.round((b - a) / 86_400_000));
}

function str(v: unknown): string | null {
  return v != null && String(v).trim() !== '' ? String(v).trim() : null;
}

/**
 * Việc con của MỌI nhiệm vụ trong một đơn: `project-overview?project_id=…&include_children=1`. Trả Map `id thẻ` → danh sách
 * việc con. Máy chủ cũ chưa có `include_children` sẽ không trả `children` → thẻ đó không có trong Map (màn hình báo «chưa hỗ trợ»).
 */
export async function fetchProjectCardChildren(
  projectId: string,
  opts?: { force?: boolean; signal?: AbortSignal },
): Promise<Map<string, CardChild[]>> {
  const entries = await cachedQuery<Array<[string, CardChild[]]>>({
    key: `${K_OVERDUE}children:${projectId}`,
    ttlMs: QUERY_TTL_SHORT,
    force: opts?.force,
    signal: opts?.signal,
    fetcher: async () => {
      const { data } = await api.get<{ tasks?: unknown[] }>('/work-tasks/project-overview', {
        params: { module: 'sx', project_id: projectId, include_children: 1 },
        signal: opts?.signal,
      });
      const out: Array<[string, CardChild[]]> = [];
      for (const r of (Array.isArray(data?.tasks) ? data.tasks : []) as Record<string, unknown>[]) {
        const id = str(r.unified_id) || str(r.source_id);
        if (!id || !Array.isArray(r.children)) continue;
        out.push([id, (r.children as Record<string, unknown>[]).map((c) => ({
          id: str(c.unified_id) || str(c.source_id) || `${id}:${str(c.title) || ''}`,
          title: str(c.title) || 'Công việc',
          status: str(c.status) || 'pending',
          deadline: str(c.deadline),
          done: Boolean(c.done),
          assigneeName: str(c.assignee_name),
        }))]);
      }
      return out;
    },
  });
  return new Map(entries);
}

export async function fetchOverdueCards(opts?: { force?: boolean; signal?: AbortSignal }): Promise<OverdueCardsResult> {
  return cachedQuery<OverdueCardsResult>({
    key: `${K_OVERDUE}sx`,
    ttlMs: QUERY_TTL_SHORT,
    force: opts?.force,
    signal: opts?.signal,
    fetcher: async () => {
      const { data } = await api.get<{ tasks?: unknown[]; stats?: { overdue?: number } }>('/work-tasks/project-overview', {
        params: { module: 'sx' },
        signal: opts?.signal,
      });
      const nowMs = Date.now();
      const rows = Array.isArray(data?.tasks) ? data.tasks : [];
      const cards: OverdueCard[] = [];
      for (const r of rows as Record<string, unknown>[]) {
        const deadline = str(r.deadline);
        if (!deadline) continue;
        const kind: OverdueCard['kind'] | null = isCardOverdue(deadline, nowMs)
          ? 'overdue'
          : (isCardDueToday(deadline, nowMs) ? 'today' : null);
        if (!kind) continue;
        const id = str(r.unified_id) || str(r.source_id);
        if (!id) continue;
        if (isNextGoCompany(str(r.company_id), str(r.company_name))) continue;
        cards.push({
          kind,
          id,
          projectId: str(r.project_id) || '',
          projectCode: str(r.project_code) || '',
          projectName: str(r.project_name) || str(r.lead_title) || '',
          title: str(r.title) || 'Nhiệm vụ',
          deadline,
          childTotal: Number(r.child_total) || 0,
          childCompleted: Number(r.child_completed) || 0,
          assigneeName: str(r.effective_assignee_name) || str(r.assignee_name) || str(r.module_owner_name),
          companyId: str(r.company_id),
          companyName: str(r.company_name),
        });
      }
      return { cards, serverOverdue: Number(data?.stats?.overdue) || 0 };
    },
  });
}
