import { useEffect, useState } from 'react';
import { History, Trash2 } from 'lucide-react';
import api from '../../lib/api';

export default function CalcHistoryPage() {
  const [runs, setRuns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const load = () => {
    setLoading(true);
    const params = filter === 'mine' ? { mine: 1, limit: 100 } : { limit: 100 };
    api.get('/calc/runs', { params })
      .then((r) => setRuns(r.data?.runs || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [filter]); // eslint-disable-line react-hooks/exhaustive-deps

  const remove = async (id) => {
    if (!confirm('Xóa lượt tính này?')) return;
    await api.delete(`/calc/runs/${id}`);
    load();
  };

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-sky-500 flex items-center justify-center text-white">
          <History className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900">Lịch sử tính</h1>
          <p className="text-sm text-gray-500">Các lượt tính tay + auto-tính từ file 3D.</p>
        </div>
        <div className="ml-auto">
          <select className="input" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">Tất cả</option>
            <option value="mine">Của tôi</option>
          </select>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        {loading ? (
          <p className="p-8 text-center text-sm text-gray-400">Đang tải…</p>
        ) : runs.length === 0 ? (
          <p className="p-8 text-center text-sm text-gray-400">Chưa có lượt tính nào.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs text-gray-600">
              <tr>
                <th className="px-3 py-2 text-left">Thời gian</th>
                <th className="px-3 py-2 text-left">Loại sản phẩm</th>
                <th className="px-3 py-2 text-left">Người tính</th>
                <th className="px-3 py-2 text-left">Nguồn</th>
                <th className="px-3 py-2 text-right">Kết quả</th>
                <th className="px-3 py-2 text-left">Ghi chú</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {runs.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {new Date(r.created_at).toLocaleString('vi-VN')}
                  </td>
                  <td className="px-3 py-2">{r.product_type?.name || '—'}</td>
                  <td className="px-3 py-2 text-xs">{r.creator?.full_name || '—'}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      r.source === 'manual' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                    }`}>
                      {r.source}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right font-semibold text-emerald-700">
                    {Number(r.result || 0).toLocaleString('vi-VN', { maximumFractionDigits: 2 })}
                    {r.result_unit ? <span className="ml-1 text-xs text-gray-500">{r.result_unit}</span> : null}
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-500">{r.notes || '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <button onClick={() => remove(r.id)} className="p-1 text-gray-300 hover:text-rose-500"><Trash2 className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
