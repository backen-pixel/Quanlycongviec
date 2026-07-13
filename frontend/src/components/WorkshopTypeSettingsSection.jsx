import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';
import { Layers, Loader2, Plus, Trash2, Save, Building2 } from 'lucide-react';

/**
 * Quản lý "Loại" dự án xưởng (bảng workshop_project_types) — cùng pattern CRM lead types.
 * @param {{ moduleContext: 'production' | 'logistics', accent: 'teal' | 'orange', companyId?: string, onCompanyIdChange?: (id: string) => void, onTypesChanged?: () => void }} props
 * Khi truyền `onCompanyIdChange`, công ty do trang cha điều khiển (ẩn dropdown trong section).
 */
export default function WorkshopTypeSettingsSection({ moduleContext, accent = 'teal', companyId: companyIdProp, onCompanyIdChange, onTypesChanged }) {
  const { user } = useAuth();
  const isAdmin = isAdminLike(user);
  const isCompanyControlled = typeof onCompanyIdChange === 'function';
  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState('');
  const effectiveCompanyId = isCompanyControlled ? String(companyIdProp ?? '') : companyId;
  const [types, setTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [newRow, setNewRow] = useState({
    name: '',
    applies_to: moduleContext === 'production' ? 'production' : 'logistics',
  });

  const bar = accent === 'orange' ? 'from-orange-50' : 'from-teal-50';
  const btn = accent === 'orange' ? 'bg-orange-600 hover:bg-orange-700' : 'bg-teal-600 hover:bg-teal-700';
  const border = accent === 'orange' ? 'border-orange-200' : 'border-teal-200';

  const appliesOptions = useMemo(() => {
    if (moduleContext === 'production') {
      return [
        { value: 'production', label: 'Chỉ Sản xuất' },
        { value: 'both', label: 'Sản xuất + Vận chuyển' },
      ];
    }
    return [
      { value: 'logistics', label: 'Chỉ Vận chuyển' },
      { value: 'both', label: 'Sản xuất + Vận chuyển' },
    ];
  }, [moduleContext]);

  useEffect(() => {
    if (isCompanyControlled) return;
    if (!isAdmin) {
      if (user?.company_id) setCompanyId(String(user.company_id));
    }
  }, [isAdmin, user?.company_id, isCompanyControlled]);

  useEffect(() => {
    if (!isAdmin || isCompanyControlled) return;
    api.get('/companies', { params: { for_module: moduleContext === 'production' ? 'production' : 'logistics' } }).then((r) => {
      const list = r.data?.companies || r.data || [];
      setCompanies(Array.isArray(list) ? list : []);
    }).catch(() => setCompanies([]));
  }, [isAdmin, isCompanyControlled, moduleContext]);

  useEffect(() => {
    if (!isAdmin || isCompanyControlled || !companies.length) return;
    setCompanyId((prev) => (prev && companies.some((c) => String(c.id) === String(prev)) ? prev : String(companies[0].id)));
  }, [isAdmin, companies, isCompanyControlled]);

  const loadTypes = useCallback(async () => {
    if (!effectiveCompanyId) {
      setTypes([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const mod = moduleContext === 'production' ? 'production' : 'logistics';
      const { data } = await api.get('/workshop/project-types', {
        params: { company_id: effectiveCompanyId, all: 'true', module: mod },
      });
      setTypes(Array.isArray(data) ? data : []);
    } catch {
      setTypes([]);
    }
    setLoading(false);
  }, [effectiveCompanyId, moduleContext]);

  useEffect(() => { loadTypes(); }, [loadTypes]);

  const addType = async () => {
    if (!newRow.name?.trim() || !effectiveCompanyId) return;
    try {
      await api.post('/workshop/project-types', {
        company_id: effectiveCompanyId,
        name: newRow.name.trim(),
        applies_to: newRow.applies_to,
      });
      setNewRow({ name: '', applies_to: newRow.applies_to });
      await loadTypes();
      onTypesChanged?.();
    } catch (e) {
      alert(e.response?.data?.error || 'Không tạo được loại');
    }
  };

  const saveType = async (t) => {
    setSavingId(t.id);
    try {
      await api.put(`/workshop/project-types/${t.id}`, {
        name: t.name,
        applies_to: t.applies_to,
        order_index: t.order_index,
        is_active: t.is_active,
        description: t.description ?? '',
      });
      await loadTypes();
      onTypesChanged?.();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi lưu');
    }
    setSavingId(null);
  };

  const delType = async (t) => {
    if (!confirm(`Xóa loại «${t.name}»?`)) return;
    try {
      await api.delete(`/workshop/project-types/${t.id}`);
      await loadTypes();
      onTypesChanged?.();
    } catch (e) {
      alert(e.response?.data?.error || 'Không xóa được');
    }
  };

  if (!isAdmin && !user?.company_id) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
        Tài khoản chưa gắn công ty — không thể cấu hình loại dự án. Liên hệ quản trị.
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl border overflow-hidden ${border}`}>
      <div className={`flex flex-wrap items-center justify-between gap-2 p-4 border-b bg-gradient-to-r ${bar} to-white`}>
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${accent === 'orange' ? 'bg-orange-100 text-orange-700' : 'bg-teal-100 text-teal-700'}`}>
            <Layers className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-gray-900">Phân loại dự án (loại công việc)</h2>
            <p className="text-[10px] text-gray-500">Gắn cho từng dự án; lọc trên dashboard. Theo công ty (giống phân loại Lead/Deal CRM).</p>
          </div>
        </div>
        {isAdmin && !isCompanyControlled && (
          <div className="flex items-center gap-1.5 text-sm">
            <Building2 className="h-3.5 w-3.5 text-gray-500" />
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm max-w-[14rem] bg-white"
            >
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10 text-gray-400 gap-2">
          <Loader2 className="h-5 w-5 animate-spin" /> Đang tải loại…
        </div>
      ) : !effectiveCompanyId ? (
        <p className="p-4 text-sm text-gray-500">Chọn công ty (admin) để xem loại.</p>
      ) : (
        <div className="p-4 space-y-3">
          <div className="grid gap-2 sm:grid-cols-12 items-end border border-dashed border-gray-200 rounded-lg p-3 bg-gray-50/80">
            <label className="sm:col-span-5 text-[11px] text-gray-700">
              <span className="font-semibold">Tên loại mới</span>
              <input
                value={newRow.name}
                onChange={(e) => setNewRow((p) => ({ ...p, name: e.target.value }))}
                className="mt-0.5 w-full border border-gray-200 rounded-lg px-2 py-2 text-sm"
                placeholder="VD: Tủ bếp, Nội thất tổng thể…"
              />
            </label>
            <label className="sm:col-span-4 text-[11px] text-gray-700">
              <span className="font-semibold">Phạm vi</span>
              <select
                value={newRow.applies_to}
                onChange={(e) => setNewRow((p) => ({ ...p, applies_to: e.target.value }))}
                className="mt-0.5 w-full border border-gray-200 rounded-lg px-2 py-2 text-sm bg-white"
              >
                {appliesOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </label>
            <div className="sm:col-span-3">
              <button
                type="button"
                onClick={addType}
                className={`w-full h-9 ${btn} text-white rounded-lg text-sm font-medium flex items-center justify-center gap-1.5 cursor-pointer`}
              >
                <Plus className="h-3.5 w-3.5" /> Thêm loại
              </button>
            </div>
          </div>

          {types.length === 0 ? (
            <p className="text-sm text-gray-500">Chưa có loại nào. Thêm ở trên hoặc dùng chung nhiều công ty qua tài khoản admin.</p>
          ) : (
            <ul className="space-y-2">
              {types.map((t) => (
                <li
                  key={t.id}
                  className={`flex flex-wrap items-center gap-2 p-2 rounded-lg border border-gray-100 hover:border-gray-200 ${!t.is_active ? 'opacity-50' : ''}`}
                >
                  <input
                    value={t.name || ''}
                    onChange={(e) => setTypes((prev) => prev.map((x) => (x.id === t.id ? { ...x, name: e.target.value } : x)))}
                    className="flex-1 min-w-[160px] border border-gray-200 rounded-lg px-2 py-1.5 text-sm"
                  />
                  <select
                    value={t.applies_to || 'both'}
                    onChange={(e) => setTypes((prev) => prev.map((x) => (x.id === t.id ? { ...x, applies_to: e.target.value } : x)))}
                    className="border border-gray-200 rounded-lg px-2 py-1.5 text-sm bg-white w-44"
                  >
                    {appliesOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    {t.applies_to && !appliesOptions.some((o) => o.value === t.applies_to) && (
                      <option value={t.applies_to}>{t.applies_to}</option>
                    )}
                  </select>
                  <input
                    type="number"
                    value={t.order_index ?? 0}
                    onChange={(e) => setTypes((prev) => prev.map((x) => (x.id === t.id ? { ...x, order_index: parseInt(e.target.value, 10) || 0 } : x)))}
                    className="w-16 border border-gray-200 rounded-lg px-1 py-1.5 text-sm"
                    title="Thứ tự"
                  />
                  <label className="flex items-center gap-1.5 text-[11px] text-gray-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={t.is_active !== false}
                      onChange={(e) => setTypes((prev) => prev.map((x) => (x.id === t.id ? { ...x, is_active: e.target.checked } : x)))}
                    />
                    Hiện
                  </label>
                  <button
                    type="button"
                    onClick={() => saveType(t)}
                    disabled={savingId === t.id}
                    className={`h-8 px-2 rounded-lg text-xs font-medium flex items-center gap-1 border ${border} ${accent === 'orange' ? 'text-orange-800' : 'text-teal-800'} hover:bg-gray-50 cursor-pointer disabled:opacity-50`}
                  >
                    {savingId === t.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                    Lưu
                  </button>
                  <button
                    type="button"
                    onClick={() => delType(t)}
                    className="h-8 px-2 rounded-lg text-xs text-red-600 hover:bg-red-50 flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <input
                    value={t.description || ''}
                    onChange={(e) => setTypes((prev) => prev.map((x) => (x.id === t.id ? { ...x, description: e.target.value } : x)))}
                    placeholder="Mô tả / gợi ý (hiện ở bước chuyển CRM sang Sản xuất)…"
                    className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-gray-600"
                  />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
