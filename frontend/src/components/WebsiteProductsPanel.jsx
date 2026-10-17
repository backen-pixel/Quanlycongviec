import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../lib/api';
import { useAuth } from '../lib/auth';

/**
 * Quản lý mẫu tủ bếp hiển thị trên website bán hàng (bảng web_products).
 * Website là static site riêng, đọc qua GET /api/public/web/products?company_id=...
 *
 * Đây KHÔNG phải trang /products (danh mục thành phẩm nội bộ cho báo giá/sản xuất).
 */

const FORM_RONG = {
  name: '',
  slug: '',
  category: '',
  material: '',
  price_from: '',
  price_unit: 'm dài',
  size_text: '',
  description: '',
  features: '',
  images: '',
  color_from: '#d6c3a5',
  color_to: '#3f3a35',
  is_featured: false,
  is_published: true,
  order_index: 0,
};

const dinhDangGia = (v) => new Intl.NumberFormat('vi-VN').format(Number(v) || 0) + '₫';

export default function WebsiteProductsPanel() {
  const { user } = useAuth();
  const laAdminHeThong = user?.role === 'admin' && !user?.company_id;

  const [companies, setCompanies] = useState([]);
  const [companyId, setCompanyId] = useState(user?.company_id || '');
  const [items, setItems] = useState([]);
  const [dangTai, setDangTai] = useState(false);
  const [canMigration, setCanMigration] = useState(false);
  const [loi, setLoi] = useState('');
  const [timKiem, setTimKiem] = useState('');
  const [form, setForm] = useState(null); // null = đóng form
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
      const r = await api.get('/marketing-web/products', { params: companyId ? { company_id: companyId } : {} });
      setItems(r.data?.items || []);
      setCanMigration(!!r.data?.migration_required);
    } catch (e) {
      setLoi(e?.response?.data?.error || 'Không tải được danh sách sản phẩm website.');
      setItems([]);
    } finally {
      setDangTai(false);
    }
  }, [companyId, laAdminHeThong]);

  useEffect(() => {
    taiDanhSach();
  }, [taiDanhSach]);

  const ketQua = useMemo(() => {
    const kw = timKiem.trim().toLowerCase();
    if (!kw) return items;
    return items.filter((sp) => `${sp.name} ${sp.category || ''} ${sp.material || ''}`.toLowerCase().includes(kw));
  }, [items, timKiem]);

  const moThem = () => setForm({ ...FORM_RONG, order_index: items.length });

  const moSua = (sp) =>
    setForm({
      id: sp.id,
      name: sp.name || '',
      slug: sp.slug || '',
      category: sp.category || '',
      material: sp.material || '',
      price_from: sp.price_from ?? '',
      price_unit: sp.price_unit || 'm dài',
      size_text: sp.size_text || '',
      description: sp.description || '',
      features: (sp.features || []).join('\n'),
      images: (sp.images || []).join('\n'),
      color_from: sp.color_from || '#d6c3a5',
      color_to: sp.color_to || '#3f3a35',
      is_featured: !!sp.is_featured,
      is_published: sp.is_published !== false,
      order_index: sp.order_index ?? 0,
    });

  const luu = async (e) => {
    e.preventDefault();
    if (!form?.name.trim()) {
      setLoi('Nhập tên sản phẩm trước đã.');
      return;
    }
    setDangLuu(true);
    setLoi('');
    const body = { ...form, company_id: companyId || undefined };
    try {
      if (form.id) await api.put(`/marketing-web/products/${form.id}`, body);
      else await api.post('/marketing-web/products', body);
      setForm(null);
      await taiDanhSach();
    } catch (e2) {
      setLoi(e2?.response?.data?.error || 'Lưu không thành công.');
    } finally {
      setDangLuu(false);
    }
  };

  const xoa = async (sp) => {
    if (!window.confirm(`Xóa "${sp.name}" khỏi website? Thao tác này không hoàn tác được.`)) return;
    try {
      await api.delete(`/marketing-web/products/${sp.id}`);
      await taiDanhSach();
    } catch (e) {
      setLoi(e?.response?.data?.error || 'Xóa không thành công.');
    }
  };

  const batTat = async (sp, truong) => {
    try {
      await api.put(`/marketing-web/products/${sp.id}`, {
        ...sp,
        features: sp.features || [],
        images: sp.images || [],
        [truong]: !sp[truong],
        company_id: companyId || undefined,
      });
      await taiDanhSach();
    } catch (e) {
      setLoi(e?.response?.data?.error || 'Cập nhật không thành công.');
    }
  };

  return (
    <div className="space-y-4">
      {/* Thanh công cụ */}
      <div className="flex flex-wrap items-center gap-3">
        {laAdminHeThong && (
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">— Chọn công ty sở hữu website —</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.short_name || c.name}
              </option>
            ))}
          </select>
        )}
        <input
          value={timKiem}
          onChange={(e) => setTimKiem(e.target.value)}
          placeholder="Tìm theo tên, kiểu bếp, vật liệu…"
          className="min-w-56 flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={moThem}
          disabled={laAdminHeThong && !companyId}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          + Thêm mẫu
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
          <strong>Chưa tạo bảng dữ liệu.</strong> Chạy <code>database/727_web_products.sql</code> rồi tải lại trang.
          Trước khi chạy, website vẫn hiển thị bằng dữ liệu tĩnh sẵn có nên không ai thấy trang trắng.
        </div>
      )}

      {loi && <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">{loi}</div>}

      {companyId && (
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-600">
          Website đọc dữ liệu qua: <code className="rounded bg-white px-1.5 py-0.5">/api/public/web/products?company_id={companyId}</code>
          <span className="ml-2">— đặt giá trị này vào biến <code>VITE_COMPANY_ID</code> của site bepviet.</span>
        </div>
      )}

      {/* Bảng */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="p-3 w-14">TT</th>
              <th className="p-3">Tên mẫu</th>
              <th className="p-3">Kiểu bếp</th>
              <th className="p-3">Vật liệu</th>
              <th className="p-3 text-right">Giá từ</th>
              <th className="p-3 text-center">Nổi bật</th>
              <th className="p-3 text-center">Hiển thị</th>
              <th className="p-3 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {dangTai && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-gray-500">
                  Đang tải…
                </td>
              </tr>
            )}
            {!dangTai && ketQua.length === 0 && (
              <tr>
                <td colSpan={8} className="p-6 text-center text-gray-500">
                  {laAdminHeThong && !companyId
                    ? 'Chọn công ty sở hữu website để bắt đầu.'
                    : 'Chưa có mẫu nào. Bấm "Thêm mẫu" để tạo mẫu đầu tiên.'}
                </td>
              </tr>
            )}
            {!dangTai &&
              ketQua.map((sp) => (
                <tr key={sp.id} className={sp.is_published ? '' : 'bg-gray-50/60 text-gray-400'}>
                  <td className="p-3 text-gray-500">{sp.order_index}</td>
                  <td className="p-3">
                    <div className="font-medium text-gray-900">{sp.name}</div>
                    <div className="text-xs text-gray-500">/{sp.slug}</div>
                  </td>
                  <td className="p-3">{sp.category || '—'}</td>
                  <td className="p-3">{sp.material || '—'}</td>
                  <td className="p-3 text-right font-semibold text-emerald-600">
                    {dinhDangGia(sp.price_from)}
                    <span className="ml-1 text-xs font-normal text-gray-500">/ {sp.price_unit}</span>
                  </td>
                  <td className="p-3 text-center">
                    <button type="button" onClick={() => batTat(sp, 'is_featured')} title="Bật/tắt khối Bán chạy">
                      {sp.is_featured ? '⭐' : '☆'}
                    </button>
                  </td>
                  <td className="p-3 text-center">
                    <button
                      type="button"
                      onClick={() => batTat(sp, 'is_published')}
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        sp.is_published ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-200 text-gray-600'
                      }`}
                    >
                      {sp.is_published ? 'Đang hiện' : 'Đang ẩn'}
                    </button>
                  </td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <button type="button" onClick={() => moSua(sp)} className="text-blue-600 hover:underline">
                      Sửa
                    </button>
                    <button type="button" onClick={() => xoa(sp)} className="ml-3 text-red-600 hover:underline">
                      Xóa
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {/* Form thêm/sửa */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation" onClick={() => setForm(null)}>
          <form
            onSubmit={luu}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"
          >
            <h3 className="text-lg font-bold text-gray-900">{form.id ? 'Sửa mẫu' : 'Thêm mẫu mới'}</h3>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <O nhan="Tên mẫu *">
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={oInput} />
              </O>
              <O nhan="Slug (bỏ trống = tự sinh từ tên)">
                <input value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} className={oInput} />
              </O>
              <O nhan="Kiểu bếp">
                <input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  placeholder="Tủ bếp chữ L"
                  className={oInput}
                />
              </O>
              <O nhan="Vật liệu">
                <input
                  value={form.material}
                  onChange={(e) => setForm({ ...form, material: e.target.value })}
                  placeholder="Acrylic bóng gương"
                  className={oInput}
                />
              </O>
              <O nhan="Giá từ (VNĐ)">
                <input
                  type="number"
                  min="0"
                  value={form.price_from}
                  onChange={(e) => setForm({ ...form, price_from: e.target.value })}
                  className={oInput}
                />
              </O>
              <O nhan="Đơn vị giá">
                <input
                  value={form.price_unit}
                  onChange={(e) => setForm({ ...form, price_unit: e.target.value })}
                  placeholder="m dài"
                  className={oInput}
                />
              </O>
              <O nhan="Kích thước mẫu">
                <input
                  value={form.size_text}
                  onChange={(e) => setForm({ ...form, size_text: e.target.value })}
                  placeholder="Dài 3.2m + 1.8m · Cao 2.4m"
                  className={oInput}
                />
              </O>
              <O nhan="Thứ tự hiển thị">
                <input
                  type="number"
                  value={form.order_index}
                  onChange={(e) => setForm({ ...form, order_index: e.target.value })}
                  className={oInput}
                />
              </O>

              <div className="sm:col-span-2">
                <O nhan="Mô tả">
                  <textarea
                    rows={3}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                    className={oInput}
                  />
                </O>
              </div>
              <O nhan="Tiện ích — mỗi dòng một ý">
                <textarea
                  rows={4}
                  value={form.features}
                  onChange={(e) => setForm({ ...form, features: e.target.value })}
                  placeholder={'Ray giảm chấn Blum\nBảo hành 5 năm'}
                  className={oInput}
                />
              </O>
              <O nhan="Ảnh — mỗi dòng một URL">
                <textarea
                  rows={4}
                  value={form.images}
                  onChange={(e) => setForm({ ...form, images: e.target.value })}
                  placeholder="https://…/anh-1.jpg"
                  className={oInput}
                />
              </O>

              <O nhan="Màu nền thay ảnh (đậm dần)">
                <div className="flex gap-2">
                  <input
                    type="color"
                    value={form.color_from}
                    onChange={(e) => setForm({ ...form, color_from: e.target.value })}
                    className="h-9 w-16 rounded border border-gray-300"
                  />
                  <input
                    type="color"
                    value={form.color_to}
                    onChange={(e) => setForm({ ...form, color_to: e.target.value })}
                    className="h-9 w-16 rounded border border-gray-300"
                  />
                  <span className="self-center text-xs text-gray-500">Dùng khi chưa có ảnh thật</span>
                </div>
              </O>
              <div className="flex items-end gap-5">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_featured}
                    onChange={(e) => setForm({ ...form, is_featured: e.target.checked })}
                  />
                  Nổi bật ở trang chủ
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={form.is_published}
                    onChange={(e) => setForm({ ...form, is_published: e.target.checked })}
                  />
                  Hiển thị trên web
                </label>
              </div>
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setForm(null)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
              >
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
