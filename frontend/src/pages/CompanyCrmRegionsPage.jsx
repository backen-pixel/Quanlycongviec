import { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';
import { isAdminLike } from '../lib/adminRole';
import Modal from '../components/Modal';
import { isCrmSystemAdmin, isCrmCompanyAdmin } from '../lib/crmAdminScope';
import { MapPin, Plus, Pencil, Building2, RefreshCw, ExternalLink } from 'lucide-react';

/**
 * Quản lý khu vực CRM theo công ty — CRUD qua /api/crm/company-regions.
 * Admin hệ thống: chọn công ty. Admin công ty: khóa một công ty.
 */
export default function CompanyCrmRegionsPage() {
  const { user } = useAuth();
  const systemAdmin = isCrmSystemAdmin(user);
  const companyAdmin = isCrmCompanyAdmin(user);
  const canMutate = isAdminLike(user);

  const [companies, setCompanies] = useState([]);
  const [divisions, setDivisions] = useState([]);
  const [lockedCompanyLabel, setLockedCompanyLabel] = useState('');
  const [filterCompany, setFilterCompany] = useState('');
  const [filterDivision, setFilterDivision] = useState('');
  const [regions, setRegions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editRow, setEditRow] = useState(null);

  const [form, setForm] = useState({ name: '', code: '', order_index: 0, division_unit_id: '', address: '', map_url: '' });

  const effectiveCompanyId = useMemo(() => {
    if (companyAdmin && user?.company_id) return String(user.company_id);
    return filterCompany ? String(filterCompany) : '';
  }, [companyAdmin, user?.company_id, filterCompany]);

  const loadCompanies = useCallback(() => {
    if (!systemAdmin) return;
    api
      .get('/companies', { params: { for_module: 'crm' } })
      .then((r) => {
        const list = r.data?.companies || r.data || [];
        setCompanies(Array.isArray(list) ? list : []);
      })
      .catch(() => setCompanies([]));
  }, [systemAdmin]);

  const loadDivisions = useCallback(() => {
    api
      .get('/ecosystem/units?level=1')
      .then((r) => setDivisions(r.data?.units || []))
      .catch(() => setDivisions([]));
  }, []);

  const loadRegions = useCallback(() => {
    if (!effectiveCompanyId) {
      setRegions([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    api
      .get('/crm/company-regions', { params: { company_id: effectiveCompanyId, division_unit_id: filterDivision || undefined } })
      .then((r) => {
        const list = Array.isArray(r.data) ? r.data : [];
        setRegions(list);
      })
      .catch(() => setRegions([]))
      .finally(() => setLoading(false));
  }, [effectiveCompanyId, filterDivision]);

  useEffect(() => {
    loadCompanies();
  }, [loadCompanies]);

  useEffect(() => {
    loadDivisions();
  }, [loadDivisions]);

  useEffect(() => {
    if (companyAdmin && user?.company_id) {
      setFilterCompany(String(user.company_id));
    }
  }, [companyAdmin, user?.company_id]);

  useEffect(() => {
    if (!effectiveCompanyId) {
      setFilterDivision('');
      return;
    }
    api
      .get(`/companies/${effectiveCompanyId}`)
      .then((r) => {
        const c = r.data?.company;
        const primary = c?.primary_division_unit_id || c?.division_unit_id || '';
        setFilterDivision((prev) => prev || primary || '');
      })
      .catch(() => {});
  }, [effectiveCompanyId]);

  useEffect(() => {
    if (!companyAdmin || !user?.company_id) {
      setLockedCompanyLabel('');
      return;
    }
    api
      .get(`/companies/${user.company_id}`)
      .then((r) => {
        const c = r.data?.company || r.data;
        setLockedCompanyLabel(c?.short_name || c?.name || '');
      })
      .catch(() => setLockedCompanyLabel(''));
  }, [companyAdmin, user?.company_id]);

  useEffect(() => {
    loadRegions();
  }, [loadRegions]);

  const openCreate = () => {
    setEditRow(null);
    setForm({
      name: '',
      code: '',
      order_index: (regions?.length || 0) * 10,
      division_unit_id: filterDivision || '',
      address: '',
      map_url: '',
    });
    setShowModal(true);
  };

  const openEdit = (row) => {
    setEditRow(row);
    setForm({
      name: row.name || '',
      code: row.code || '',
      order_index: row.order_index ?? 0,
      division_unit_id: row.division_unit_id || '',
      address: row.address || '',
      map_url: row.map_url || '',
    });
    setShowModal(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (!effectiveCompanyId) return alert('Chọn công ty');
    if (!form.name?.trim()) return alert('Nhập tên khu vực');
    if (!canMutate) return;
    setSaving(true);
    try {
      if (editRow) {
        await api.patch(`/crm/company-regions/${editRow.id}`, {
          name: form.name.trim(),
          code: form.code?.trim() || null,
          order_index: Number(form.order_index) || 0,
          division_unit_id: form.division_unit_id || null,
          address: form.address?.trim() || null,
          map_url: form.map_url?.trim() || null,
        });
      } else {
        await api.post('/crm/company-regions', {
          company_id: effectiveCompanyId,
          name: form.name.trim(),
          code: form.code?.trim() || null,
          order_index: Number(form.order_index) || 0,
          division_unit_id: form.division_unit_id || null,
          address: form.address?.trim() || null,
          map_url: form.map_url?.trim() || null,
        });
      }
      setShowModal(false);
      loadRegions();
    } catch (err) {
      alert(err.response?.data?.error || 'Không lưu được');
    }
    setSaving(false);
  };

  const toggleActive = async (row) => {
    if (!canMutate) return;
    const next = !row.is_active;
    if (!confirm(next ? `Bật khu vực «${row.name}»?` : `Ẩn khu vực «${row.name}»? (lead cũ giữ nguyên)`)) return;
    setSaving(true);
    try {
      await api.patch(`/crm/company-regions/${row.id}`, { is_active: next });
      loadRegions();
    } catch (err) {
      alert(err.response?.data?.error || 'Lỗi');
    }
    setSaving(false);
  };

  return (
    <div className="space-y-5 max-w-4xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <MapPin className="h-7 w-7 text-blue-600" />
            Quản lý khu vực
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Khu vực / chi nhánh CRM theo từng công ty — dùng khi phân lead, deal và nhân viên (
            <span className="text-gray-700">module Công việc</span>
            ).
          </p>
        </div>
        <button
          type="button"
          onClick={loadRegions}
          className="h-9 px-3 border border-gray-200 rounded-lg text-sm flex items-center gap-2 hover:bg-gray-50"
        >
          <RefreshCw className="h-4 w-4" /> Tải lại
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap items-end gap-4">
        <div className="min-w-[240px] flex-1">
          <label className="text-xs font-semibold text-gray-600 flex items-center gap-1 mb-1">
            <Building2 className="h-3.5 w-3.5" /> Công ty
          </label>
          {companyAdmin ? (
            <div className="h-10 px-3 flex items-center rounded-lg border border-blue-100 bg-blue-50 text-sm text-blue-900">
              {lockedCompanyLabel || 'Công ty của bạn'}
            </div>
          ) : (
            <select
              value={filterCompany}
              onChange={(e) => setFilterCompany(e.target.value)}
              className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">— Chọn công ty —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.short_name || c.name}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="min-w-[240px] flex-1">
          <label className="text-xs font-semibold text-gray-600 flex items-center gap-1 mb-1">Khối</label>
          <select
            value={filterDivision}
            onChange={(e) => setFilterDivision(e.target.value)}
            className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm"
            disabled={!effectiveCompanyId}
          >
            <option value="">— Chọn khối —</option>
            {divisions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.level?.icon} {d.name}
              </option>
            ))}
          </select>
        </div>
        {canMutate && effectiveCompanyId && (
          <button
            type="button"
            onClick={openCreate}
            className="h-10 px-4 bg-blue-600 text-white rounded-lg text-sm font-medium flex items-center gap-2 hover:bg-blue-700"
          >
            <Plus className="h-4 w-4" /> Thêm khu vực
          </button>
        )}
      </div>

      {!effectiveCompanyId && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Chọn công ty để xem danh sách khu vực.
        </p>
      )}

      {!canMutate && (
        <p className="text-sm text-gray-600 bg-gray-50 border rounded-lg px-3 py-2">
          Bạn chỉ xem danh sách. Chỉ <strong>admin</strong> (hệ thống hoặc công ty) thêm / sửa / ẩn khu vực.
        </p>
      )}

      {effectiveCompanyId && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="flex justify-center py-16">
              <div className="animate-spin h-8 w-8 border-2 border-gray-200 border-t-blue-600 rounded-full" />
            </div>
          ) : regions.length === 0 ? (
            <div className="text-center py-14 text-gray-400 text-sm">
              <MapPin className="h-10 w-10 mx-auto mb-2 opacity-30" />
              Chưa có khu vực. {canMutate ? 'Bấm «Thêm khu vực».' : ''}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b text-left text-xs font-semibold text-gray-600 uppercase">
                    <th className="py-3 px-4">Tên</th>
                    <th className="py-3 px-4 w-24">Mã</th>
                    <th className="py-3 px-4">Địa chỉ chi nhánh</th>
                    <th className="py-3 px-4 w-24">Thứ tự</th>
                    <th className="py-3 px-4 w-28">Trạng thái</th>
                    <th className="py-3 px-4 w-40 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {regions.map((r) => (
                    <tr key={r.id} className="border-b border-gray-100 hover:bg-gray-50/80">
                      <td className="py-3 px-4 font-medium text-gray-900">{r.name}</td>
                      <td className="py-3 px-4 text-gray-600">{r.code || '—'}</td>
                      <td className="py-3 px-4 text-gray-600">
                        <div className="min-w-[220px] max-w-[420px]">
                          <p className="truncate">{r.address || '—'}</p>
                          {r.map_url ? (
                            <a
                              href={r.map_url}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-blue-600 hover:text-blue-800"
                            >
                              <ExternalLink className="h-3 w-3" /> Mở bản đồ
                            </a>
                          ) : null}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-gray-600">{r.order_index ?? 0}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-full ${
                            r.is_active !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200 text-gray-600'
                          }`}
                        >
                          {r.is_active !== false ? 'Đang dùng' : 'Đã ẩn'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right space-x-2">
                        {canMutate && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEdit(r)}
                              disabled={saving}
                              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                            >
                              <Pencil className="h-3.5 w-3.5" /> Sửa
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleActive(r)}
                              disabled={saving}
                              className="text-xs text-gray-600 hover:text-gray-900 font-medium"
                            >
                              {r.is_active !== false ? 'Ẩn' : 'Bật'}
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <Modal
        open={showModal}
        onClose={() => !saving && setShowModal(false)}
        title={editRow ? 'Sửa khu vực' : 'Thêm khu vực'}
        size="md"
      >
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tên khu vực *</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm"
              placeholder="VD: Chi nhánh Hà Nội"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Mã (tùy chọn)</label>
            <input
              value={form.code}
              onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
              className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm"
              placeholder="VD: HN"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Địa chỉ chi nhánh</label>
            <input
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm"
              placeholder="VD: 123 Nguyễn Văn Linh, Q.7, TP.HCM"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Link bản đồ (tùy chọn)</label>
            <input
              value={form.map_url}
              onChange={(e) => setForm((f) => ({ ...f, map_url: e.target.value }))}
              className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm"
              placeholder="https://maps.google.com/?q=..."
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Thứ tự hiển thị</label>
            <input
              type="number"
              value={form.order_index}
              onChange={(e) => setForm((f) => ({ ...f, order_index: e.target.value }))}
              className="w-full h-10 px-3 border border-gray-300 rounded-lg text-sm"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="h-10 px-4 rounded-lg border border-gray-200 text-sm"
              disabled={saving}
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving}
              className="h-10 px-5 rounded-lg bg-blue-600 text-white text-sm font-medium disabled:opacity-50"
            >
              {saving ? 'Đang lưu…' : 'Lưu'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
