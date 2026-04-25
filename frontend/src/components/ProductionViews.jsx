import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { markWorkshopPipelineCardFocus } from '../lib/workshopPipelineStorage';

function formatVND(v) {
  if (!v) return '0đ';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(v);
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('vi-VN');
}

/** Danh sách dạng bảng — giống CRM ListView, điều hướng chi tiết xưởng */
export function ProductionListView({ pipeline, calculateDays }) {
  const navigate = useNavigate();
  const goProject = (projectId) => {
    markWorkshopPipelineCardFocus(projectId, 'sx');
    navigate(`/sx/projects/${projectId}`);
  };
  const allItems = pipeline.flatMap((s) => s.items.map((item) => ({ ...item, _stage: s })));
  if (!allItems.length) {
    return <p className="text-center text-gray-400 py-12 text-sm">Không có dự án xưởng</p>;
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
            <th className="px-4 py-3 font-medium">Mã</th>
            <th className="px-4 py-3 font-medium">Tên dự án</th>
            <th className="px-4 py-3 font-medium">Khách hàng</th>
            <th className="px-4 py-3 font-medium">Cột pipeline</th>
            <th className="px-4 py-3 font-medium text-right">Giá trị</th>
            <th className="px-4 py-3 font-medium">SX phụ trách</th>
            <th className="px-4 py-3 font-medium">Sale</th>
            <th className="px-4 py-3 font-medium">Deadline</th>
            <th className="px-4 py-3 font-medium">Ngày tạo</th>
            <th className="px-4 py-3 font-medium">Thời gian</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {allItems.map((item) => {
            const daysLabel = calculateDays(item.created_at);
            return (
              <tr
                key={item.id}
                onClick={() => goProject(item.id)}
                className="hover:bg-teal-50/60 cursor-pointer transition-colors"
              >
                <td className="px-4 py-2.5 text-teal-600 font-medium whitespace-nowrap">{item.code}</td>
                <td className="px-4 py-2.5 font-medium text-gray-900 max-w-[220px] truncate">{item.name}</td>
                <td className="px-4 py-2.5 text-gray-600">{item.customer?.full_name || '—'}</td>
                <td className="px-4 py-2.5">
                  <span
                    className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
                    style={{ backgroundColor: `${item._stage.color || '#0d9488'}20`, color: item._stage.color || '#0f766e' }}
                  >
                    {item._stage.icon} {item._stage.name}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right font-medium text-gray-900 whitespace-nowrap">
                  {Number(item.estimated_value) > 0 ? formatVND(item.estimated_value) : '—'}
                </td>
                <td className="px-4 py-2.5 text-gray-600 text-xs">{item.production_person?.full_name || '—'}</td>
                <td className="px-4 py-2.5 text-gray-500 text-xs">{item.sales_person?.full_name || '—'}</td>
                <td className="px-4 py-2.5 text-gray-400 text-xs whitespace-nowrap">{item.deadline ? formatDate(item.deadline) : '—'}</td>
                <td className="px-4 py-2.5 text-gray-400 text-xs whitespace-nowrap">{formatDate(item.created_at)}</td>
                <td className="px-4 py-2.5 text-xs whitespace-nowrap text-gray-600">{daysLabel}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500 flex justify-between border-t border-gray-100">
        <span>Tổng: {allItems.length} dự án</span>
        <span>GT: {formatVND(allItems.reduce((s, i) => s + (Number(i.estimated_value) || 0), 0))}</span>
      </div>
    </div>
  );
}

/** Calendar view — lịch tháng hiển thị production_deadline và deadline của dự án */
export function ProductionCalendarView({ pipeline }) {
  const navigate = useNavigate();
  const goProject = (projectId) => {
    markWorkshopPipelineCardFocus(projectId, 'sx');
    navigate(`/sx/projects/${projectId}`);
  };
  const allItems = useMemo(
    () => pipeline.flatMap((s) => s.items.map((item) => ({ ...item, _stage: s }))),
    [pipeline],
  );

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth()); // 0-indexed

  const prevMonth = () => {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  };

  // Build date → projects map (using production_deadline first, fallback to deadline)
  const dateMap = useMemo(() => {
    const map = {};
    allItems.forEach((item) => {
      const d = item.production_deadline || item.deadline;
      if (!d) return;
      const key = d.substring(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(item);
    });
    return map;
  }, [allItems]);

  // Build calendar grid
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay(); // 0=Sun
  const daysInMonth = lastDay.getDate();

  const cells = [];
  // Pad start
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  // Pad end to complete last row
  while (cells.length % 7 !== 0) cells.push(null);

  const monthNames = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];
  const dowLabels = ['CN','T2','T3','T4','T5','T6','T7'];

  const todayKey = today.toISOString().substring(0, 10);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
        <button onClick={prevMonth} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-200 cursor-pointer text-gray-600 font-bold text-lg">‹</button>
        <h3 className="text-base font-bold text-gray-900">{monthNames[month]} {year}</h3>
        <button onClick={nextMonth} className="h-8 w-8 flex items-center justify-center rounded-lg hover:bg-gray-200 cursor-pointer text-gray-600 font-bold text-lg">›</button>
      </div>

      {/* Day of week headers */}
      <div className="grid grid-cols-7 border-b border-gray-100">
        {dowLabels.map((d, i) => (
          <div key={d} className={`text-center text-xs font-semibold py-2 ${i === 0 ? 'text-red-400' : 'text-gray-500'}`}>{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (!day) {
            return <div key={`pad-${idx}`} className="min-h-[80px] bg-gray-50/50 border-b border-r border-gray-100" />;
          }
          const key = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          const items = dateMap[key] || [];
          const isToday = key === todayKey;
          const isPast = key < todayKey;
          const dow = (idx) % 7;
          return (
            <div key={key}
              className={`min-h-[80px] p-1.5 border-b border-r border-gray-100 ${isPast && items.length ? 'bg-red-50/30' : isToday ? 'bg-blue-50/40' : ''}`}>
              <div className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${
                isToday ? 'bg-blue-600 text-white' : dow === 0 ? 'text-red-500' : 'text-gray-600'
              }`}>{day}</div>
              <div className="space-y-0.5">
                {items.slice(0, 3).map((item) => {
                  const usePD = !!item.production_deadline;
                  const isOverdue = usePD
                    ? new Date(item.production_deadline) < today
                    : item.deadline && new Date(item.deadline) < today;
                  return (
                    <div
                      key={item.id}
                      onClick={() => goProject(item.id)}
                      title={`${item.code} — ${item.name}${usePD ? ' (Giao xưởng)' : ' (Deadline)'}`}
                      className={`truncate text-[10px] px-1.5 py-0.5 rounded cursor-pointer font-medium ${
                        isOverdue
                          ? 'bg-red-100 text-red-700 hover:bg-red-200'
                          : usePD
                          ? 'bg-sky-100 text-sky-700 hover:bg-sky-200'
                          : 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                      }`}
                    >
                      {item._stage.icon} {item.code || item.name}
                    </div>
                  );
                })}
                {items.length > 3 && (
                  <div className="text-[9px] text-gray-400 px-1.5">+{items.length - 3} nữa</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="px-4 py-2.5 bg-gray-50 border-t border-gray-100 flex items-center gap-4 text-[10px] text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-sky-100 inline-block" /> Ngày giao xưởng</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-purple-100 inline-block" /> Deadline tổng</span>
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 inline-block" /> Đã trễ</span>
        <span className="ml-auto">{allItems.filter(i => i.production_deadline || i.deadline).length} dự án có lịch</span>
      </div>
    </div>
  );
}

/** Planner theo người phụ trách sản xuất — giống CRM PlannerView */
export function ProductionPlannerView({ pipeline }) {
  const navigate = useNavigate();
  const goProject = (projectId) => {
    markWorkshopPipelineCardFocus(projectId, 'sx');
    navigate(`/sx/projects/${projectId}`);
  };
  const allItems = pipeline.flatMap((s) => s.items.map((item) => ({ ...item, _stage: s })));

  const groups = useMemo(() => {
    const map = {};
    const unassigned = [];
    allItems.forEach((item) => {
      const u = item.production_person;
      const uid = u?.id;
      if (uid && u) {
        if (!map[uid]) map[uid] = { user: u, items: [], totalValue: 0 };
        map[uid].items.push(item);
        map[uid].totalValue += Number(item.estimated_value) || 0;
      } else {
        unassigned.push(item);
      }
    });
    return { assignees: Object.values(map).sort((a, b) => b.items.length - a.items.length), unassigned };
  }, [allItems]);

  if (!allItems.length) {
    return <p className="text-center text-gray-400 py-12 text-sm">Không có dự án xưởng</p>;
  }

  const renderCard = (item) => (
    <div
      key={item.id}
      onClick={() => goProject(item.id)}
      className="bg-white rounded-lg border border-gray-200 p-3 hover:shadow-md transition-all cursor-pointer group"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-teal-600 font-medium">{item.code}</p>
          <p className="text-sm font-medium text-gray-900 truncate mt-0.5">{item.name}</p>
          {item.customer?.full_name && <p className="text-xs text-gray-500 mt-0.5">{item.customer.full_name}</p>}
        </div>
        <span
          className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0"
          style={{ backgroundColor: `${item._stage.color || '#0d9488'}20`, color: item._stage.color || '#0f766e' }}
        >
          {item._stage.icon} {item._stage.name}
        </span>
      </div>
      {Number(item.estimated_value) > 0 && (
        <p className="text-xs font-bold text-gray-900 mt-2">{formatVND(item.estimated_value)}</p>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      {groups.assignees.map((group) => (
        <div key={group.user.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-50 border-b border-gray-100">
            <div className="h-8 w-8 rounded-full bg-teal-600 flex items-center justify-center text-white text-xs font-bold">
              {group.user.full_name?.charAt(0) || '?'}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{group.user.full_name}</p>
              <p className="text-[10px] text-gray-500">
                {group.items.length} dự án • {formatVND(group.totalValue)}
              </p>
            </div>
          </div>
          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {group.items.map((item) => renderCard(item))}
          </div>
        </div>
      ))}
      {groups.unassigned.length > 0 && (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-500">Chưa gán SX ({groups.unassigned.length})</p>
          </div>
          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {groups.unassigned.map((item) => renderCard(item))}
          </div>
        </div>
      )}
    </div>
  );
}
