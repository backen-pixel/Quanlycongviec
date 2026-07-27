/** Store số Lead/Deal quá hạn (cột Deadline) — dùng badge tab + nhắc local. */

export type DeadlineOverdueBreakdown = {
  lead: number;
  deal: number;
  total: number;
  at: number;
  /** 'screen' = từ DeadlineScreen; 'fetch' = quét nền/API. */
  source: 'screen' | 'fetch';
  /** Dữ liệu chưa tải đủ → số chỉ là cận dưới, không chặn lượt quét chính xác. */
  partial?: boolean;
};

type Listener = (next: DeadlineOverdueBreakdown | null) => void;

let current: DeadlineOverdueBreakdown | null = null;
const listeners = new Set<Listener>();

export function getDeadlineOverdueBreakdown(): DeadlineOverdueBreakdown | null {
  return current;
}

export function getDeadlineOverdueTotal(): number {
  return current?.total ?? 0;
}

export function setDeadlineOverdueBreakdown(next: DeadlineOverdueBreakdown | null): void {
  current = next;
  for (const fn of listeners) {
    try {
      fn(next);
    } catch {
      /* bỏ qua */
    }
  }
}

export function publishDeadlineOverdueFromItems(
  leads: { overdue?: boolean }[],
  deals: { overdue?: boolean }[],
  opts?: { partial?: boolean },
): void {
  publishDeadlineOverdueCounts(
    leads.reduce((n, i) => n + (i.overdue ? 1 : 0), 0),
    deals.reduce((n, i) => n + (i.overdue ? 1 : 0), 0),
    opts,
  );
}

/** Số quá hạn đã đếm sẵn (badge cột Deadline) — không cần duyệt lại danh sách. */
export function publishDeadlineOverdueCounts(
  lead: number,
  deal: number,
  opts?: { partial?: boolean },
): void {
  const next: DeadlineOverdueBreakdown = {
    lead,
    deal,
    total: lead + deal,
    at: Date.now(),
    source: 'screen',
    partial: !!opts?.partial,
  };
  const prev = current;

  // First-paint / drain chưa đủ → chỉ nhận số tăng (cận dưới).
  // Tránh ghi đè badge đúng từ quét API bằng số thấp tạm thời (phải reload mới đúng).
  if (next.partial && prev && prev.total > next.total) {
    current = { ...prev, at: next.at, partial: true };
    return;
  }

  if (
    prev
    && prev.lead === next.lead
    && prev.deal === next.deal
    && !!prev.partial === !!next.partial
  ) {
    current = { ...prev, at: next.at };
    return;
  }
  setDeadlineOverdueBreakdown(next);
}

export function clearDeadlineOverdueBreakdown(): void {
  setDeadlineOverdueBreakdown(null);
}

export function subscribeDeadlineOverdue(fn: Listener): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Cache còn mới — tránh quét API nặng trùng với DeadlineScreen. */
export function isDeadlineOverdueFresh(maxAgeMs = 90_000): boolean {
  if (!current) return false;
  // Số tạm (chưa tải đủ Lead/Deal) không được chặn lượt quét chính xác.
  if (current.partial) return false;
  return Date.now() - current.at < maxAgeMs;
}
