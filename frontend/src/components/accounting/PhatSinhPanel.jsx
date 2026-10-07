import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Wrench, ExternalLink } from 'lucide-react';
import api from '../../lib/api';
import { formatVND, formatDate } from '../../lib/utils';

const MODULE_PHAT_SINH_PATH = {
  production: '/sx/phat-sinh',
  logistics: '/vc/phat-sinh',
  crm: '/crm/phat-sinh',
  accounting: '/ketoan/phat-sinh',
  purchasing: '/mua-hang/phat-sinh',
};

const STATUS_TONE = {
  pending: 'bg-gray-100 text-gray-600',
  in_progress: 'bg-blue-50 text-blue-700',
  completed: 'bg-emerald-50 text-emerald-700',
};

function CostEditor({ item, onSave }) {
  const [draft, setDraft] = useState(item.cost_amount != null ? String(item.cost_amount) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setDraft(item.cost_amount != null ? String(item.cost_amount) : '');
  }, [item.cost_amount]);

  if (!item.can_record_cost) {
    return <p className="text-[11px] text-gray-400">Chưa gắn nhiệm vụ CRM — chưa ghi được phí</p>;
  }

  const submit = async (value) => {
    setError('');
    if (value !== null && !(Number(value) >= 0)) { setError('Nhập số không âm'); return; }
    setSaving(true);
    try {
      await onSave(item, value === null ? null : Number(value));
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Không lưu được');
    } finally {
      setSaving(false);
    }
  };

  const dirty = draft !== (item.cost_amount != null ? String(item.cost_amount) : '');

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min="0"
          inputMode="numeric"
          placeholder="Chi phí (đ)"
          className="h-8 w-32 px-2 rounded-lg border border-gray-200 text-sm text-right tabular-nums focus:outline-none focus:ring-2 focus:ring-rose-300"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          type="button"
          disabled={saving || !dirty || draft === ''}
          onClick={() => submit(draft)}
          className="h-8 px-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Lưu'}
        </button>
        {item.cost_amount == null ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => submit(0)}
            className="h-8 px-2 rounded-lg border border-gray-200 text-xs font-semibold text-gray-600 hover:bg-gray-50 cursor-pointer disabled:opacity-40"
          >
            Không phí
          </button>
        ) : (
          <button
            type="button"
            disabled={saving}
            onClick={() => submit(null)}
            className="h-8 px-2 rounded-lg text-xs font-semibold text-gray-500 hover:text-red-600 cursor-pointer disabled:opacity-40"
            title="Bỏ chi phí đã ghi"
          >
            Bỏ
          </button>
        )}
      </div>
      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

/** Việc phát sinh trên không gian chung của dự án — kế toán ghi chi phí từng việc vào sổ chi phí. */
export default function PhatSinhPanel({ leadId, params, onChanged }) {
  const [data, setData] = useState({ items: [], total: 0, missing_cost: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: res } = await api.get(`/accounting/deals/${leadId}/phat-sinh`, { params });
      setData(res);
      setError('');
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Không tải được việc phát sinh');
    } finally {
      setLoading(false);
    }
  }, [leadId, params]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (loading || window.location.hash !== '#phat-sinh') return;
    document.getElementById('phat-sinh')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [loading]);

  const saveCost = async (item, amount) => {
    await api.put(`/accounting/deals/${leadId}/phat-sinh/${item.id}/cost`, { amount }, { params });
    await load();
    onChanged?.();
  };

  return (
    <div id="phat-sinh" className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden scroll-mt-4">
      <div className="p-4 flex items-center justify-between gap-2 flex-wrap border-b border-gray-100">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Chi phí phát sinh</h3>
          <p className="text-[11px] text-gray-400">
            Lấy từ nhiệm vụ phát sinh trên không gian chung của dự án — kế toán ghi chi phí cho từng việc
          </p>
        </div>
        <div className="flex items-center gap-4">
          {data.missing_cost > 0 && (
            <span className="text-xs font-semibold text-rose-700 bg-rose-50 px-2 py-1 rounded-lg">
              {data.missing_cost} việc chưa ghi phí
            </span>
          )}
          <div className="text-right">
            <p className="text-[10px] font-semibold uppercase text-gray-400">Tổng phát sinh</p>
            <p className="text-base font-extrabold text-rose-600 tabular-nums">{formatVND(data.total || 0)}</p>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="py-8 text-center text-gray-400 text-sm">Đang tải…</p>
      ) : error ? (
        <p className="py-8 text-center text-red-600 text-sm">{error}</p>
      ) : data.items.length === 0 ? (
        <p className="py-8 text-center text-gray-400 text-sm">Dự án chưa có việc phát sinh nào trên không gian chung</p>
      ) : (
        <div className="divide-y divide-gray-100">
          {data.items.map((it) => (
            <div key={it.id} className="p-4 flex items-start gap-3 hover:bg-gray-50/60 flex-wrap md:flex-nowrap">
              <div className="p-2 rounded-lg shrink-0 bg-rose-50 text-rose-600">
                <Wrench className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[11px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded-md">{it.kind_name}</span>
                  <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${it.co_phi ? 'bg-amber-50 text-amber-800' : 'bg-gray-100 text-gray-500'}`}>
                    {it.co_phi ? 'Loại có phí' : 'Loại không phí'}
                  </span>
                  <span className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md ${STATUS_TONE[it.status] || 'bg-gray-100 text-gray-600'}`}>
                    {it.status_label}
                  </span>
                  {it.source_label && (
                    <span className="text-[11px] text-gray-500">· {it.source_label}</span>
                  )}
                </div>
                <Link
                  to={`${MODULE_PHAT_SINH_PATH[it.module] || '/sx/phat-sinh'}?open=${it.id}`}
                  className="mt-1 inline-flex items-center gap-1 text-sm font-semibold text-gray-900 hover:text-teal-700 hover:underline"
                  title="Mở nhiệm vụ phát sinh"
                >
                  <span className="line-clamp-1">{it.title || 'Việc phát sinh'}</span>
                  <ExternalLink className="h-3 w-3 shrink-0 text-gray-400" />
                </Link>
                <p className="text-[11px] text-gray-500 mt-0.5">
                  Tạo {formatDate(it.created_at)}
                  {it.completed_at ? ` · Xong ${formatDate(it.completed_at)}` : ''}
                  {it.assignee_name ? ` · ${it.assignee_name}` : ''}
                  {it.company_name ? ` · ${it.company_name}` : ''}
                </p>
              </div>
              <div className="shrink-0 ml-auto text-right">
                {it.cost_amount != null && (
                  <p className="text-sm font-bold tabular-nums text-gray-900 mb-1">
                    {it.cost_amount > 0 ? formatVND(it.cost_amount) : 'Không phí'}
                  </p>
                )}
                <CostEditor item={it} onSave={saveCost} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
