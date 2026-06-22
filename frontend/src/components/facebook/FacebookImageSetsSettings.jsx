/**
 * Cấu hình bộ ảnh gửi Facebook — tab Cài đặt Facebook.
 */
import { useCallback, useEffect, useState } from 'react';
import { FolderOpen, Image, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import api from '../../lib/api';
import {
  createFacebookImageSet,
  deleteFacebookImageSet,
  fetchFacebookImageSetsAdmin,
  updateFacebookImageSet,
} from '../../lib/facebookImageSets';
import { DriveFileThumbnail } from '../drive/DriveFileViews';
import DriveFolderPicker from '../drive/DriveFolderPicker';
import CompanyImagesDrivePanel from './CompanyImagesDrivePanel';

const emptyForm = () => ({
  name: '',
  description: '',
  drive_folder_id: '',
  drive_folder_name: '',
  company_id: '',
  sort_index: 0,
  is_active: true,
});

export default function FacebookImageSetsSettings() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [form, setForm] = useState(emptyForm());
  const [editingId, setEditingId] = useState(null);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [khoCompanyId, setKhoCompanyId] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchFacebookImageSetsAdmin();
      setItems(data?.items || []);
    } catch {
      setItems([]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    api.get('/companies', { params: { for_module: 'crm' } })
      .then((r) => {
        const list = r.data?.companies || r.data || [];
        setCompanies(list);
        if (list.length >= 1) {
          setKhoCompanyId((prev) => prev || list[0].id);
        }
      })
      .catch(() => setCompanies([]));
  }, [load]);

  const resetForm = () => {
    setForm(emptyForm());
    setEditingId(null);
  };

  const startEdit = (row) => {
    setEditingId(row.id);
    setForm({
      name: row.name || '',
      description: row.description || '',
      drive_folder_id: row.drive_folder_id || '',
      drive_folder_name: row.drive_folder?.name || '',
      company_id: row.company_id || '',
      sort_index: row.sort_index || 0,
      is_active: row.is_active !== false,
    });
  };

  const submit = async () => {
    const name = form.name.trim();
    if (!name || !form.drive_folder_id) {
      alert('Cần tên bộ và thư mục Drive');
      return;
    }
    setSaving(true);
    try {
      const body = {
        name,
        description: form.description.trim() || null,
        drive_folder_id: form.drive_folder_id,
        company_id: form.company_id || null,
        sort_index: Number(form.sort_index) || 0,
        is_active: form.is_active,
      };
      if (editingId) await updateFacebookImageSet(editingId, body);
      else await createFacebookImageSet(body);
      resetForm();
      await load();
    } catch (e) {
      alert(e.response?.data?.error || e.message || 'Lỗi lưu');
    }
    setSaving(false);
  };

  const remove = async (id) => {
    if (!window.confirm('Xóa bộ ảnh này?')) return;
    try {
      await deleteFacebookImageSet(id);
      if (editingId === id) resetForm();
      await load();
    } catch (e) {
      alert(e.response?.data?.error || 'Lỗi xóa');
    }
  };

  return (
    <div className="mt-8 border-t border-gray-200 pt-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Image className="h-4 w-4 text-blue-600" />
            Bộ ảnh gửi Messenger
          </h3>
          <p className="text-xs text-gray-500 mt-1 max-w-2xl">
            Mỗi bộ gắn một thư mục Google Drive. Nhân viên chọn bộ trong Hộp thư hoặc tab Facebook của lead/deal để gửi toàn bộ ảnh trong thư mục cho khách.
          </p>
        </div>
      </div>

      <div className="mb-6 space-y-2">
        <label className="text-xs font-medium text-gray-700">Công ty — kho ảnh chung</label>
        <select
          value={khoCompanyId}
          onChange={(e) => setKhoCompanyId(e.target.value)}
          className="h-9 max-w-md px-3 text-sm border border-gray-200 rounded-lg bg-white"
        >
          <option value="">Chọn công ty…</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
          ))}
        </select>
        <CompanyImagesDrivePanel
          companyId={khoCompanyId || null}
          companyName={companies.find((c) => String(c.id) === String(khoCompanyId))?.short_name
            || companies.find((c) => String(c.id) === String(khoCompanyId))?.name}
        />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-6">
          <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          {items.length === 0 && (
            <p className="text-sm text-gray-400 py-4 text-center border border-dashed border-gray-200 rounded-lg">
              Chưa có bộ ảnh. Thêm bộ đầu tiên ở form bên dưới.
            </p>
          )}
          {items.map((row) => (
            <div
              key={row.id}
              className={`flex flex-wrap items-start gap-3 p-3 rounded-xl border ${
                editingId === row.id ? 'border-blue-300 bg-blue-50/40' : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex gap-1 shrink-0">
                {(row.preview_images || []).slice(0, 4).map((img) => (
                  <div key={img.id} className="w-10 h-10 rounded-md overflow-hidden bg-gray-100 border border-gray-200">
                    <DriveFileThumbnail file={img} className="w-full h-full object-cover" size={40} />
                  </div>
                ))}
                {!row.preview_images?.length && (
                  <div className="w-10 h-10 rounded-md bg-gray-100 border border-dashed border-gray-300 flex items-center justify-center text-gray-400">
                    <Image className="h-4 w-4" />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-[180px]">
                <p className="text-sm font-semibold text-gray-900">{row.name}</p>
                {row.description && <p className="text-xs text-gray-500 mt-0.5">{row.description}</p>}
                <p className="text-[11px] text-gray-500 mt-1 flex items-center gap-1">
                  <FolderOpen className="h-3 w-3" />
                  {row.drive_folder?.name || 'Thư mục Drive'}
                  <span className="text-gray-400">·</span>
                  {row.image_count ?? 0} ảnh
                  {row.company?.short_name || row.company?.name ? (
                    <>
                      <span className="text-gray-400">·</span>
                      {row.company.short_name || row.company.name}
                    </>
                  ) : (
                    <>
                      <span className="text-gray-400">·</span>
                      Tất cả công ty
                    </>
                  )}
                  {!row.is_active && <span className="text-red-500">· Tắt</span>}
                </p>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={() => startEdit(row)}
                  className="h-8 px-2.5 text-xs rounded-lg border border-gray-200 hover:bg-gray-50 inline-flex items-center gap-1"
                >
                  <Pencil className="h-3.5 w-3.5" /> Sửa
                </button>
                <button
                  type="button"
                  onClick={() => remove(row.id)}
                  className="h-8 px-2.5 text-xs rounded-lg border border-red-100 text-red-600 hover:bg-red-50 inline-flex items-center gap-1"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Xóa
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-gray-50/80 p-4 space-y-3">
        <p className="text-xs font-semibold text-gray-700">
          {editingId ? 'Sửa bộ ảnh' : 'Thêm bộ ảnh mới'}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input
            value={form.name}
            onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            placeholder="Tên bộ (vd: Cửa gỗ cao cấp)"
            className="h-9 px-3 text-sm border border-gray-200 rounded-lg bg-white"
          />
          <select
            value={form.company_id}
            onChange={(e) => setForm((f) => ({ ...f, company_id: e.target.value }))}
            className="h-9 px-3 text-sm border border-gray-200 rounded-lg bg-white"
          >
            <option value="">Tất cả công ty</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
            ))}
          </select>
        </div>
        <textarea
          value={form.description}
          onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
          placeholder="Mô tả ngắn (tuỳ chọn)"
          rows={2}
          className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white resize-none"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFolderPicker(true)}
            className="h-9 px-3 text-sm rounded-lg border border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 inline-flex items-center gap-1.5"
            title={form.company_id ? 'Mở kho ảnh chung công ty đã chọn' : 'Chọn thư mục Drive'}
          >
            <FolderOpen className="h-4 w-4" />
            {form.drive_folder_name || (form.company_id ? 'Chọn từ kho ảnh công ty' : 'Chọn thư mục Drive')}
          </button>
          <input
            type="number"
            value={form.sort_index}
            onChange={(e) => setForm((f) => ({ ...f, sort_index: e.target.value }))}
            className="h-9 w-20 px-2 text-sm border border-gray-200 rounded-lg bg-white"
            title="Thứ tự hiển thị"
          />
          <label className="inline-flex items-center gap-1.5 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm((f) => ({ ...f, is_active: e.target.checked }))}
            />
            Đang bật
          </label>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="h-9 px-4 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 inline-flex items-center gap-1"
          >
            <Plus className="h-4 w-4" />
            {saving ? 'Đang lưu…' : editingId ? 'Cập nhật' : 'Thêm bộ'}
          </button>
          {editingId && (
            <button type="button" onClick={resetForm} className="h-9 px-3 text-sm rounded-lg bg-gray-100 hover:bg-gray-200">
              Hủy sửa
            </button>
          )}
        </div>
      </div>

      {showFolderPicker && (
        <DriveFolderPicker
          title="Chọn thư mục chứa ảnh (thư mục con trong kho ảnh)"
          companyId={form.company_id || khoCompanyId || null}
          onClose={() => setShowFolderPicker(false)}
          onPicked={(f) => {
            setForm((prev) => ({
              ...prev,
              drive_folder_id: f.id,
              drive_folder_name: f.name,
            }));
            setShowFolderPicker(false);
          }}
        />
      )}
    </div>
  );
}
