import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { THONG_TIN } from './data/thongTin';

const MENU = [
  { to: '/', ten: 'Trang chủ', end: true },
  { to: '/san-pham', ten: 'Sản phẩm' },
  { to: '/lien-he', ten: 'Liên hệ' },
];

export default function WebLayout() {
  const [moMenu, setMoMenu] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    setMoMenu(false);
    window.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-800">
      <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3">
          <Link to="/" className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-stone-900 text-sm font-bold text-amber-400">BV</span>
            <span className="leading-tight">
              <span className="block text-base font-bold text-stone-900">{THONG_TIN.ten}</span>
              <span className="block text-xs text-stone-500">{THONG_TIN.slogan}</span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 md:flex">
            {MENU.map((m) => (
              <NavLink
                key={m.to}
                to={m.to}
                end={m.end}
                className={({ isActive }) =>
                  `rounded-lg px-4 py-2 text-sm font-medium transition ${
                    isActive ? 'bg-stone-900 text-white' : 'text-stone-700 hover:bg-stone-100'
                  }`
                }
              >
                {m.ten}
              </NavLink>
            ))}
            <a
              href={`tel:${THONG_TIN.hotline.replace(/\s/g, '')}`}
              className="ml-2 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-600"
            >
              {THONG_TIN.hotline}
            </a>
          </nav>

          <button
            type="button"
            onClick={() => setMoMenu((v) => !v)}
            aria-label="Mở menu"
            className="rounded-lg border border-stone-300 p-2 md:hidden"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 5h14M3 10h14M3 15h14" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {moMenu && (
          <nav className="border-t border-stone-200 bg-white px-5 py-3 md:hidden">
            {MENU.map((m) => (
              <NavLink
                key={m.to}
                to={m.to}
                end={m.end}
                className={({ isActive }) =>
                  `block rounded-lg px-3 py-2 text-sm font-medium ${
                    isActive ? 'bg-stone-900 text-white' : 'text-stone-700'
                  }`
                }
              >
                {m.ten}
              </NavLink>
            ))}
            <a
              href={`tel:${THONG_TIN.hotline.replace(/\s/g, '')}`}
              className="mt-2 block rounded-lg bg-amber-500 px-3 py-2 text-center text-sm font-semibold text-white"
            >
              Gọi {THONG_TIN.hotline}
            </a>
          </nav>
        )}
      </header>

      <main>
        <Outlet />
      </main>

      <footer className="mt-20 bg-stone-900 text-stone-300">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-3">
          <div>
            <p className="text-lg font-bold text-white">{THONG_TIN.ten}</p>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-stone-400">{THONG_TIN.gioiThieu}</p>
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-white">Liên hệ</p>
            <ul className="mt-4 space-y-2 text-sm">
              <li>Hotline: {THONG_TIN.hotline}</li>
              <li>Email: {THONG_TIN.email}</li>
              <li>Xưởng: {THONG_TIN.diaChiXuong}</li>
              <li>Showroom: {THONG_TIN.diaChiShowroom}</li>
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-white">Chuyên mục</p>
            <ul className="mt-4 space-y-2 text-sm">
              {MENU.map((m) => (
                <li key={m.to}>
                  <Link to={m.to} className="transition hover:text-amber-400">
                    {m.ten}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
        <div className="border-t border-stone-800 py-5 text-center text-xs text-stone-500">
          © {new Date().getFullYear()} {THONG_TIN.ten}. Nội dung demo — cập nhật trong bepviet/src/data.
        </div>
      </footer>
    </div>
  );
}
