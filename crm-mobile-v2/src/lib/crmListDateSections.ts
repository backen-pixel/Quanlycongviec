import { vnTodayYmd, ymdFromLocalDate } from './vnDate';

export type ListDateSectionKey = string;

/** Nhóm ngày giống list CRM: Hôm nay / Hôm qua / Tuần này / Tháng này / tháng-năm. */
export function listDateSectionLabel(iso?: string | null): ListDateSectionKey {
  if (!iso) return 'Không rõ ngày';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return 'Không rõ ngày';

  const ymd = ymdFromLocalDate(d);
  const today = vnTodayYmd();
  if (ymd === today) return 'Hôm nay';

  const [ty, tm, td] = today.split('-').map(Number);
  const yesterday = new Date(ty, tm - 1, td);
  yesterday.setDate(yesterday.getDate() - 1);
  if (ymd === ymdFromLocalDate(yesterday)) return 'Hôm qua';

  const dayOfWeek = new Date(ty, tm - 1, td).getDay();
  const monday = new Date(ty, tm - 1, td);
  monday.setDate(td - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  if (ymd >= ymdFromLocalDate(monday) && ymd <= ymdFromLocalDate(sunday)) return 'Tuần này';

  const thisMonthPrefix = today.slice(0, 7);
  if (ymd.startsWith(thisMonthPrefix)) return 'Tháng này';

  return d.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' });
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
