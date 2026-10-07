import { CheckCircle2, Circle, AlertCircle } from 'lucide-react';

const STATUS_STYLE = {
  ok: { icon: CheckCircle2, tone: 'text-emerald-600', text: 'text-gray-700' },
  missing: { icon: AlertCircle, tone: 'text-red-500', text: 'text-gray-900 font-semibold' },
  later: { icon: Circle, tone: 'text-gray-300', text: 'text-gray-400' },
};

/** Thanh tiến độ hồ sơ: số mục đủ trên số mục cần xét (bỏ mục chưa tới lúc). */
export function ChecklistMeter({ checklist, compact = false }) {
  if (!checklist) return null;
  const relevant = checklist.items.filter((i) => i.status !== 'later').length;
  const pct = relevant ? Math.round((checklist.ok_count / relevant) * 100) : 100;
  const tone = checklist.missing_count === 0 ? 'bg-emerald-500' : checklist.missing_count <= 2 ? 'bg-amber-500' : 'bg-red-500';
  return (
    <div className={compact ? 'min-w-[7rem]' : ''}>
      <div className="flex items-center justify-between text-[11px] font-semibold">
        <span className={checklist.missing_count ? 'text-red-600' : 'text-emerald-700'}>
          {checklist.missing_count ? `Thiếu ${checklist.missing_count} mục` : 'Hồ sơ đủ'}
        </span>
        <span className="text-gray-400 tabular-nums">{checklist.ok_count}/{relevant}</span>
      </div>
      <div className="h-1.5 rounded-full bg-gray-100 mt-1 overflow-hidden">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** Danh sách mục hồ sơ; renderAction(item) trả về nút xử lý cho mục còn thiếu. */
export default function AccountingChecklist({ checklist, renderAction }) {
  if (!checklist) return null;
  return (
    <ul className="divide-y divide-gray-100">
      {checklist.items.map((it) => {
        const st = STATUS_STYLE[it.status] || STATUS_STYLE.later;
        const Icon = st.icon;
        const action = it.status === 'missing' && renderAction ? renderAction(it) : null;
        return (
          <li key={it.key} className="flex items-start gap-2.5 py-2">
            <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${st.tone}`} />
            <div className="min-w-0 flex-1">
              <p className={`text-sm ${st.text}`}>{it.label}</p>
              {it.hint && <p className="text-xs text-gray-500 mt-0.5">{it.hint}</p>}
            </div>
            {action}
          </li>
        );
      })}
    </ul>
  );
}
