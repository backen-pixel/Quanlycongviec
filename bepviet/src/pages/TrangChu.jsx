import { Link } from 'react-router-dom';
import TheSanPham from '../components/TheSanPham';
import { SAN_PHAM, QUY_TRINH, CAM_KET, DANH_MUC } from '../data/sanPham';
import { THONG_TIN } from '../data/thongTin';

export default function TrangChu() {
  const noiBat = SAN_PHAM.filter((sp) => sp.noiBat).slice(0, 3);

  return (
    <>
      {/* Hero */}
      <section className="relative overflow-hidden bg-stone-900 text-white">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute -left-20 top-10 h-72 w-72 rounded-full bg-amber-500 blur-3xl" />
          <div className="absolute bottom-0 right-0 h-80 w-80 rounded-full bg-stone-600 blur-3xl" />
        </div>
        <div className="relative mx-auto grid max-w-6xl gap-10 px-5 py-20 md:grid-cols-2 md:items-center md:py-28">
          <div>
            <p className="inline-flex rounded-full border border-amber-400/40 bg-amber-400/10 px-4 py-1 text-xs font-semibold uppercase tracking-wider text-amber-300">
              Xưởng sản xuất trực tiếp
            </p>
            <h1 className="mt-5 text-4xl font-bold leading-tight md:text-5xl">
              Tủ bếp đẹp, bền, <span className="text-amber-400">đúng kích thước</span> căn bếp của bạn
            </h1>
            <p className="mt-5 max-w-lg text-stone-300">
              Thiết kế 3D miễn phí, báo giá chi tiết trong 24 giờ, thi công trọn gói và bảo hành đến 10 năm.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/san-pham"
                className="rounded-xl bg-amber-500 px-6 py-3 text-sm font-semibold text-white transition hover:bg-amber-600"
              >
                Xem mẫu tủ bếp
              </Link>
              <Link
                to="/lien-he"
                className="rounded-xl border border-white/30 px-6 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                Nhận báo giá
              </Link>
            </div>
            <dl className="mt-12 grid max-w-md grid-cols-3 gap-6 border-t border-white/10 pt-6">
              <div>
                <dt className="text-xs text-stone-400">Kinh nghiệm</dt>
                <dd className="text-2xl font-bold">{THONG_TIN.soNam}+ năm</dd>
              </div>
              <div>
                <dt className="text-xs text-stone-400">Công trình</dt>
                <dd className="text-2xl font-bold">{THONG_TIN.soCongTrinh}+</dd>
              </div>
              <div>
                <dt className="text-xs text-stone-400">Bảo hành</dt>
                <dd className="text-2xl font-bold">5–10 năm</dd>
              </div>
            </dl>
          </div>

          <div className="relative">
            <div className="rotate-1 rounded-3xl bg-gradient-to-br from-amber-200 to-stone-600 p-3 shadow-2xl">
              <div className="rounded-2xl bg-stone-50 p-5">
                <p className="text-sm font-semibold text-stone-900">Báo giá nhanh theo mét dài</p>
                <ul className="mt-4 space-y-3 text-sm text-stone-700">
                  {DANH_MUC.slice(0, 4).map((d) => {
                    const re = SAN_PHAM.filter((s) => s.danhMuc === d.id);
                    const min = Math.min(...re.map((s) => s.gia));
                    return (
                      <li key={d.id} className="flex items-center justify-between border-b border-stone-200 pb-2">
                        <span>{d.ten}</span>
                        <span className="font-semibold text-stone-900">
                          từ {new Intl.NumberFormat('vi-VN').format(min)}₫
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <Link
                  to="/lien-he"
                  className="mt-5 block rounded-xl bg-stone-900 py-3 text-center text-sm font-semibold text-white transition hover:bg-amber-600"
                >
                  Gửi kích thước — nhận báo giá
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Cam kết */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {CAM_KET.map((c) => (
            <div key={c.ten} className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
              <p className="text-base font-semibold text-stone-900">{c.ten}</p>
              <p className="mt-2 text-sm leading-relaxed text-stone-600">{c.mo}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Sản phẩm nổi bật */}
      <section className="mx-auto max-w-6xl px-5 pb-16">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-stone-900 md:text-3xl">Mẫu tủ bếp bán chạy</h2>
            <p className="mt-2 text-stone-600">Những bố cục được khách hàng chọn nhiều nhất trong năm nay.</p>
          </div>
          <Link to="/san-pham" className="text-sm font-semibold text-amber-700 hover:underline">
            Xem tất cả sản phẩm →
          </Link>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {noiBat.map((sp) => (
            <TheSanPham key={sp.id} sp={sp} />
          ))}
        </div>
      </section>

      {/* Quy trình */}
      <section className="bg-white py-16">
        <div className="mx-auto max-w-6xl px-5">
          <h2 className="text-2xl font-bold text-stone-900 md:text-3xl">Quy trình 4 bước</h2>
          <p className="mt-2 text-stone-600">Minh bạch từ lúc khảo sát đến khi bàn giao.</p>
          <ol className="mt-10 grid gap-6 md:grid-cols-4">
            {QUY_TRINH.map((q) => (
              <li key={q.b} className="relative rounded-2xl bg-stone-50 p-6">
                <span className="text-3xl font-bold text-amber-500">{q.b}</span>
                <p className="mt-3 font-semibold text-stone-900">{q.ten}</p>
                <p className="mt-2 text-sm leading-relaxed text-stone-600">{q.mo}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-5 py-16">
        <div className="rounded-3xl bg-stone-900 px-8 py-12 text-center text-white md:px-16">
          <h2 className="text-2xl font-bold md:text-3xl">Bạn đã có kích thước căn bếp?</h2>
          <p className="mx-auto mt-3 max-w-xl text-stone-300">
            Gửi bản vẽ hoặc số đo, đội thiết kế sẽ dựng 3D và báo giá chi tiết trong 24 giờ làm việc.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              to="/lien-he"
              className="rounded-xl bg-amber-500 px-6 py-3 text-sm font-semibold transition hover:bg-amber-600"
            >
              Nhận báo giá miễn phí
            </Link>
            <a
              href={`tel:${THONG_TIN.hotline.replace(/\s/g, '')}`}
              className="rounded-xl border border-white/30 px-6 py-3 text-sm font-semibold transition hover:bg-white/10"
            >
              Gọi {THONG_TIN.hotline}
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
