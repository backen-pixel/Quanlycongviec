import { AlertTriangle, Clock } from 'lucide-react';
import {
  FB_PAGE_TOKEN_REMINDER_DAYS,
  computeFacebookPageTokenReminder,
} from '../lib/facebookPageTokenReminder';

function formatViDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' });
  } catch {
    return '—';
  }
}

/** Một Page — dòng nhắc token (dùng trong danh sách cài đặt). */
export function FacebookPageTokenReminderRow({ page, onEdit }) {
  const tr =
    page?.token_reminder ||
    computeFacebookPageTokenReminder(
      page?.settings_updated_at || page?.updated_at || page?.created_at,
    );
  if (tr.status === 'ok' || tr.status === 'unknown') return null;

  const due = tr.status === 'due';
  const box = due
    ? 'bg-red-50 border-red-200 text-red-900'
    : 'bg-amber-50 border-amber-200 text-amber-900';

  return (
    <div
      className={`mt-3 rounded-lg border px-3 py-2 text-xs flex flex-wrap items-start gap-2 ${box}`}
    >
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-[12rem]">
        {due ? (
          <p className="font-semibold">
            Đã quá {FB_PAGE_TOKEN_REMINDER_DAYS} ngày — cần cập nhật Access Token Page này.
          </p>
        ) : (
          <p className="font-semibold">
            Còn <strong>{tr.days_remaining}</strong> ngày đến hạn làm mới token ({FB_PAGE_TOKEN_REMINDER_DAYS} ngày).
          </p>
        )}
        <p className="mt-0.5 opacity-90">
          Cập nhật cài đặt lần cuối: {formatViDate(tr.anchor_at)} · Hạn: {formatViDate(tr.due_at)}
        </p>
      </div>
      {typeof onEdit === 'function' && (
        <button
          type="button"
          onClick={onEdit}
          className="shrink-0 text-xs font-semibold px-2.5 py-1 rounded-md bg-white/80 border border-current/20 hover:bg-white cursor-pointer"
        >
          Cập nhật token
        </button>
      )}
    </div>
  );
}

/** Tổng hợp nhiều Page — banner trên module Facebook / tab Cài đặt. */
export default function FacebookPageTokenReminderBanner({
  pages,
  summary,
  compact,
  onGoSettings,
}) {
  const dueList = summary?.due_pages?.length
    ? summary.due_pages
    : (pages || []).filter((p) => (p.token_reminder || {}).status === 'due');
  const warnList = summary?.warning_pages?.length
    ? summary.warning_pages
    : (pages || []).filter((p) => (p.token_reminder || {}).status === 'warning');

  if (!dueList.length && !warnList.length) return null;

  const names = (list) =>
    list
      .map((p) => p.page_name || p.page_id)
      .slice(0, 4)
      .join(', ') + (list.length > 4 ? ` +${list.length - 4}` : '');

  return (
    <div
      className={`rounded-xl border flex flex-wrap items-start gap-3 ${
        dueList.length
          ? 'bg-red-50 border-red-200 text-red-900'
          : 'bg-amber-50 border-amber-200 text-amber-900'
      } ${compact ? 'px-3 py-2 mx-6 mt-2' : 'p-4 mb-4'}`}
      role="alert"
    >
      <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-[14rem] text-sm">
        {dueList.length > 0 && (
          <p className="font-semibold">
            {dueList.length} Page FB cần làm mới Access Token (quá {FB_PAGE_TOKEN_REMINDER_DAYS} ngày kể từ lần cập nhật cài đặt).
            {!compact && <span className="font-normal block mt-0.5">Page: {names(dueList)}</span>}
          </p>
        )}
        {warnList.length > 0 && (
          <p className={`${dueList.length ? 'mt-1 text-xs' : 'font-semibold'}`}>
            {warnList.length} Page sắp đến hạn ({names(warnList)}).
          </p>
        )}
        <p className="text-xs mt-1 flex items-center gap-1 opacity-90">
          <Clock className="h-3.5 w-3.5" />
          Vào tab Cài đặt → Sửa Page → dán token mới từ Meta Developer.
        </p>
      </div>
      {typeof onGoSettings === 'function' && (
        <button
          type="button"
          onClick={onGoSettings}
          className="shrink-0 text-xs font-semibold px-3 py-1.5 rounded-lg bg-white border border-current/25 hover:shadow-sm cursor-pointer"
        >
          Mở cài đặt
        </button>
      )}
    </div>
  );
}
