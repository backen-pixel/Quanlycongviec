import { useState, useEffect, useCallback } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { Tags, Plus, Pencil, Trash2, Building2, Globe } from 'lucide-react';
import { resolveDefaultCrmAdminCompanyId, setStoredCrmFilterCompanyId } from '../lib/crmCompanyFilter';

export default function CRMSourcesSettingsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState('');
  const [categories, setCategories] = useState([]);
  const [sources, setSources] = useState([]);
  const [loading, setLoading] = useState(false);

  const [catForm, setCatForm] = useState({ name: '', icon: '', color: '#64748b', companyScope: 'global' });
  const [srcForm, setSrcForm] = useState({ name: '', icon: '📎', color: '', category_id: '', companyScope: 'global' });
  const [editingCat, setEditingCat] = useState(null);
  const [editingSrc, setEditingSrc] = useState(null);

  useEffect(() => {
    api
      .get('/companies', { params: { for_module: 'crm' } })
      .then((r) => {
        const cos = r.data?.companies || r.data || [];
        const list = Array.isArray(cos) ? cos : [];
        setCompanies(list);
        const def = resolveDefaultCrmAdminCompanyId(list);
        if (def) setSelectedCompanyId(def);
        else setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const load = useCallback(async () => {
    if (!isAdmin || !selectedCompanyId) return;
    setLoading(true);
    try {
      const [catRes, srcRes] = await Promise.all([
        api.get('/crm/source-categories', {
          params: { company_id: selectedCompanyId, include_inactive: '1' },
        }),
        api.get('/crm/sources', {
          params: { company_id: selectedCompanyId, include_inactive: '1' },
        }),
      ]);
      setCategories(Array.isArray(catRes.data) ? catRes.data : catRes.data || []);
      setSources(srcRes.data?.sources || []);
    } catch {
      setCategories([]);
      setSources([]);
    } finally {
      setLoading(false);
    }
  }, [isAdmin, selectedCompanyId]);

  useEffect(() => {
    load();
  }, [load]);

  const companyLabel = (id) => {
    if (!id) return 'Chung toàn hệ thống';
    return companies.find((c) => String(c.id) === String(id))?.name || id;
  };

  const saveCategory = async (e) => {
    e?.preventDefault();
    const name = (editingCat ? editingCat.name : catForm.name).trim();
    if (!name) {
      alert('Nhập tên phân loại');
      return;
    }
    const scope = editingCat ? editingCat.companyScope : catForm.companyScope;
    if (scope === 'company' && !selectedCompanyId) {
      alert('Chọn công ty ở trên trước khi dùng phạm vi riêng công ty');
      return;
    }
    const company_id = scope === 'global' ? null : selectedCompanyId;
    const payload = {
      name,
      icon: (editingCat ? editingCat.icon : catForm.icon) || null,
      color: (editingCat ? editingCat.color : catForm.color) || null,
      company_id,
      is_active: editingCat ? editingCat.is_active !== false : true,
    };
    try {
      if (editingCat?.id) {
        await api.put(`/crm/source-categories/${editingCat.id}`, { ...payload, order_index: editingCat.order_index });
      } else {
        await api.post('/crm/source-categories', payload);
      }
      setCatForm({ name: '', icon: '', color: '#64748b', companyScope: 'global' });
      setEditingCat(null);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi lưu phân loại');
    }
  };

  const deleteCategory = async (id) => {
    if (!confirm('Xóa phân loại này?')) return;
    try {
      await api.delete(`/crm/source-categories/${id}`);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi xóa');
    }
  };

  const saveSource = async (e) => {
    e?.preventDefault();
    const name = (editingSrc ? editingSrc.name : srcForm.name).trim();
    if (!name) {
      alert('Nhập tên nguồn');
      return;
    }
    const scope = editingSrc ? editingSrc.companyScope : srcForm.companyScope;
    if (scope === 'company' && !selectedCompanyId) {
      alert('Chọn công ty trước khi dùng nguồn riêng công ty');
      return;
    }
    const company_id = scope === 'global' ? null : selectedCompanyId;
    const category_id = (editingSrc ? editingSrc.category_id : srcForm.category_id) || null;
    const payload = {
      name,
      icon: (editingSrc ? editingSrc.icon : srcForm.icon) || '📎',
      color: (editingSrc ? editingSrc.color : srcForm.color) || null,
      company_id,
      category_id,
      is_active: editingSrc ? editingSrc.is_active !== false : true,
    };
    try {
      if (editingSrc?.id) {
        await api.put(`/crm/sources/${editingSrc.id}`, payload);
      } else {
        await api.post('/crm/sources', payload);
      }
      setSrcForm({ name: '', icon: '📎', color: '', category_id: '', companyScope: 'global' });
      setEditingSrc(null);
      load();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi lưu nguồn');
    }
  };

  if (!isAdmin) {
    return (
      <div className="max-w-3xl mx-auto p-6 text-sm text-amber-700 bg-amber-50 rounded-xl border border-amber-200">
        Chỉ tài khoản admin mới quản lý nguồn và phân loại.
      </div>
    );
  }

  return (
    <div className="max-w-5xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Tags className="h-7 w-7 text-emerald-600" />
          Nguồn & phân loại
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Gắn <strong>phân loại</strong> (Online, Đối tác, …) cho từng <strong>nguồn</strong> lead. Nguồn chung cả hệ thống hoặc theo công ty (giống cột <code className="text-xs bg-gray-100 px-1 rounded">company_id</code> trên nguồn).
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3 bg-white border rounded-xl px-4 py-3">
        <Building2 className="h-4 w-4 text-gray-400" />
        <span className="text-sm font-medium text-gray-700">Công ty (lọc & tạo nguồn/phân loại riêng)</span>
        <select
          value={selectedCompanyId}
          onChange={(e) => {
            const v = e.target.value;
            setSelectedCompanyId(v);
            if (v) setStoredCrmFilterCompanyId(v);
          }}
          className="border rounded-lg px-3 py-2 text-sm min-w-[200px]"
        >
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-gray-500 w-full sm:w-auto sm:ml-2">
          Phân loại <strong>chung</strong> (🌐) vẫn hiện khi chọn bất kỳ công ty nào.
        </p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin h-8 w-8 border-2 border-emerald-600 border-t-transparent rounded-full" />
        </div>
      ) : (
        <>
          {/* Phân loại */}
          <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900 mb-3">Phân loại nguồn</h2>
            <form onSubmit={saveCategory} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 mb-4 items-end">
              <div>
                <label className="text-[10px] text-gray-500">Tên *</label>
                <input
                  value={editingCat ? editingCat.name : catForm.name}
                  onChange={(e) =>
                    editingCat
                      ? setEditingCat((c) => ({ ...c, name: e.target.value }))
                      : setCatForm((f) => ({ ...f, name: e.target.value }))
                  }
                  className="w-full border rounded-lg px-2 py-1.5 text-sm"
                  placeholder="VD: Quảng cáo trả phí"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500">Icon</label>
                <input
                  value={editingCat ? editingCat.icon || '' : catForm.icon}
                  onChange={(e) =>
                    editingCat
                      ? setEditingCat((c) => ({ ...c, icon: e.target.value }))
                      : setCatForm((f) => ({ ...f, icon: e.target.value }))
                  }
                  className="w-full border rounded-lg px-2 py-1.5 text-sm"
                  placeholder="📢"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500">Màu</label>
                <input
                  type="color"
                  value={editingCat ? editingCat.color || '#64748b' : catForm.color}
                  onChange={(e) =>
                    editingCat
                      ? setEditingCat((c) => ({ ...c, color: e.target.value }))
                      : setCatForm((f) => ({ ...f, color: e.target.value }))
                  }
                  className="w-full h-9 border rounded cursor-pointer"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500">Phạm vi</label>
                <select
                  value={editingCat ? editingCat.companyScope : catForm.companyScope}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (editingCat) setEditingCat((c) => ({ ...c, companyScope: v }));
                    else setCatForm((f) => ({ ...f, companyScope: v }));
                  }}
                  className="w-full border rounded-lg px-2 py-1.5 text-sm"
                >
                  <option value="global">Chung toàn hệ thống</option>
                  <option value="company" disabled={!selectedCompanyId}>
                    Riêng công ty đang chọn
                  </option>
                </select>
              </div>
              <div className="flex gap-2 lg:col-span-2">
                <button
                  type="submit"
                  className="h-9 px-4 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700"
                >
                  {editingCat ? 'Cập nhật' : <><Plus className="h-4 w-4 inline" /> Thêm</>}
                </button>
                {editingCat && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCat(null);
                      setCatForm({ name: '', icon: '', color: '#64748b', companyScope: 'global' });
                    }}
                    className="h-9 px-3 border rounded-lg text-sm"
                  >
                    Hủy sửa
                  </button>
                )}
              </div>
            </form>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase text-gray-500 border-b">
                    <th className="py-2 pr-2">Phân loại</th>
                    <th className="py-2 pr-2">Phạm vi</th>
                    <th className="py-2 pr-2">Thứ tự</th>
                    <th className="py-2 pr-2">Trạng thái</th>
                    <th className="py-2 w-24" />
                  </tr>
                </thead>
                <tbody>
                  {categories.map((c) => (
                    <tr key={c.id} className="border-b border-gray-100 hover:bg-slate-50/80">
                      <td className="py-2 pr-2">
                        <span className="mr-1">{c.icon || '·'}</span>
                        <span className="font-medium text-gray-900">{c.name}</span>
                      </td>
                      <td className="py-2 pr-2 text-xs text-gray-600">
                        {!c.company_id ? (
                          <span className="inline-flex items-center gap-1"><Globe className="h-3 w-3" /> Chung</span>
                        ) : (
                          <span>{companyLabel(c.company_id)}</span>
                        )}
                      </td>
                      <td className="py-2 pr-2 text-xs">{c.order_index}</td>
                      <td className="py-2 pr-2 text-xs">{c.is_active === false ? <span className="text-red-600">Tắt</span> : 'Hoạt động'}</td>
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() =>
                            setEditingCat({
                              id: c.id,
                              name: c.name,
                              icon: c.icon || '',
                              color: c.color || '#64748b',
                              order_index: c.order_index ?? 0,
                              is_active: c.is_active,
                              companyScope: c.company_id ? 'company' : 'global',
                            })
                          }
                          className="p-1.5 text-gray-500 hover:text-blue-600"
                          title="Sửa"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteCategory(c.id)}
                          className="p-1.5 text-gray-500 hover:text-red-600"
                          title="Xóa"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Nguồn */}
          <section className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
            <h2 className="text-sm font-bold text-gray-900 mb-3">Danh sách nguồn (crm_sources)</h2>
            <form onSubmit={saveSource} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-2 mb-4 items-end">
              <div>
                <label className="text-[10px] text-gray-500">Tên nguồn *</label>
                <input
                  value={editingSrc ? editingSrc.name : srcForm.name}
                  onChange={(e) =>
                    editingSrc
                      ? setEditingSrc((s) => ({ ...s, name: e.target.value }))
                      : setSrcForm((f) => ({ ...f, name: e.target.value }))
                  }
                  className="w-full border rounded-lg px-2 py-1.5 text-sm"
                  placeholder="Zalo OA, Showroom, …"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500">Phân loại</label>
                <select
                  value={editingSrc ? editingSrc.category_id || '' : srcForm.category_id}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (editingSrc) setEditingSrc((s) => ({ ...s, category_id: v }));
                    else setSrcForm((f) => ({ ...f, category_id: v }));
                  }}
                  className="w-full border rounded-lg px-2 py-1.5 text-sm"
                >
                  <option value="">— Chưa gán phân loại —</option>
                  {categories
                    .filter((x) => x.is_active !== false)
                    .map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.icon || ''} {x.name}
                        {!x.company_id ? ' (chung)' : ''}
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label className="text-[10px] text-gray-500">Icon</label>
                <input
                  value={editingSrc ? editingSrc.icon || '' : srcForm.icon}
                  onChange={(e) =>
                    editingSrc
                      ? setEditingSrc((s) => ({ ...s, icon: e.target.value }))
                      : setSrcForm((f) => ({ ...f, icon: e.target.value }))
                  }
                  className="w-full border rounded-lg px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="text-[10px] text-gray-500">Phạm vi nguồn</label>
                <select
                  value={editingSrc ? editingSrc.companyScope : srcForm.companyScope}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (editingSrc) setEditingSrc((s) => ({ ...s, companyScope: v }));
                    else setSrcForm((f) => ({ ...f, companyScope: v }));
                  }}
                  className="w-full border rounded-lg px-2 py-1.5 text-sm"
                >
                  <option value="global">Chung toàn hệ thống</option>
                  <option value="company" disabled={!selectedCompanyId}>
                    Riêng công ty đang chọn
                  </option>
                </select>
              </div>
              <div className="flex gap-2 lg:col-span-2">
                <button
                  type="submit"
                  className="h-9 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                >
                  {editingSrc ? 'Cập nhật nguồn' : <><Plus className="h-4 w-4 inline" /> Thêm nguồn</>}
                </button>
                {editingSrc && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSrc(null);
                      setSrcForm({ name: '', icon: '📎', color: '', category_id: '', companyScope: 'global' });
                    }}
                    className="h-9 px-3 border rounded-lg text-sm"
                  >
                    Hủy sửa
                  </button>
                )}
              </div>
            </form>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[10px] uppercase text-gray-500 border-b">
                    <th className="py-2 pr-2">Nguồn</th>
                    <th className="py-2 pr-2">Phân loại</th>
                    <th className="py-2 pr-2">Phạm vi</th>
                    <th className="py-2 pr-2">Trạng thái</th>
                    <th className="py-2 w-20" />
                  </tr>
                </thead>
                <tbody>
                  {sources.map((s) => (
                    <tr key={s.id} className="border-b border-gray-100 hover:bg-slate-50/80">
                      <td className="py-2 pr-2">
                        <span className="mr-1">{s.icon || '·'}</span>
                        {s.name}
                      </td>
                      <td className="py-2 pr-2 text-xs text-gray-700">
                        {s.category ? (
                          <span>
                            {s.category.icon} {s.category.name}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="py-2 pr-2 text-xs">
                        {!s.company_id ? (
                          <span className="inline-flex items-center gap-1 text-gray-600">
                            <Globe className="h-3 w-3" /> Chung
                          </span>
                        ) : (
                          companyLabel(s.company_id)
                        )}
                      </td>
                      <td className="py-2 pr-2 text-xs">{s.is_active === false ? <span className="text-red-600">Tắt</span> : 'Hoạt động'}</td>
                      <td className="py-2">
                        <button
                          type="button"
                          onClick={() =>
                            setEditingSrc({
                              id: s.id,
                              name: s.name,
                              icon: s.icon || '',
                              color: s.color || '',
                              category_id: s.category_id || s.category?.id || '',
                              is_active: s.is_active,
                              companyScope: s.company_id ? 'company' : 'global',
                            })
                          }
                          className="p-1.5 text-gray-500 hover:text-blue-600"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
