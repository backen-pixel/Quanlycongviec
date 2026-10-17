import { api } from '../api/client';
import { fetchThreadCommentsPage } from './commentApi';
import { commentSeenKey, getCommentSeenMap } from './commentSeen';
import { isSystemComment } from './commentUtils';
import { fetchDealIdForProject, fetchProjectTaskBootstrap } from './projectDetailApi';

/** Số id mỗi lần gọi chỉ mục (tránh URL quá dài). */
const CHUNK = 50;

/**
 * Luồng CHƯA từng mở trên máy này (chưa có mốc «đã xem»): chỉ tính bình luận trong khoảng này là «mới», nếu không mọi
 * đơn cũ đều hiện «20+ mới» ngay lần đầu dùng.
 */
const FIRST_SEEN_WINDOW_MS = 3 * 24 * 60 * 60 * 1000;

export type UnreadComments = {
  /** Số bình luận MỚI của người khác (không tính của mình, không tính nhật ký hệ thống). */
  count: number;
  /** Đã chạm mốc một trang (20) mà vẫn còn → hiển thị «20+». */
  more: boolean;
};

/**
 * Bình luận MỚI chưa xem của luồng «deal» từng dự án — deal gốc theo máy chủ (cùng cách chọn với tab «Bình luận»), mốc «đã xem» lưu
 * trên máy (`commentSeen`). Luồng không có bình luận / đã xem hết → không đưa vào kết quả. Lỗi mạng: bỏ qua phần lỗi, không ném.
 */
export async function fetchProjectUnreadComments(
  projectIds: string[],
  myUserId: string,
): Promise<Record<string, UnreadComments>> {
  const ids = [...new Set(projectIds.map(String).filter(Boolean))];
  if (!ids.length) return {};

  const leadOf = new Map<string, string>();
  await Promise.all(ids.map(async (pid) => {
    try {
      const boot = await fetchProjectTaskBootstrap(pid);
      const lead = boot?.leadId || (await fetchDealIdForProject(pid));
      if (lead) leadOf.set(pid, String(lead));
    } catch { /* bỏ qua dự án này */ }
  }));

  const leadIds = [...new Set(leadOf.values())];
  const index: Record<string, { count?: number; last_at?: string | null }> = {};
  for (let i = 0; i < leadIds.length; i += CHUNK) {
    const chunk = leadIds.slice(i, i + CHUNK);
    try {
      const { data } = await api.get<Record<string, { count?: number; last_at?: string | null }>>(
        '/crm/lead-comments/index',
        { params: { lead_ids: chunk.join(',') } },
      );
      if (data && typeof data === 'object') Object.assign(index, data);
    } catch { /* bỏ qua cụm lỗi */ }
  }

  const seen = await getCommentSeenMap();
  const now = Date.now();
  const byLead = new Map<string, UnreadComments>();

  await Promise.all(leadIds.map(async (lid) => {
    const entry = index[lid];
    if (!entry || !Number(entry.count || 0)) return;
    const seenAt = seen[commentSeenKey(lid)] || '';
    // Bình luận mới nhất của luồng đã nằm trong phần đã xem → không cần tải gì thêm.
    if (seenAt && entry.last_at && String(entry.last_at) <= seenAt) return;
    try {
      const page = await fetchThreadCommentsPage({ kind: 'lead', leadId: lid });
      const floor = seenAt || new Date(now - FIRST_SEEN_WINDOW_MS).toISOString();
      const fresh = page.rows.filter((c) =>
        String(c.created_at || '') > floor
        && String(c.user_id || '') !== myUserId
        && !isSystemComment(c.content));
      if (fresh.length) {
        // Cả trang đều mới và còn trang cũ hơn → có thể còn nhiều hơn số đếm được.
        byLead.set(lid, { count: fresh.length, more: page.hasMore && fresh.length === page.rows.length });
      }
    } catch { /* bỏ qua luồng này */ }
  }));

  const out: Record<string, UnreadComments> = {};
  for (const [pid, lid] of leadOf) {
    const u = byLead.get(lid);
    if (u) out[pid] = u;
  }
  return out;
}
