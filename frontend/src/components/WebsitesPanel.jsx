import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';
import { useAuth } from '../lib/auth';

/**
 * Module Marketing → danh sách website do công ty vận hành (bảng web_sites).
 * Mỗi website có một `site_key`; site tĩnh đặt VITE_SITE_KEY bằng giá trị đó
 * rồi gọi /api/public/web/products?site=<site_key>.
 */

const FORM_RONG = { name: '', site_key: '', domain: '', description: '', is_active: true };

export default function WebsitesPanel() {
  const { user } = useAuth();
  const laAdminHeThong = user?.role === 'admin' && !user?.company_id;

  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(user?.company_id || '');
  const [items, setItems] = useState([]);
  const [dangTai, setDangTai] = useState(false);
  const [canMigration, setCanMigration] = useState(false);
  const [loi, setLoi] = useState('');
  const [form, setForm] = useState(null);
  const [dangLuu, setDangLuu] = useState(false);

  useEffect(() => {
    if (!laAdminHeThong) return;
    api
      .get('/companies')
      .then((r) => setCompanies(r.data?.companies || r.data || []))
      .catch(() => setCompanies([]));
  }, [laAdminHeThong]);

  const taiDanhSach = useCallback(async () => {
    if (laAdminHeThong && !companyId) {
      setItems([]);
      return;
    }
    setDangTai(true);
    setLoi('');
    try {
      const r = await api.get('/marketing-web/sites', { params: companyId ? { company_id: companyId } : {} });
      setItems(r.data?.items || []);
      setCanMigration(!!r.data?.migration_required);
    } catch (e) {
      setLoi(e?.response?.data?.error || 'Không tải được danh sách website.');
      setItems([]);
    } finally {
      setDangTai(false);
    }
  }, [companyId, laAdminHeThong]);

  useEffect(() => {
    taiDanhSach();
  }, [taiDanhSach]);

  const luu = async (e) => {
    e.preventDefault();
    if (!form?.name.trim()) {
      setLoi('Nhập tên website trước đã.');
      return;
    }
    setDangLuu(true);
    setLoi('');
    const body = { ...form, company_id: companyId || undefined };
    try {
      if (form.id) await api.put(`/marketing-web/sites/${form.id}`, body);
      else await api.post('/marketing-web/sites', body);
      setForm(null);
      await taiDanhSach();
    } catch (e2) {
      setLoi(e2?.response?.data?.error || 'Lưu không thành công.');
    } finally {
      setDangLuu(false);
    }
  };

  const xoa = async (site, force = false) => {
    if (!force && !window.confirm(`Xóa website "${site.name}"?`)) return;
    try {
      await api.delete(`/marketing-web/sites/${site.id}`, { params: force ? { force: 1 } : {} });
      await taiDanhSach();
    } catch (e) {
      const data = e?.response?.data;
      // Backend chặn lần đầu nếu site còn sản phẩm — hỏi lại cho người dùng biết mất gì.
      if (data?.need_force && window.confirm(`${data.error}\n\nVẫn xóa?`)) {
        return xoa(site, true);
      }
      setLoi(data?.error || 'Xóa không thành công.');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        {laAdminHeThong && (
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">— Chọn công ty —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.short_name || c.name}
              </option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={() => setForm({ ...FORM_RONG })}
          disabled={laAdminHeThong && !companyId}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          + Thêm website
        </button>
        <button
          type="button"
          onClick={taiDanhSach}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
        >
          Tải lại
        </button>
      </div>

      {canMigration && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <strong>Chưa tạo bảng dữ liệu website.</strong> Chạy <code>database/728_web_sites.sql</code> rồi tải lại trang.
        </div>
      )}

      {loi && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{loi}</div>}

      <div className="grid gap-4 md:grid-cols-2">
        {dangTai && <p className="text-sm text-gray-500">Đang tải…</p>}
        {!dangTai && items.length === 0 && (
          <p className="text-sm text-gray-500">
            {laAdminHeThong && !companyId ? 'Chọn công ty để xem website.' : 'Chưa có website nào. Bấm "Thêm website".'}
          </p>
        )}
        {!dangTai &&
          items.map((site) => (
            <article
              key={site.id}
              className={`rounded-xl border bg-white p-5 shadow-sm ${site.is_active ? 'border-gray-200' : 'border-gray-200 opacity-60'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="truncate text-base font-semibold text-gray-900">{site.name}</h3>
                  <p className="mt-0.5 text-xs text-gray-500">
                    Mã site: <code className="rounded bg-gray-100 px-1.5 py-0.5">{site.site_key}</code>
                  </p>
                  {site.domain && (
                    <a
                      href={`https://${site.domain}`}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-1 inline-block text-xs text-blue-600 hover:underline"
                    >
                      {site.domain} ↗
                    </a>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                    site.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-200 text-gray-600'
                  }`}
                >
                  {site.is_active ? 'Đang chạy' : 'Tạm tắt'}
                </span>
              </div>

              {site.description && <p className="mt-3 text-sm text-gray-600">{site.description}</p>}

              <div className="mt-4 rounded-lg bg-gray-50 p-3 text-xs text-gray-600">
                Site tĩnh cấu hình: <code className="rounded bg-white px-1.5 py-0.5">VITE_SITE_KEY={site.site_key}</code>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
                <Link
                  to={`/marketing/san-pham-web?site=${site.id}`}
                  className="rounded-lg bg-gray-900 px-3 py-1.5 font-medium text-white hover:bg-gray-700"
                >
                  Sản phẩm của site
                </Link>
                <button
                  type="button"
                  onClick={() =>
                    setForm({
                      id: site.id,
                      name: site.name || '',
                      site_key: site.site_key || '',
                      domain: site.domain || '',
                      description: site.description || '',
                      is_active: site.is_active !== false,
                    })
                  }
                  className="text-blue-600 hover:underline"
                >
                  Sửa
                </button>
                <button type="button" onClick={() => xoa(site)} className="text-red-600 hover:underline">
                  Xóa
                </button>
              </div>
            </article>
          ))}
      </div>

      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onClick={() => setForm(null)}>
          <form
            onSubmit={luu}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
          >
            <h3 className="text-lg font-bold text-gray-900">{form.id ? 'Sửa website' : 'Thêm website'}</h3>

            <div className="mt-5 space-y-4">
              <O nhan="Tên website *">
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Bếp Việt" className={oInput} />
              </O>
              <O nhan="Mã site (bỏ trống = tự sinh từ tên)">
                <input
                  value={form.site_key}
                  onChange={(e) => setForm({ ...form, site_key: e.target.value })}
                  placeholder="bepviet"
                  className={oInput}
                />
                <span className="mt-1 block text-xs text-gray-500">
                  Duy nhất toàn hệ thống. Website gọi API bằng mã này, đổi mã là website phải cấu hình lại.
                </span>
              </O>
              <O nhan="Tên miền">
                <input
                  value={form.domain}
                  onChange={(e) => setForm({ ...form, domain: e.target.value })}
                  placeholder="bepviet-web.onrender.com"
                  className={oInput}
                />
              </O>
              <O nhan="Ghi chú">
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className={oInput}
                />
              </O>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                />
                Đang chạy (tắt = API công khai của site trả rỗng)
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setForm(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50">
                Hủy
              </button>
              <button
                type="submit"
                disabled={dangLuu}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {dangLuu ? 'Đang lưu…' : 'Lưu'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

const oInput = 'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-blue-500';

function O({ nhan, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">{nhan}</span>
      {children}
    </label>
  );
}
