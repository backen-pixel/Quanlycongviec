import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Clock, Filter, GripVertical, ListChecks, RotateCcw, Users, X,
} from 'lucide-react';

const FIELD_CLS = 'h-8 w-full min-w-0 px-2.5 bg-white border border-violet-200 rounded-md text-xs font-medium text-slate-800 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-300/80 focus:border-violet-400';
const SELECT_CLS = `${FIELD_CLS} cursor-pointer appearance-none pr-7`;
const LABEL_CLS = 'text-[10px] font-semibold text-violet-800/90 uppercase tracking-wide mb-1 block';

function readPosition(storageKey) {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || 'null');
    return value && Number.isFinite(value.x) && Number.isFinite(value.y) ? value : null;
  } catch {
    return null;
  }
}

export default function ProjectTasksFilterPanel({
  onClose,
  onReset,
  storageKey,
  riskFilter,
  setRiskFilter,
  progressFilter,
  setProgressFilter,
  companyFilter,
  setCompanyFilter,
  companyOptions,
  regionFilter,
  setRegionFilter,
  regionOptions,
  assigneeFilter,
  setAssigneeFilter,
  assigneeOptions,
  deadlineFrom,
  setDeadlineFrom,
  deadlineTo,
  setDeadlineTo,
}) {
  const panelRef = useRef(null);
  const dragRef = useRef(null);
  const [tab, setTab] = useState('status');
  const [position, setPosition] = useState(() => readPosition(storageKey));
  const tabs = useMemo(() => ([
    {
      id: 'status',
      label: 'Trạng thái',
      icon: ListChecks,
      count: Number(riskFilter !== 'all') + Number(progressFilter !== 'all'),
    },
    {
      id: 'employee',
      label: 'Nhân viên',
      icon: Users,
      count: Number(!!companyFilter) + Number(!!regionFilter) + Number(!!assigneeFilter),
    },
    {
      id: 'time',
      label: 'Thời gian',
      icon: Clock,
      count: Number(!!deadlineFrom) + Number(!!deadlineTo),
    },
  ]), [
    assigneeFilter, companyFilter, deadlineFrom, deadlineTo,
    progressFilter, regionFilter, riskFilter,
  ]);

  useEffect(() => {
    const onMove = (event) => {
      const drag = dragRef.current;
      if (!drag) return;
      const margin = 8;
      const maxX = Math.max(margin, window.innerWidth - drag.width - margin);
      const maxY = Math.max(margin, window.innerHeight - drag.height - margin);
      setPosition({
        x: Math.min(maxX, Math.max(margin, drag.originX + event.clientX - drag.startX)),
        y: Math.min(maxY, Math.max(margin, drag.originY + event.clientY - drag.startY)),
      });
    };
    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setPosition((current) => {
        try {
          if (current) localStorage.setItem(storageKey, JSON.stringify(current));
        } catch { /* ignore */ }
        return current;
      });
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [storageKey]);

  const beginDrag = (event) => {
    if (event.button !== 0 || !panelRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    dragRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      originX: position?.x ?? rect.left,
      originY: position?.y ?? rect.top,
      width: rect.width,
      height: rect.height,
    };
    if (!position) setPosition({ x: rect.left, y: rect.top });
    event.preventDefault();
  };

  const resetPosition = () => {
    setPosition(null);
    try {
      localStorage.removeItem(storageKey);
    } catch { /* ignore */ }
  };

  return (
    <div
      ref={panelRef}
      className="ui-solid-white fixed z-[75] max-sm:left-4 max-sm:right-4 max-sm:bottom-4 max-sm:top-auto w-[min(100vw-2rem,400px)] max-h-[min(calc(100vh-5rem),620px)] flex flex-col rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden animate-fade-in"
      style={position ? { left: position.x, top: position.y } : { top: '4.5rem', right: '1rem' }}
      role="region"
      aria-label="Bộ lọc nhiệm vụ dự án"
    >
      <div
        className="shrink-0 px-3 pt-2.5 pb-2 border-b border-gray-200 bg-white cursor-grab active:cursor-grabbing select-none"
        onMouseDown={beginDrag}
      >
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 shrink-0 text-violet-400" />
          <Filter className="h-4 w-4 shrink-0 text-violet-600" />
          <p className="text-sm font-bold text-violet-950 tracking-tight flex-1 min-w-0">Bộ lọc</p>
          <button
            type="button"
            onMouseDown={(event) => event.stopPropagation()}
            onClick={onClose}
            className="h-7 w-7 rounded-md text-violet-500 hover:text-violet-800 hover:bg-violet-200/60 cursor-pointer flex items-center justify-center"
            aria-label="Thu gọn bộ lọc"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <div className="mt-2 flex p-0.5 rounded-lg bg-gray-50 border border-gray-200 gap-0.5">
          {tabs.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onMouseDown={(event) => event.stopPropagation()}
                onClick={() => setTab(item.id)}
                className={`flex-1 min-w-0 inline-flex items-center justify-center gap-1 py-1.5 rounded-md text-[11px] font-semibold transition-all cursor-pointer ${
                  tab === item.id
                    ? 'bg-white text-violet-800 shadow-sm ring-1 ring-violet-300/70'
                    : 'text-violet-700/75 hover:text-violet-900 hover:bg-violet-50/80'
                }`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-violet-600" />
                <span className="truncate">{item.label}</span>
                {item.count > 0 && (
                  <span className={`inline-flex h-4 min-w-4 items-center justify-center rounded-full px-0.5 text-[9px] font-bold ${
                    tab === item.id ? 'bg-violet-600 text-white' : 'bg-violet-300/80 text-violet-900'
                  }`}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-1 bg-white [scrollbar-width:thin]">
        {tab === 'status' && (
          <div className="py-2 space-y-3">
            <label className="block">
              <span className={LABEL_CLS}>Tình trạng hạn</span>
              <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)} className={SELECT_CLS}>
                <option value="all">Tất cả</option>
                <option value="normal">Đang thực hiện</option>
                <option value="warning">Cảnh báo trong 3 ngày</option>
                <option value="overdue">Quá hạn</option>
              </select>
            </label>
            <label className="block">
              <span className={LABEL_CLS}>Tiến độ</span>
              <select value={progressFilter} onChange={(event) => setProgressFilter(event.target.value)} className={SELECT_CLS}>
                <option value="all">Tất cả</option>
                <option value="not_started">Chưa bắt đầu (0/N)</option>
                <option value="in_progress">Đang làm</option>
              </select>
            </label>
          </div>
        )}

        {tab === 'employee' && (
          <div className="py-2 space-y-3">
            <label className="block">
              <span className={LABEL_CLS}>Công ty</span>
              <select value={companyFilter} onChange={(event) => setCompanyFilter(event.target.value)} className={SELECT_CLS}>
                <option value="">Tất cả công ty</option>
                {(companyOptions || [])
                  .slice()
                  .sort((a, b) => String(a.short_name || a.name || '').localeCompare(String(b.short_name || b.name || ''), 'vi'))
                  .map((company) => (
                    <option key={company.id} value={company.id}>{company.short_name || company.name}</option>
                  ))}
              </select>
            </label>
            <label className="block">
              <span className={LABEL_CLS}>Khu vực</span>
              <select value={regionFilter} onChange={(event) => setRegionFilter(event.target.value)} className={SELECT_CLS}>
                <option value="">Tất cả khu vực</option>
                {(regionOptions || []).map((region) => (
                  <option key={region.id} value={region.id}>{region.name}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={LABEL_CLS}>Người phụ trách</span>
              <select value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)} className={SELECT_CLS}>
                <option value="">Tất cả nhân viên</option>
                {assigneeOptions.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}
              </select>
            </label>
          </div>
        )}

        {tab === 'time' && (
          <div className="py-2 space-y-3">
            <label className="block">
              <span className={LABEL_CLS}>Hạn từ ngày</span>
              <input type="date" value={deadlineFrom} onChange={(event) => setDeadlineFrom(event.target.value)} className={FIELD_CLS} />
            </label>
            <label className="block">
              <span className={LABEL_CLS}>Hạn đến ngày</span>
              <input type="date" value={deadlineTo} onChange={(event) => setDeadlineTo(event.target.value)} className={FIELD_CLS} />
            </label>
          </div>
        )}
      </div>

      <div className="shrink-0 flex items-center justify-between gap-2 px-3 py-2 border-t border-gray-200 bg-gray-50/90">
        <button type="button" onClick={resetPosition} className="inline-flex h-7 items-center gap-1 px-2 rounded-md text-[10px] font-semibold text-slate-500 hover:bg-white hover:text-violet-700">
          <GripVertical className="h-3 w-3" /> Vị trí mặc định
        </button>
        <button type="button" onClick={onReset} className="inline-flex h-7 items-center gap-1 px-2 rounded-md border border-violet-200 bg-white text-[10px] font-semibold text-violet-700 hover:bg-violet-50">
          <RotateCcw className="h-3 w-3" /> Đặt lại bộ lọc
        </button>
      </div>
    </div>
  );
}
