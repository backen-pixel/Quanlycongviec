import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { formatVND } from '../lib/utils';

const CRITERIA = [
  { value: 'overall', label: 'Tổng quát' },
  { value: 'coordination', label: 'Phối hợp' },
  { value: 'quality', label: 'Chất lượng / đúng cam kết' },
  { value: 'schedule', label: 'Tiến độ' },
];

function StarRow({ value, onChange, disabled }) {
  return (
    <div className="flex gap-1 items-center">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          disabled={disabled}
          onClick={() => onChange(n)}
          className={`text-xl leading-none cursor-pointer disabled:opacity-40 ${n <= value ? 'text-amber-500' : 'text-gray-200'}`}
          aria-label={`${n} sao`}
        >
          ★
        </button>
      ))}
      <span className="text-sm text-gray-600 ml-1">{value}/5</span>
    </div>
  );
}

export default function DealCrossScoresPanel({ dealLeadId, user }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);
  const [saving, setSaving] = useState(false);

  const [xfSource, setXfSource] = useState('crm');
  const [xfTarget, setXfTarget] = useState('production');
  const [xfCriterion, setXfCriterion] = useState('overall');
  const [xfScore, setXfScore] = useState(5);
  const [xfComment, setXfComment] = useState('');

  const [custStars, setCustStars] = useState(5);
  const [custFeedback, setCustFeedback] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data: res } = await api.get(`/crm/deal-performance/${dealLeadId}/summary`);
      setData(res);
      if (res.my_role_module && !res.can_use_any_module) setXfSource(res.my_role_module);
    } catch (e) {
      setErr(e.response?.data?.error || e.message || 'Lỗi');
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [dealLeadId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (data?.module_options?.length && data.my_role_module && !data.can_use_any_module) {
      setXfSource(data.my_role_module);
    }
  }, [data]);

  useEffect(() => {
    const opts = data?.module_options;
    if (!opts?.length) return;
    if (xfSource !== xfTarget) return;
    const other = opts.find((m) => m.key !== xfSource);
    if (other) setXfTarget(other.key);
  }, [data, xfSource, xfTarget]);

  const submitCross = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/crm/deal-performance/${dealLeadId}/cross-score`, {
        source_module: xfSource,
        target_module: xfTarget,
        criterion: xfCriterion,
        score: xfScore,
        comment: xfComment.trim() || undefined,
      });
      setXfComment('');
      await load();
    } catch (e2) {
      alert(e2.response?.data?.error || e2.message);
    }
    setSaving(false);
  };

  const submitCustomer = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post(`/crm/deal-performance/${dealLeadId}/customer-rating`, {
        stars: custStars,
        feedback: custFeedback.trim() || undefined,
        source: 'manual',
      });
      setCustFeedback('');
      await load();
    } catch (e2) {
      alert(e2.response?.data?.error || e2.message);
    }
    setSaving(false);
  };

  const removeRow = async (rowId) => {
    if (!window.confirm('Xóa dòng điểm này?')) return;
    try {
      await api.delete(`/crm/deal-performance/${dealLeadId}/cross-score/${rowId}`);
      await load();
    } catch (e2) {
      alert(e2.response?.data?.error || e2.message);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin h-9 w-9 border-3 border-indigo-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (err) {
    return <div className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-4 py-3">{err}</div>;
  }

  const mods = data.module_options || [];
  const suggestion = data.suggestion || {};
  const canPickAny = data.can_use_any_module;

  return (
    <div className="space-y-6">
      {/* Tổng hợp */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="rounded-xl border bg-gradient-to-br from-indigo-50 to-white p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase">Điểm chéo nội bộ (TB)</p>
          <p className="text-2xl font-bold text-indigo-700 mt-1">
            {data.avg_cross_module_stars != null ? `${data.avg_cross_module_stars} ★` : '—'}
          </p>
        </div>
        <div className="rounded-xl border bg-gradient-to-br from-amber-50 to-white p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase">Sao khách hàng (TB)</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">
            {data.avg_customer_stars != null ? `${data.avg_customer_stars} ★` : '—'}
          </p>
        </div>
        <div className="rounded-xl border bg-gradient-to-br from-emerald-50 to-white p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase">Tổng hợp KPI (sao)</p>
          <p className="text-2xl font-bold text-emerald-800 mt-1">
            {data.composite_stars != null ? `${data.composite_stars} ★` : '—'}
          </p>
          <p className="text-[11px] text-gray-500 mt-2">
            Trọng số: chéo {Math.round((data.weights?.cross_internal_weight ?? 0.45) * 100)}% · KH{' '}
            {Math.round((data.weights?.customer_weight ?? 0.55) * 100)}%
          </p>
        </div>
      </div>

      {/* Thưởng / phạt gợi ý */}
      <div className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
        <p className="text-sm font-bold text-gray-900 mb-2">Gợi ý thưởng / phạt (theo giá trị Deal)</p>
        <p className="text-xs text-gray-600 mb-3">
          Cơ sở: <strong>{formatVND(suggestion.deal_value_basis || 0)}</strong>
          {suggestion.label && (
            <>
              {' '}
              · Bậc: <strong>{suggestion.label}</strong>
            </>
          )}
        </p>
        <div className="flex flex-wrap gap-4 text-sm">
          <span className="text-emerald-700 font-semibold">
            Thưởng gợi ý: {formatVND(suggestion.bonus_amount || 0)}
          </span>
          <span className="text-red-700 font-semibold">
            Phạt gợi ý: {formatVND(suggestion.penalty_amount || 0)}
          </span>
        </div>
        <p className="text-[11px] text-gray-500 mt-3">
          Quy tắc lưu trong Cài đặt hệ thống (app_settings). Admin chỉnh qua API{' '}
          <code className="bg-white px-1 rounded">PUT /api/crm/deal-performance/settings</code>.
        </p>
      </div>

      {/* TB theo module nhận điểm */}
      <div className="rounded-xl border p-4">
        <p className="text-sm font-bold text-gray-900 mb-3">Điểm TB nhận được theo module</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
          {(data.averages_by_target_module || []).map((r) => (
            <div key={r.module} className="rounded-lg bg-gray-50 border px-3 py-2">
              <p className="text-xs text-gray-500 truncate">{r.label}</p>
              <p className="text-lg font-semibold text-gray-900">{r.avg_stars != null ? `${r.avg_stars} ★` : '—'}</p>
              <p className="text-[10px] text-gray-400">{r.count} lượt chấm</p>
            </div>
          ))}
        </div>
      </div>

      {/* Form chấm chéo */}
      <form onSubmit={submitCross} className="rounded-xl border p-4 space-y-3">
        <p className="text-sm font-bold text-gray-900">Chấm điểm chéo giữa module</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="block text-xs">
            <span className="text-gray-500">Module chấm (nguồn)</span>
            <select
              value={xfSource}
              onChange={(e) => setXfSource(e.target.value)}
              disabled={!canPickAny}
              className="mt-1 w-full border rounded-lg h-9 px-2 text-sm bg-white disabled:bg-gray-100"
            >
              {mods.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            <span className="text-gray-500">Module được chấm</span>
            <select
              value={xfTarget}
              onChange={(e) => setXfTarget(e.target.value)}
              className="mt-1 w-full border rounded-lg h-9 px-2 text-sm"
            >
              {mods.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs">
            <span className="text-gray-500">Tiêu chí</span>
            <select
              value={xfCriterion}
              onChange={(e) => setXfCriterion(e.target.value)}
              className="mt-1 w-full border rounded-lg h-9 px-2 text-sm"
            >
              {CRITERIA.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <div className="text-xs">
            <span className="text-gray-500 block mb-1">Điểm (1–5)</span>
            <StarRow value={xfScore} onChange={setXfScore} disabled={saving} />
          </div>
        </div>
        <label className="block text-xs">
          <span className="text-gray-500">Ghi chú</span>
          <input
            value={xfComment}
            onChange={(e) => setXfComment(e.target.value)}
            className="mt-1 w-full border rounded-lg h-9 px-2 text-sm"
            placeholder="Tuỳ chọn"
          />
        </label>
        <button
          type="submit"
          disabled={saving || xfSource === xfTarget}
          className="h-9 px-4 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
        >
          {saving ? 'Đang lưu…' : 'Lưu điểm chéo'}
        </button>
        {!canPickAny && (
          <p className="text-[11px] text-gray-500">
            Module nguồn gắn với vai trò của bạn ({data.my_role_module || '—'}). Admin có thể chọn module khác.
          </p>
        )}
      </form>

      {/* Sao KH */}
      <form onSubmit={submitCustomer} className="rounded-xl border p-4 space-y-3">
        <p className="text-sm font-bold text-gray-900">Đánh giá sao từ khách hàng</p>
        <div className="flex flex-wrap items-center gap-4">
          <StarRow value={custStars} onChange={setCustStars} disabled={saving} />
          <span className="text-xs text-gray-500">Có thể ghi nhiều lần ( khảo sát định kỳ ).</span>
        </div>
        <textarea
          value={custFeedback}
          onChange={(e) => setCustFeedback(e.target.value)}
          rows={2}
          className="w-full border rounded-lg px-3 py-2 text-sm"
          placeholder="Phản hồi khách (tuỳ chọn)"
        />
        <button
          type="submit"
          disabled={saving}
          className="h-9 px-4 rounded-lg bg-amber-600 text-white text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
        >
          {saving ? 'Đang lưu…' : 'Ghi nhận sao KH'}
        </button>
      </form>

      {/* Lịch sử */}
      <div className="rounded-xl border overflow-hidden">
        <p className="text-sm font-bold text-gray-900 px-4 py-3 bg-gray-50 border-b">Lịch sử điểm chéo</p>
        <div className="max-h-56 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 sticky top-0 text-left text-xs text-gray-500">
              <tr>
                <th className="py-2 px-3">Từ → Đến</th>
                <th className="py-2 px-3">Tiêu chí</th>
                <th className="py-2 px-3">Điểm</th>
                <th className="py-2 px-3">Bởi</th>
                <th className="py-2 px-3 w-16" />
              </tr>
            </thead>
            <tbody>
              {(data.cross_scores || []).map((r) => (
                <tr key={r.id} className="border-t border-gray-100">
                  <td className="py-2 px-3">
                    {r.source_module} → {r.target_module}
                  </td>
                  <td className="py-2 px-3">{r.criterion}</td>
                  <td className="py-2 px-3 font-medium">{r.score} ★</td>
                  <td className="py-2 px-3 text-gray-600">{r.author_name || '—'}</td>
                  <td className="py-2 px-3">
                    {(String(r.created_by) === String(user?.id || user?.userId) ||
                      ['admin', 'manager', 'director'].includes(user?.role)) ? (
                      <button
                        type="button"
                        onClick={() => removeRow(r.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        Xóa
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!(data.cross_scores || []).length && (
            <p className="text-center text-gray-400 py-6 text-sm">Chưa có điểm chéo.</p>
          )}
        </div>
      </div>

      <div className="rounded-xl border overflow-hidden">
        <p className="text-sm font-bold text-gray-900 px-4 py-3 bg-gray-50 border-b">Lịch sử sao khách hàng</p>
        <div className="max-h-40 overflow-y-auto divide-y">
          {(data.customer_ratings || []).map((r) => (
            <div key={r.id} className="px-4 py-2 text-sm">
              <span className="font-semibold text-amber-600">{r.stars} ★</span>
              <span className="text-gray-500 text-xs ml-2">{r.author_name || '—'}</span>
              {r.feedback && <p className="text-gray-600 mt-1">{r.feedback}</p>}
            </div>
          ))}
          {!(data.customer_ratings || []).length && (
            <p className="text-center text-gray-400 py-6 text-sm">Chưa có đánh giá KH.</p>
          )}
        </div>
      </div>
    </div>
  );
}
