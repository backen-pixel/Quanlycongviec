import { vnDayKey, vnTodayYmd, vnAddDaysYmd } from './vnDate';

export type ListDateSectionKey = string;

/** Nhóm ngày giống list CRM: Hôm nay / Hôm qua / Tuần này / Tháng này / tháng-năm.
 * Dùng lịch VN (khớp bộ lọc date_from/date_to API) — không dùng timezone máy. */
export function listDateSectionLabel(iso?: string | null): ListDateSectionKey {
  if (!iso) return 'Không rõ ngày';
  const ymd = vnDayKey(iso);
  if (!ymd) return 'Không rõ ngày';

  const today = vnTodayYmd();
  if (ymd === today) return 'Hôm nay';

  const yesterday = vnAddDaysYmd(today, -1);
  if (yesterday && ymd === yesterday) return 'Hôm qua';

  const [ty, tm, td] = today.split('-').map(Number);
  const dayOfWeek = new Date(Date.UTC(ty, tm - 1, td)).getUTCDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = vnAddDaysYmd(today, mondayOffset);
  const sunday = monday ? vnAddDaysYmd(monday, 6) : null;
  if (monday && sunday && ymd >= monday && ymd <= sunday) return 'Tuần này';

  const thisMonthPrefix = today.slice(0, 7);
  if (ymd.startsWith(thisMonthPrefix)) return 'Tháng này';

  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Không rõ ngày';
  return d.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' });
}

export function listDateSectionOrder(label: string): number {
  const rank: Record<string, number> = {
    'Hôm nay': 0,
    'Hôm qua': 1,
    'Tuần này': 2,
    'Tháng này': 3,
    'Không rõ ngày': 9999,
  };
  if (label in rank) return rank[label];
  return 100;
}

export function formatListCardDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}
