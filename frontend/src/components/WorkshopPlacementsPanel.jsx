import { Link } from 'react-router-dom';
import { ArrowRight, Factory, Users } from 'lucide-react';
import { formatDate } from '../lib/utils';

function sxHref(projectId) {
  return `/sx/projects/${projectId}`;
}

function wuHref(projectId) {
  return `/management/work-unified/${projectId}`;
}

/**
 * Danh sách xưởng đã đặt / nhận đặt — dùng trên chi tiết SX và Work Unified.
 */
export default function WorkshopPlacementsPanel({
  placed = [],
  receivedFrom = [],
  panelRef = null,
  onOpenComments = null,
  highlightIds = null,
  compact = false,
}) {
  const placedList = Array.isArray(placed) ? placed : [];
  const receivedList = Array.isArray(receivedFrom) ? receivedFrom : [];
  if (!placedList.length && !receivedList.length) return null;

  const hi = new Set((highlightIds || []).map(String).filter(Boolean));

  return (
    <div
      ref={panelRef}
      id="workshop-placements"
      className={`bg-white rounded-xl border p-4 space-y-3 ${compact ? '' : 'shadow-sm'}`}
    >
      <div>
        <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
          <Factory className="h-4 w-4 text-indigo-600" /> Xưởng gia công
        </h3>
        <p className="text-[11px] text-gray-500 mt-0.5 leading-snug">
          Đơn này đã gửi sang xưởng khác sản xuất. Bấm «Tới dự án xưởng» để mở bảng của xưởng đó.
        </p>
      </div>
      {placedList.length > 0 && (
        <div>
          <p className="text-[11px] text-indigo-700 font-semibold mb-1.5">
            Đã gửi sang {placedList.length} xưởng
          </p>
          <ul className="space-y-2">
            {placedList.map((row) => {
              const co = row.target_company || { name: row.company_name, short_name: row.company_name };
              const wt = row.workshop_type;
              const tp = row.target_project || { code: row.project_code, name: row.project_name };
              const pid = row.target_project_id || row.project_id;
              const staff = Array.isArray(row.staff) ? row.staff : [];
              const lit = hi.has(String(pid));
              const coName = co?.short_name || co?.name || 'Xưởng';
              const typeName = wt?.name || row.workshop_type_name || '';
              return (
                <li
                  key={row.id || pid}
                  className={`rounded-lg border px-2.5 py-2 text-xs ${
                    lit ? 'border-emerald-300 bg-emerald-50 ring-1 ring-emerald-200' : 'border-indigo-100 bg-indigo-50/40'
                  }`}
                >
                  <p className="font-semibold text-indigo-950">
                    {coName}{typeName ? ` · ${typeName}` : ''}
                  </p>
                  <p className="text-gray-600 mt-0.5">
                    Mã dự án xưởng: <span className="font-medium text-gray-800">{tp?.code || '—'}</span>
                  </p>
                  {(row.delivery_date || row.production_finish_date) && (
                    <p className="text-gray-500 mt-0.5">
                      {row.delivery_date ? `Lắp ${formatDate(row.delivery_date)}` : ''}
                      {row.delivery_date && row.production_finish_date ? ' · ' : ''}
                      {row.production_finish_date ? `Hoàn thiện ${formatDate(row.production_finish_date)}` : ''}
                    </p>
                  )}
                  {staff.length > 0 && (
                    <p className="text-indigo-700/90 mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
                      <Users className="h-3 w-3 shrink-0" />
                      {staff.map((u) => u.full_name || 'NV').join(', ')}
                    </p>
                  )}
                  {pid && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <Link
                        to={sxHref(pid)}
                        className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-semibold"
                      >
                        Tới dự án xưởng
                        <ArrowRight className="h-3 w-3" />
                      </Link>
                      <Link
                        to={wuHref(pid)}
                        className="inline-flex items-center h-7 px-2.5 rounded-md border border-indigo-200 bg-white text-indigo-800 text-[11px] font-medium hover:bg-indigo-50"
                      >
                        Work Unified
                      </Link>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {receivedList.length > 0 && (
        <div>
          <p className="text-[11px] text-amber-800 font-semibold mb-1.5">Đơn nhận từ xưởng khác</p>
          <ul className="space-y-1.5">
            {receivedList.map((row) => {
              const co = row.source_company || row.source_project?.company;
              const sp = row.source_project;
              return (
                <li key={row.id} className="rounded-lg border border-amber-100 bg-amber-50/50 px-2.5 py-2 text-xs">
                  <p className="font-semibold text-amber-950">
                    {co?.short_name || co?.name || 'Xưởng nguồn'}
                  </p>
                  {sp?.code && (
                    <p className="text-gray-600 mt-0.5">Mã đơn gốc: {sp.code}</p>
                  )}
                  {sp?.name && <p className="text-gray-600 mt-0.5 truncate">{sp.name}</p>}
                  {row.source_project_id && (
                    <Link
                      to={sxHref(row.source_project_id)}
                      className="mt-2 inline-flex items-center gap-1 h-7 px-2.5 rounded-md bg-amber-700 hover:bg-amber-800 text-white text-[11px] font-semibold"
                    >
                      Tới dự án nguồn
                      <ArrowRight className="h-3 w-3" />
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {onOpenComments && placedList.length > 0 && (
        <button
          type="button"
          onClick={onOpenComments}
          className="w-full text-[11px] text-indigo-700 hover:text-indigo-900 font-medium text-left cursor-pointer"
        >
          Xem bình luận thông báo →
        </button>
      )}
    </div>
  );
}

export function WorkshopPlaceSuccessBanner({ notice, onDismiss }) {
  if (!notice?.created?.length) return null;
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm text-emerald-950 flex items-start gap-2">
      <Factory className="h-4 w-4 text-emerald-700 mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">Đã gửi đơn sang xưởng gia công</p>
        <ul className="mt-1.5 space-y-1.5">
          {notice.created.map((row) => {
            const pid = row.project_id || row.target_project_id;
            const label = [
              row.company_name || row.target_company?.short_name || row.target_company?.name,
              row.workshop_type_name || row.workshop_type?.name,
              row.project_code || row.target_project?.code,
            ].filter(Boolean).join(' · ');
            return (
              <li key={pid || row.id} className="flex flex-wrap items-center gap-2">
                <span>{label || 'Dự án xưởng'}</span>
                {pid && (
                  <Link
                    to={sxHref(pid)}
                    className="inline-flex items-center gap-1 h-7 px-2.5 rounded-md bg-emerald-700 hover:bg-emerald-800 text-white text-[11px] font-semibold"
                  >
                    Tới dự án xưởng
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                )}
              </li>
            );
          })}
        </ul>
        {notice.partial && Array.isArray(notice.errors) && notice.errors.length > 0 && (
          <p className="text-xs text-amber-800 mt-1">
            Một số dòng lỗi: {notice.errors.map((e) => e.error).filter(Boolean).join('; ')}
          </p>
        )}
        <p className="text-[11px] text-emerald-800/80 mt-1">Danh sách đầy đủ ở khối «Xưởng gia công» bên cạnh.</p>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="text-xs font-semibold text-emerald-800 hover:underline cursor-pointer shrink-0"
        >
          Đóng
        </button>
      )}
    </div>
  );
}
