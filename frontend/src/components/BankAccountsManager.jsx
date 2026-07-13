import { useCallback, useEffect, useState } from 'react';
import {
  Plus, Save, Trash2, Star, Loader2, RefreshCw, MapPin,
} from 'lucide-react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAccountingUser } from '../lib/crossWorkshopProduction';

const EMPTY = {
  bank_name: '',
  account_number: '',
  account_holder: '',
  branch: '',
  is_default: false,
  region_id: '',
};

/**
 * Quản lý tài khoản NH của công ty kế toán — logic dùng chung cho trang riêng
 * (/ketoan/bank-accounts) và popup mở nhanh từ chi tiết deal.
 * Chia theo công ty (client_company_id) + khu vực (region_id, tùy chọn — trống = dùng chung mọi khu vực).
 */
export default function BankAccountsManager({ onChanged, initialRegionId, initialRegionName }) {
  const { user } = useAuth();
  const [accounts, setAccounts] = useState([]);
  const [regions, setRegions] = useState([]);
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [regionFilter, setRegionFilter] = useState(initialRegionId || '');

  const clientCompanyId = isAccountingUser(user) ? user?.company_id : null;
  const adminParams = !isAccountingUser(user) && clientCompanyId
    ? { client_company_id: clientCompanyId }
    : {};

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = { ...adminParams };
      if (!isAccountingUser(user) && user?.company_id) {
        params.client_company_id = user.company_id;
      }
      const [accRes, regRes] = await Promise.all([
        api.get('/accounting/bank-accounts', { params }),
        api.get('/accounting/regions', { params }),
      ]);
      setAccounts(accRes.data.accounts || []);
      setCompany(accRes.data.client_company || null);
      setRegions(regRes.data.regions || []);
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Lỗi tải tài khoản');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const visibleAccounts = regionFilter
    ? accounts.filter((a) => !a.region_id || a.region_id === regionFilter)
    : accounts;

  const resetForm = () => {
    setForm(EMPTY);
    setEditingId(null);
  };

  const startEdit = (a) => {
    setEditingId(a.id);
    setForm({
      bank_name: a.bank_name || '',
      account_number: a.account_number || '',
      account_holder: a.account_holder || '',
      branch: a.branch || '',
      is_default: !!a.is_default,
      region_id: a.region_id || '',
    });
  };

  const save = async () => {
    if (!form.bank_name.trim() || !form.account_number.trim()) {
      alert('Nhập tên ngân hàng và số tài khoản');
      return;
    }
    setSaving(true);
    try {
      const params = {};
      if (!isAccountingUser(user) && (user?.company_id || company?.id)) {
        params.client_company_id = user?.company_id || company?.id;
      }
      const body = {
        bank_name: form.bank_name.trim(),
        account_number: form.account_number.trim(),
        account_holder: form.account_holder.trim() || null,
        branch: form.branch.trim() || null,
        is_default: !!form.is_default,
        is_active: true,
        region_id: form.region_id || null,
      };
      if (editingId) {
        await api.put(`/accounting/bank-accounts/${editingId}`, body, { params });
      } else {
        await api.post('/accounting/bank-accounts', body, { params });
      }
      resetForm();
      await load();
      onChanged?.();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi lưu');
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (id) => {
    if (!confirm('Ngưng dùng tài khoản này?')) return;
    try {
      const params = {};
      if (!isAccountingUser(user) && (user?.company_id || company?.id)) {
        params.client_company_id = user?.company_id || company?.id;
      }
      await api.delete(`/accounting/bank-accounts/${id}`, { params });
      if (editingId === id) resetForm();
      await load();
      onChanged?.();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi xóa');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-gray-500">
          {company?.name || company?.short_name || 'Công ty kế toán'}
          {initialRegionName && (
            <> · deal đang ở khu vực <span className="font-semibold text-gray-700">{initialRegionName}</span></>
          )}
          {' '}— dùng khi ghi nhận chuyển khoản theo giai đoạn
        </p>
        <div className="flex items-center gap-2 shrink-0">
          {regions.length > 0 && (
            <select
              value={regionFilter}
              onChange={(e) => setRegionFilter(e.target.value)}
              className="h-8 px-2 rounded-lg border border-gray-200 text-xs bg-white cursor-pointer"
              title="Lọc STK theo khu vực"
            >
              <option value="">Tất cả khu vực</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={load}
            className="h-8 px-3 rounded-lg border border-gray-200 text-xs flex items-center gap-1.5 hover:bg-gray-50 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Tải lại
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="bg-gray-50 rounded-xl border border-gray-200 p-4 space-y-3">
        <h2 className="text-sm font-bold text-gray-800">
          {editingId ? 'Sửa tài khoản' : 'Thêm tài khoản'}
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-600">Ngân hàng *</label>
            <input
              className="mt-1 w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white"
              value={form.bank_name}
              onChange={(e) => setForm((f) => ({ ...f, bank_name: e.target.value }))}
              placeholder="VD: Vietcombank"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Số tài khoản *</label>
            <input
              className="mt-1 w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white"
              value={form.account_number}
              onChange={(e) => setForm((f) => ({ ...f, account_number: e.target.value }))}
              placeholder="STK"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Chủ tài khoản</label>
            <input
              className="mt-1 w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white"
              value={form.account_holder}
              onChange={(e) => setForm((f) => ({ ...f, account_holder: e.target.value }))}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-600">Chi nhánh</label>
            <input
              className="mt-1 w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white"
              value={form.branch}
              onChange={(e) => setForm((f) => ({ ...f, branch: e.target.value }))}
            />
          </div>
          {regions.length > 0 && (
            <div>
              <label className="text-xs font-medium text-gray-600 flex items-center gap-1">
                <MapPin className="h-3 w-3" /> Khu vực
              </label>
              <select
                className="mt-1 w-full h-9 px-3 rounded-lg border border-gray-200 text-sm bg-white cursor-pointer"
                value={form.region_id}
                onChange={(e) => setForm((f) => ({ ...f, region_id: e.target.value }))}
              >
                <option value="">— Dùng chung mọi khu vực —</option>
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_default}
            onChange={(e) => setForm((f) => ({ ...f, is_default: e.target.checked }))}
          />
          Đặt làm mặc định
        </label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="h-9 px-4 rounded-lg bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editingId ? <Save className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {editingId ? 'Lưu' : 'Thêm'}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className="h-9 px-3 rounded-lg border text-sm cursor-pointer hover:bg-white bg-white">
              Hủy
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 text-left text-[11px] font-bold uppercase text-gray-500">
              <th className="py-2.5 px-3">Ngân hàng</th>
              <th className="py-2.5 px-3">STK</th>
              <th className="py-2.5 px-3">Chủ TK</th>
              <th className="py-2.5 px-3">Chi nhánh</th>
              <th className="py-2.5 px-3">Khu vực</th>
              <th className="py-2.5 px-3 w-28" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr><td colSpan={6} className="py-10 text-center text-gray-400">Đang tải...</td></tr>
            )}
            {!loading && visibleAccounts.length === 0 && (
              <tr><td colSpan={6} className="py-10 text-center text-gray-400">Chưa có tài khoản nào</td></tr>
            )}
            {!loading && visibleAccounts.map((a) => (
              <tr key={a.id} className={!a.is_active ? 'opacity-50' : ''}>
                <td className="py-3 px-3 font-medium text-gray-900">
                  {a.bank_name}
                  {a.is_default && (
                    <span className="ml-2 inline-flex items-center gap-0.5 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                      <Star className="h-3 w-3" /> Mặc định
                    </span>
                  )}
                  {!a.is_active && (
                    <span className="ml-2 text-[10px] text-gray-400">Ngưng</span>
                  )}
                </td>
                <td className="py-3 px-3 font-mono tabular-nums">{a.account_number}</td>
                <td className="py-3 px-3 text-gray-700">{a.account_holder || '—'}</td>
                <td className="py-3 px-3 text-gray-500">{a.branch || '—'}</td>
                <td className="py-3 px-3">
                  {a.region?.name ? (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded-full">
                      <MapPin className="h-3 w-3" /> {a.region.name}
                    </span>
                  ) : (
                    <span className="text-[11px] text-gray-400">Chung</span>
                  )}
                </td>
                <td className="py-3 px-3">
                  <div className="flex gap-1 justify-end">
                    {a.is_active && (
                      <>
                        <button type="button" onClick={() => startEdit(a)} className="px-2 py-1 text-xs font-medium text-teal-700 hover:bg-teal-50 rounded cursor-pointer">Sửa</button>
                        <button type="button" onClick={() => deactivate(a.id)} className="p-1.5 text-red-500 hover:bg-red-50 rounded cursor-pointer" title="Ngưng dùng">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
