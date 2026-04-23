import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatVND, formatDate } from '../lib/utils';

// ─── List View ───────────────────────────────────────────────────────────────
export function LogisticsListView({ pipeline, calculateDays }) {
  const navigate = useNavigate();
  const allProjects = pipeline?.flatMap((s) => s.items.map((p) => ({ ...p, _stageName: s.name, _stageColor: s.color }))) || [];

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b">
          <tr>
            {['Mã', 'Tên dự án', 'Khách hàng', 'Giai đoạn VC', 'Giá trị', 'Phụ trách VC', 'Deadline', 'Thời gian'].map((h) => (
              <th key={h} className="text-left text-xs font-semibold text-gray-500 px-4 py-3 whitespace-nowrap">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {allProjects.length === 0 ? (
            <tr><td colSpan={8} className="text-center text-gray-400 py-12 text-sm">Không có dự án nào</td></tr>
          ) : (
            allProjects.map((p) => (
              <tr key={p.id} onClick={() => navigate(`/vc/projects/${p.id}`)}
                className="border-b last:border-b-0 hover:bg-orange-50 cursor-pointer transition-colors">
                <td className="px-4 py-3">
                  <span className="text-xs font-mono font-semibold text-orange-600">{p.code}</span>
                </td>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-900 truncate max-w-[200px]">{p.name}</p>
                </td>
                <td className="px-4 py-3">
                  <p className="text-gray-600 truncate max-w-[150px]">{p.customer?.full_name || '—'}</p>
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold"
                    style={{ backgroundColor: `${p._stageColor || '#f97316'}20`, color: p._stageColor || '#f97316' }}>
                    {p._stageName}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <span className="font-semibold text-emerald-600">{formatVND(p.estimated_value)}</span>
                </td>
                <td className="px-4 py-3">
                  <span className="text-gray-600">{p.logistics_person?.full_name || p.production_person?.full_name || '—'}</span>
                </td>
                <td className="px-4 py-3">
                  {p.deadline ? (
                    <span className={`text-xs px-2 py-1 rounded font-medium ${new Date(p.deadline) < new Date() ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'}`}>
                      {formatDate(p.deadline)}
                    </span>
                  ) : <span className="text-gray-400">—</span>}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs text-gray-500">{calculateDays?.(p.created_at) || '—'}</span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── Planner View (nhóm theo người phụ trách VC) ────────────────────────────
export function LogisticsPlannerView({ pipeline }) {
  const navigate = useNavigate();
  const allProjects = pipeline?.flatMap((s) => s.items.map((p) => ({ ...p, _stageName: s.name, _stageColor: s.color }))) || [];

  const byPerson = {};
  allProjects.forEach((p) => {
    const key = p.logistics_person?.full_name || p.production_person?.full_name || '__unassigned';
    const label = p.logistics_person?.full_name || p.production_person?.full_name || '(Chưa phân công)';
    if (!byPerson[key]) byPerson[key] = { label, projects: [], value: 0 };
    byPerson[key].projects.push(p);
    byPerson[key].value += Number(p.estimated_value) || 0;
  });

  const groups = Object.values(byPerson).sort((a, b) => {
    if (a.label === '(Chưa phân công)') return 1;
    if (b.label === '(Chưa phân công)') return -1;
    return a.label.localeCompare(b.label);
  });

  return (
    <div className="space-y-4">
      {groups.length === 0 ? (
        <div className="text-center text-gray-400 py-12">Không có dự án</div>
      ) : (
        groups.map((g) => (
          <div key={g.label} className="bg-white rounded-xl border overflow-hidden">
            <div className="px-4 py-3 bg-orange-50 border-b flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-orange-600 text-white flex items-center justify-center text-xs font-bold">
                  {g.label === '(Chưa phân công)' ? '?' : g.label.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2)}
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">{g.label}</p>
                  <p className="text-xs text-gray-500">{g.projects.length} dự án · {formatVND(g.value)}</p>
                </div>
              </div>
            </div>
            <div className="p-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {g.projects.map((p) => (
                <div key={p.id} onClick={() => navigate(`/vc/projects/${p.id}`)}
                  className="border rounded-lg p-3 cursor-pointer hover:shadow-md transition-shadow hover:-translate-y-0.5"
                  style={{ borderLeft: `3px solid ${p._stageColor || '#f97316'}` }}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-mono font-semibold text-orange-600">{p.code}</span>
                    {p.estimated_value > 0 && <span className="text-xs font-bold text-emerald-600">{formatVND(p.estimated_value)}</span>}
                  </div>
                  <p className="text-sm font-medium text-gray-900 truncate mb-1">{p.name}</p>
                  <p className="text-xs text-gray-500 truncate">{p.customer?.full_name}</p>
                  <div className="mt-2">
                    <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold"
                      style={{ backgroundColor: `${p._stageColor}20`, color: p._stageColor }}>
                      {p._stageName}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ─── Calendar View (xem theo deadline) ──────────────────────────────────────
export function LogisticsCalendarView({ pipeline }) {
  const navigate = useNavigate();
  const allProjects = pipeline?.flatMap((s) => s.items.map((p) => ({ ...p, _stageColor: s.color, _stageName: s.name }))) || [];
  const today = new Date();
  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDay = new Date(currentYear, currentMonth, 1).getDay();

  const projectsByDate = {};
  allProjects.forEach((p) => {
    const d = p.deadline;
    if (!d) return;
    const dt = new Date(d);
    if (dt.getFullYear() === currentYear && dt.getMonth() === currentMonth) {
      const key = dt.getDate();
      if (!projectsByDate[key]) projectsByDate[key] = [];
      projectsByDate[key].push(p);
    }
  });

  const monthNames = ['Tháng 1','Tháng 2','Tháng 3','Tháng 4','Tháng 5','Tháng 6','Tháng 7','Tháng 8','Tháng 9','Tháng 10','Tháng 11','Tháng 12'];
  const dayNames = ['CN','T2','T3','T4','T5','T6','T7'];

  const prevMonth = () => { if (currentMonth === 0) { setCurrentMonth(11); setCurrentYear(y => y - 1); } else setCurrentMonth(m => m - 1); };
  const nextMonth = () => { if (currentMonth === 11) { setCurrentMonth(0); setCurrentYear(y => y + 1); } else setCurrentMonth(m => m + 1); };

  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const todayDate = today.getDate();
  const isCurrentMonthYear = today.getMonth() === currentMonth && today.getFullYear() === currentYear;

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b bg-orange-50">
        <button onClick={prevMonth} className="p-1 hover:bg-orange-100 rounded cursor-pointer text-orange-600">◀</button>
        <h2 className="text-sm font-bold text-gray-900">{monthNames[currentMonth]} {currentYear}</h2>
        <button onClick={nextMonth} className="p-1 hover:bg-orange-100 rounded cursor-pointer text-orange-600">▶</button>
      </div>
      <div className="grid grid-cols-7 border-b">
        {dayNames.map((d) => (
          <div key={d} className="text-center text-xs font-semibold text-gray-500 py-2">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          const isToday = isCurrentMonthYear && day === todayDate;
          const projects = day ? (projectsByDate[day] || []) : [];
          return (
            <div key={idx}
              className={`min-h-[80px] border-r border-b p-1.5 last-of-type:border-r-0 ${!day ? 'bg-gray-50' : ''}`}>
              {day && (
                <>
                  <div className={`text-xs font-semibold mb-1 w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-orange-600 text-white' : 'text-gray-700'}`}>
                    {day}
                  </div>
                  <div className="space-y-0.5">
                    {projects.slice(0, 3).map((p) => (
                      <div key={p.id} onClick={() => navigate(`/vc/projects/${p.id}`)}
                        className="text-[10px] px-1.5 py-0.5 rounded truncate cursor-pointer hover:opacity-80 font-medium"
                        style={{ backgroundColor: `${p._stageColor || '#f97316'}20`, color: p._stageColor || '#f97316' }}
                        title={p.name}>
                        {p.code || p.name}
                      </div>
                    ))}
                    {projects.length > 3 && (
                      <div className="text-[10px] text-gray-400 px-1">+{projects.length - 3} thêm</div>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
      <div className="px-4 py-2 bg-gray-50 border-t flex items-center gap-4 text-xs text-gray-500">
        <span>📅 Deadline dự án VC</span>
        <span className="ml-auto">{allProjects.filter(p => p.deadline).length} dự án có deadline</span>
      </div>
    </div>
  );
}

