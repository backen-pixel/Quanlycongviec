import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import TheSanPham from '../components/TheSanPham';
import AnhSanPham from '../components/AnhSanPham';
import { dinhDangGia } from '../data/sanPham';
import { useCatalog } from '../lib/useCatalog';

const MUC_GIA = [
  { id: 'tat-ca', ten: 'Mọi mức giá', loc: () => true },
  { id: 'duoi-20', ten: 'Dưới 20 triệu', loc: (sp) => sp.gia < 20000000 },
  { id: '20-35', ten: '20 – 35 triệu', loc: (sp) => sp.gia >= 20000000 && sp.gia <= 35000000 },
  { id: 'tren-35', ten: 'Trên 35 triệu', loc: (sp) => sp.gia > 35000000 },
];

const SAP_XEP = [
  { id: 'mac-dinh', ten: 'Mặc định' },
  { id: 'gia-tang', ten: 'Giá thấp → cao' },
  { id: 'gia-giam', ten: 'Giá cao → thấp' },
];

export default function SanPham() {
  const { sanPham: SAN_PHAM, danhMuc: DANH_MUC, vatLieu: VAT_LIEU } = useCatalog();
  const [danhMuc, setDanhMuc] = useState('tat-ca');
  const [vatLieu, setVatLieu] = useState('tat-ca');
  const [mucGia, setMucGia] = useState('tat-ca');
  const [sapXep, setSapXep] = useState('mac-dinh');
  const [tuKhoa, setTuKhoa] = useState('');
  const [xem, setXem] = useState(null);

  const ketQua = useMemo(() => {
    const locGia = MUC_GIA.find((m) => m.id === mucGia)?.loc || (() => true);
    const kw = tuKhoa.trim().toLowerCase();
    let ds = SAN_PHAM.filter(
      (sp) =>
        (danhMuc === 'tat-ca' || sp.danhMuc === danhMuc) &&
        (vatLieu === 'tat-ca' || sp.vatLieu === vatLieu) &&
        locGia(sp) &&
        (!kw || `${sp.ten} ${sp.moTa}`.toLowerCase().includes(kw)),
    );
    if (sapXep === 'gia-tang') ds = [...ds].sort((a, b) => a.gia - b.gia);
    if (sapXep === 'gia-giam') ds = [...ds].sort((a, b) => b.gia - a.gia);
    return ds;
  }, [SAN_PHAM, danhMuc, vatLieu, mucGia, sapXep, tuKhoa]);

  const datLai = () => {
    setDanhMuc('tat-ca');
    setVatLieu('tat-ca');
    setMucGia('tat-ca');
    setSapXep('mac-dinh');
    setTuKhoa('');
  };

  return (
    <>
      <section className="border-b border-stone-200 bg-white">
        <div className="mx-auto max-w-6xl px-5 py-12">
          <h1 className="text-3xl font-bold text-stone-900 md:text-4xl">Mẫu tủ bếp</h1>
          <p className="mt-3 max-w-2xl text-stone-600">
            Giá tham khảo theo mét dài, đã gồm thùng tủ, cánh và phụ kiện cơ bản. Giá cuối phụ thuộc kích thước thực tế
            và lựa chọn vật liệu.
          </p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-8">
        {/* Bộ lọc */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-4">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">Tìm kiếm</span>
              <input
                value={tuKhoa}
                onChange={(e) => setTuKhoa(e.target.value)}
                placeholder="Tên mẫu, phong cách…"
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-amber-500"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">Kiểu bếp</span>
              <select
                value={danhMuc}
                onChange={(e) => setDanhMuc(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-amber-500"
              >
                <option value="tat-ca">Tất cả kiểu</option>
                {DANH_MUC.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.ten}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">Vật liệu</span>
              <select
                value={vatLieu}
                onChange={(e) => setVatLieu(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-amber-500"
              >
                <option value="tat-ca">Tất cả vật liệu</option>
                {VAT_LIEU.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.ten}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-stone-500">Mức giá</span>
              <select
                value={mucGia}
                onChange={(e) => setMucGia(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-amber-500"
              >
                {MUC_GIA.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.ten}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-stone-200 pt-4">
            <p className="text-sm text-stone-600">
              <strong className="text-stone-900">{ketQua.length}</strong> mẫu phù hợp
            </p>
            <div className="flex items-center gap-3">
              <select
                value={sapXep}
                onChange={(e) => setSapXep(e.target.value)}
                className="rounded-lg border border-stone-300 px-3 py-2 text-sm outline-none focus:border-amber-500"
              >
                {SAP_XEP.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.ten}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={datLai}
                className="rounded-lg border border-stone-300 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-100"
              >
                Đặt lại
              </button>
            </div>
          </div>
        </div>

        {/* Lưới sản phẩm */}
        {ketQua.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-stone-300 bg-white py-16 text-center">
            <p className="font-semibold text-stone-900">Không có mẫu nào khớp bộ lọc</p>
            <p className="mt-2 text-sm text-stone-600">Thử bỏ bớt điều kiện hoặc liên hệ để được tư vấn mẫu riêng.</p>
            <button
              type="button"
              onClick={datLai}
              className="mt-5 rounded-lg bg-stone-900 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-600"
            >
              Xoá bộ lọc
            </button>
          </div>
        ) : (
          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {ketQua.map((sp) => (
              <TheSanPham key={sp.id} sp={sp} onXem={setXem} />
            ))}
          </div>
        )}
      </section>

      {/* Xem nhanh */}
      {xem && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-stone-900/60 backdrop-blur-sm sm:items-center sm:p-6"
          onClick={() => setXem(null)}
          role="presentation"
        >
          <div
            className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={xem.ten}
          >
            <div className="relative">
              <AnhSanPham sp={xem} tyLe="aspect-[16/9]" />
              <button
                type="button"
                onClick={() => setXem(null)}
                aria-label="Đóng"
                className="absolute right-3 top-3 rounded-full bg-white/90 px-3 py-1 text-sm font-semibold text-stone-700 shadow"
              >
                Đóng
              </button>
            </div>
            <div className="p-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">{xem.danhMucTen}</p>
              <h2 className="mt-1 text-2xl font-bold text-stone-900">{xem.ten}</h2>
              <p className="mt-3 text-stone-600">{xem.moTa}</p>

              <dl className="mt-6 grid gap-4 sm:grid-cols-3">
                <div className="rounded-xl bg-stone-50 p-4">
                  <dt className="text-xs text-stone-500">Giá tham khảo</dt>
                  <dd className="mt-1 font-semibold text-stone-900">
                    {dinhDangGia(xem.gia)} / {xem.donVi}
                  </dd>
                </div>
                <div className="rounded-xl bg-stone-50 p-4">
                  <dt className="text-xs text-stone-500">Vật liệu</dt>
                  <dd className="mt-1 font-semibold text-stone-900">{xem.vatLieuTen}</dd>
                </div>
                <div className="rounded-xl bg-stone-50 p-4">
                  <dt className="text-xs text-stone-500">Kích thước mẫu</dt>
                  <dd className="mt-1 font-semibold text-stone-900">{xem.kichThuoc}</dd>
                </div>
              </dl>

              <ul className="mt-6 flex flex-wrap gap-2">
                {xem.tienIch.map((t) => (
                  <li key={t} className="rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-800">
                    {t}
                  </li>
                ))}
              </ul>

              <Link
                to="/lien-he"
                state={{ sanPham: xem.ten }}
                className="mt-7 block rounded-xl bg-stone-900 py-3 text-center text-sm font-semibold text-white transition hover:bg-amber-600"
              >
                Yêu cầu báo giá mẫu này
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
