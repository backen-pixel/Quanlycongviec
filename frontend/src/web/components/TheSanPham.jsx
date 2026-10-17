import AnhSanPham from './AnhSanPham';
import { dinhDangGia, tenDanhMuc, tenVatLieu } from '../data/sanPham';

export default function TheSanPham({ sp, onXem }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
      <div className="relative">
        <AnhSanPham sp={sp} className="transition duration-500 group-hover:scale-105" />
        {sp.noiBat && (
          <span className="absolute left-3 top-3 rounded-full bg-amber-500 px-3 py-1 text-xs font-semibold text-white shadow">
            Bán chạy
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <p className="text-xs font-medium uppercase tracking-wide text-amber-700">{tenDanhMuc(sp.danhMuc)}</p>
        <h3 className="text-lg font-semibold text-stone-900">{sp.ten}</h3>
        <p className="line-clamp-2 text-sm text-stone-600">{sp.moTa}</p>
        <p className="mt-1 text-sm text-stone-500">{tenVatLieu(sp.vatLieu)}</p>
        <div className="mt-auto flex items-end justify-between pt-4">
          <div>
            <p className="text-xs text-stone-500">Giá từ</p>
            <p className="text-xl font-bold text-stone-900">
              {dinhDangGia(sp.gia)}
              <span className="ml-1 text-sm font-normal text-stone-500">/ {sp.donVi}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => onXem?.(sp)}
            className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600"
          >
            Xem nhanh
          </button>
        </div>
      </div>
    </article>
  );
}
