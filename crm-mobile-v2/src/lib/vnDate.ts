/** Lịch Việt Nam (Asia/Ho_Chi_Minh) — date_from/date_to gửi API, khớp backend. */
export const VN_TZ = 'Asia/Ho_Chi_Minh';

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

export function vnTodayYmd(at: Date = new Date()): string {
  return at.toLocaleDateString('en-CA', { timeZone: VN_TZ });
}

export function vnDayKey(isoOrDate?: string | Date | null): string | null {
  if (isoOrDate == null || isoOrDate === '') return null;
  const t = new Date(isoOrDate).getTime();
  if (!Number.isFinite(t)) return null;
  return new Date(t).toLocaleDateString('en-CA', { timeZone: VN_TZ });
}

export function vnAddDaysYmd(ymd: string, deltaDays: number): string | null {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const dt = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  dt.setUTCDate(dt.getUTCDate() + Number(deltaDays || 0));
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())}`;
}

/** Format Date → YMD local parts — không dùng toISOString (lệch UTC+7). */
export function ymdFromLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function vnDefaultMonthRange(ref: Date = new Date()): { from: string; to: string } {
  const today = vnTodayYmd(ref);
  const [y, m] = today.split('-').map(Number);
  const from = `${y}-${pad2(m)}-01`;
  const last = new Date(Date.UTC(y, m, 0));
  const to = `${last.getUTCFullYear()}-${pad2(last.getUTCMonth() + 1)}-${pad2(last.getUTCDate())}`;
  return { from, to };
}

/** Hạn SLA cột — khớp backend endOfCalendarDayAfterEntered. */
export function endOfVnCalendarDayAfterEntered(startIso: string | null | undefined, slaDays: number): Date {
  const days = Math.max(1, Number(slaDays) || 1);
  const enteredYmd = vnDayKey(startIso || new Date()) || vnTodayYmd();
  const dueYmd = vnAddDaysYmd(enteredYmd, days)!;
  return new Date(`${dueYmd}T23:59:59.999+07:00`);
}
