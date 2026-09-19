import { useMemo, useState } from 'react';
import { BookOpen, Building2, CalendarRange, FolderKanban, Users } from 'lucide-react';

const SEVERITY = {
  high: 'border-red-200 bg-red-50 text-red-900',
  medium: 'border-amber-200 bg-amber-50 text-amber-950',
  info: 'border-sky-200 bg-sky-50 text-sky-950',
};

const SEVERITY_LABEL = { high: 'Ưu tiên cao', medium: 'Cần chú ý', info: 'Ghi nhận' };

function Bar({ value, max }) {
  const width = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
      <div className="h-full rounded-full bg-blue-500" style={{ width: `${width}%` }} />
    </div>
  );
}

function GroupTable({ title, icon: Icon, rows, empty }) {
  const [expanded, setExpanded] = useState(false);
  const max = rows[0]?.total || 0;
  const visible = expanded ? rows : rows.slice(0, 8);
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Icon className="h-4 w-4 text-blue-600" />
        <h3 className="text-sm font-bold text-slate-900">{title}</h3>
        <span className="text-xs text-slate-400">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-slate-500">{empty}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="text-slate-500">
              <tr>
                <th className="pb-2 font-semibold">Nhóm</th>
                <th className="pb-2 text-right font-semibold">Tổng</th>
                <th className="pb-2 text-right font-semibold">Lỗi NV</th>
                <th className="pb-2 text-right font-semibold">KH</th>
                <th className="pb-2 text-right font-semibold">Quá hạn</th>
                <th className="pb-2 text-right font-semibold">Xong %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {visible.map((row) => (
                <tr key={row.key}>
                  <td className="max-w-[220px] py-2 pr-2">
                    <p className="line-clamp-2 font-medium text-slate-800">{row.label}</p>
                    <Bar value={row.total} max={max} />
                  </td>
                  <td className="py-2 text-right tabular-nums font-semibold">{row.total}</td>
                  <td className="py-2 text-right tabular-nums text-red-700">{row.employee_error || 0}</td>
                  <td className="py-2 text-right tabular-nums text-slate-600">{row.customer_request || 0}</td>
                  <td className="py-2 text-right tabular-nums text-amber-700">{row.overdue || 0}</td>
                  <td className="py-2 text-right tabular-nums">{row.completed_rate || 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > 8 && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-2 text-xs font-semibold text-blue-700 hover:underline"
        >
          {expanded ? 'Thu gọn' : `Xem thêm ${rows.length - 8} dòng`}
        </button>
      )}
    </section>
  );
}

export default function SharedWorkspaceReportAnalysis({ analysis }) {
  const [period, setPeriod] = useState('week');
  const periods = period === 'week' ? (analysis?.by_week || []) : (analysis?.by_month || []);
  const periodMax = useMemo(() => Math.max(0, ...periods.map((item) => item.total || 0)), [periods]);

  const lessons = analysis?.lessons || [];

  return (
    <div className="space-y-4">
      <section className="rounded-2xl border border-violet-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <BookOpen className="h-4 w-4 text-violet-700" />
          <h2 className="text-sm font-bold text-slate-900">Bài học rút kinh nghiệm</h2>
        </div>
        {lessons.length === 0 ? (
          <p className="text-sm text-slate-500">Chưa đủ dữ liệu để đưa ra bài học.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {lessons.map((item) => (
              <article key={item.id} className={`rounded-xl border p-3 ${SEVERITY[item.severity] || SEVERITY.info}`}>
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide">
                    {SEVERITY_LABEL[item.severity] || item.severity}
                  </span>
                  <span className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{item.group}</span>
                </div>
                <h3 className="text-sm font-bold">{item.title}</h3>
                <p className="mt-1 text-xs opacity-90">{item.detail}</p>
                <p className="mt-2 text-xs"><span className="font-bold">Bài học:</span> {item.lesson}</p>
                <p className="mt-1 text-xs"><span className="font-bold">Việc cần làm:</span> {item.action}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-900">Theo kỳ</h2>
          </div>
          <div className="flex rounded-lg border border-slate-200 p-0.5">
            <button
              type="button"
              onClick={() => setPeriod('week')}
              className={`h-8 rounded-md px-3 text-xs font-semibold ${period === 'week' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              Theo tuần
            </button>
            <button
              type="button"
              onClick={() => setPeriod('month')}
              className={`h-8 rounded-md px-3 text-xs font-semibold ${period === 'month' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              Theo tháng
            </button>
          </div>
        </div>
        {periods.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">Chưa có phát sinh theo kỳ.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[720px] w-full text-left text-xs">
              <thead className="bg-slate-100 text-slate-600">
                <tr>
                  {['Kỳ', 'Tổng', 'Lỗi NV', 'Khách hàng', 'Quá hạn', 'Hoàn thành', 'Tỷ lệ'].map((label) => (
                    <th key={label} className="whitespace-nowrap px-3 py-2 font-bold">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {periods.map((row) => (
                  <tr key={row.key} className="hover:bg-slate-50">
                    <td className="px-3 py-2">
                      <p className="font-medium text-slate-800">{row.label}</p>
                      <Bar value={row.total} max={periodMax} />
                    </td>
                    <td className="px-3 py-2 tabular-nums font-semibold">{row.total}</td>
                    <td className="px-3 py-2 tabular-nums text-red-700">{row.employee_error}</td>
                    <td className="px-3 py-2 tabular-nums">{row.customer_request}</td>
                    <td className="px-3 py-2 tabular-nums text-amber-700">{row.overdue}</td>
                    <td className="px-3 py-2 tabular-nums text-emerald-700">{row.completed}</td>
                    <td className="px-3 py-2 tabular-nums">{row.completed_rate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <GroupTable
          title="Theo bộ phận"
          icon={Building2}
          rows={analysis?.by_department || []}
          empty="Chưa gán bộ phận trên việc phát sinh."
        />
        <GroupTable
          title="Theo dự án / deal"
          icon={FolderKanban}
          rows={analysis?.by_project || []}
          empty="Chưa gắn dự án."
        />
        <GroupTable
          title="Theo nhân viên phụ trách"
          icon={Users}
          rows={analysis?.by_employee || []}
          empty="Chưa phân công nhân viên."
        />
        <GroupTable
          title="Theo loại phát sinh"
          icon={BookOpen}
          rows={analysis?.by_kind || []}
          empty="Chưa chọn loại phát sinh."
        />
      </div>
    </div>
  );
}
