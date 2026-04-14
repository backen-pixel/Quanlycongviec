import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { markCrmPipelineCardFocus } from '../lib/crmPipelineStorage';

function formatVND(v) {
  if (!v) return '0đ';
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(v);
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('vi-VN');
}

// ── LIST VIEW ──────────────────────────────────────────────────────────────
export function ListView({ pipeline, pipelineType, calculateDays }) {
  const allItems = pipeline.flatMap(s => s.items.map(item => ({ ...item, _stage: s })));
  const navigate = useNavigate();
  if (!allItems.length) return <p className="text-center text-gray-400 py-12 text-sm">Không có dữ liệu</p>;
  return (
    <div className="bg-white rounded-xl border overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-gray-50 text-left text-xs text-gray-500 uppercase">
            <th className="px-4 py-3 font-medium">Mã</th>
            <th className="px-4 py-3 font-medium">Tên</th>
            <th className="px-4 py-3 font-medium">Khách hàng</th>
            <th className="px-4 py-3 font-medium">Giai đoạn</th>
            <th className="px-4 py-3 font-medium text-right">Giá trị</th>
            <th className="px-4 py-3 font-medium">Phụ trách</th>
            <th className="px-4 py-3 font-medium">Nguồn</th>
            <th className="px-4 py-3 font-medium">Ngày tạo</th>
            <th className="px-4 py-3 font-medium">Số ngày</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {allItems.map(item => {
            const days = calculateDays(item.created_at);
            return (
              <tr key={item.id}
                data-crm-pipeline-card={item.id}
                onClick={() => {
                  markCrmPipelineCardFocus(item.id);
                  navigate(`/crm/leads/${item.id}`);
                }}
                className="hover:bg-blue-50/50 cursor-pointer transition-colors">
                <td className="px-4 py-2.5 text-blue-600 font-medium whitespace-nowrap">{item.code}</td>
                <td className="px-4 py-2.5 font-medium text-gray-900 max-w-[220px]">
                  <span className="inline-flex items-center gap-2 min-w-0 max-w-full">
                    <span className="truncate">{item.title}</span>
                    {item.is_new_for_current_user && (
                      <span className="shrink-0 text-[9px] font-bold uppercase text-white bg-rose-500 px-1.5 py-0.5 rounded">Mới</span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-600">{item.customer?.full_name || '—'}</td>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium" style={{ backgroundColor: item._stage.color + '20', color: item._stage.color }}>
                    {item._stage.icon} {item._stage.name}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-right font-medium text-gray-900 whitespace-nowrap">{item.estimated_value > 0 ? formatVND(item.estimated_value) : '—'}</td>
                <td className="px-4 py-2.5 text-gray-600 text-xs">{item.assignee?.full_name || '—'}</td>
                <td className="px-4 py-2.5 text-gray-500 text-xs">{item.source?.icon} {item.source?.name || '—'}</td>
                <td className="px-4 py-2.5 text-gray-400 text-xs whitespace-nowrap">{formatDate(item.created_at)}</td>
                <td className="px-4 py-2.5 text-xs whitespace-nowrap">
                  <span className={days > 30 ? 'text-red-600 font-bold' : days > 14 ? 'text-amber-600' : 'text-gray-500'}>{days} ngày</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500 flex justify-between">
        <span>Tổng: {allItems.length} {pipelineType === 'deal' ? 'deal' : 'lead'}</span>
        <span>GT: {formatVND(allItems.reduce((s, i) => s + (i.estimated_value || 0), 0))}</span>
      </div>
    </div>
  );
}

// ── PLANNER VIEW (Theo người phụ trách) ────────────────────────────────────
export function PlannerView({ pipeline, pipelineType }) {
  const navigate = useNavigate();
  const allItems = pipeline.flatMap(s => s.items.map(item => ({ ...item, _stage: s })));

  const groups = useMemo(() => {
    const map = {};
    const unassigned = [];
    allItems.forEach((item) => {
      const ownerId = item.assigned_to || item.lead_owner_id;
      const ownerUser = item.assignee || item.lead_owner;
      if (ownerId && ownerUser) {
        if (!map[ownerId]) map[ownerId] = { user: ownerUser, items: [], totalValue: 0 };
        map[ownerId].items.push(item);
        map[ownerId].totalValue += (item.estimated_value || 0);
      } else {
        unassigned.push(item);
      }
    });
    return { assignees: Object.values(map).sort((a, b) => b.items.length - a.items.length), unassigned };
  }, [allItems]);

  if (!allItems.length) return <p className="text-center text-gray-400 py-12 text-sm">Không có dữ liệu</p>;

  const renderCard = (item) => (
    <div key={item.id}
      data-crm-pipeline-card={item.id}
      onClick={() => {
        markCrmPipelineCardFocus(item.id);
        navigate(`/crm/leads/${item.id}`);
      }}
      className="bg-white rounded-lg border p-3 hover:shadow-md transition-all cursor-pointer group">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-blue-600 font-medium">{item.code}</p>
          <div className="flex items-start gap-1.5 mt-0.5 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate flex-1 min-w-0">{item.title}</p>
            {item.is_new_for_current_user && (
              <span className="shrink-0 text-[9px] font-bold uppercase text-white bg-rose-500 px-1 py-0.5 rounded leading-tight">Mới</span>
            )}
          </div>
          {item.customer?.full_name && <p className="text-xs text-gray-500 mt-0.5">{item.customer.full_name}</p>}
        </div>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium shrink-0" style={{ backgroundColor: item._stage.color + '20', color: item._stage.color }}>
          {item._stage.icon} {item._stage.name}
        </span>
      </div>
      {item.estimated_value > 0 && <p className="text-xs font-bold text-gray-900 mt-2">{formatVND(item.estimated_value)}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      {groups.assignees.map(group => (
        <div key={group.user.id} className="bg-white rounded-xl border overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 bg-gray-50">
            <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold">
              {group.user.full_name?.charAt(0) || '?'}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{group.user.full_name}</p>
              <p className="text-[10px] text-gray-500">{group.items.length} {pipelineType === 'deal' ? 'deal' : 'lead'} • {formatVND(group.totalValue)}</p>
            </div>
          </div>
          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {group.items.map(item => renderCard(item))}
          </div>
        </div>
      ))}
      {groups.unassigned.length > 0 && (
        <div className="bg-white rounded-xl border border-dashed overflow-hidden">
          <div className="px-4 py-3 bg-gray-50">
            <p className="text-sm font-semibold text-gray-500">Chưa giao ({groups.unassigned.length})</p>
          </div>
          <div className="p-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2">
            {groups.unassigned.map(item => renderCard(item))}
          </div>
        </div>
      )}
    </div>
  );
}
