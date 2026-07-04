import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Home, Globe, ChevronDown, Bell, Check, ChevronRight, HelpCircle, Send,
} from 'lucide-react';
import ModulesHeroScene from '../components/login/ModulesHeroScene';
import { preloadModuleIconsFromModules } from '../lib/moduleIconPreload';
import {
  UPCOMING_MODULES,
  MODULE_CATEGORIES,
  MODULE_FAQ,
  HERO_SCENE_ICONS,
  filterModules,
} from '../data/upcomingModules';

function SiteHeader() {
  const nav = ['Trang chủ', 'Tính năng', 'Bảng giá', 'Giới thiệu', 'Liên hệ'];
  return (
    <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0a1322]/95 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between gap-4">
        <Link to="/login" className="flex items-center gap-2.5 shrink-0">
          <div className="h-9 w-9 rounded-xl flex items-center justify-center bg-gradient-to-br from-[#f17a3a] to-[#ea5a23]">
            <Home className="h-4 w-4 text-white" />
          </div>
          <span className="text-lg font-bold text-white">TuBep Pro</span>
        </Link>

        <nav className="hidden lg:flex items-center gap-6 text-sm text-white/75">
          {nav.map((item) => (
            <button key={item} type="button" className="hover:text-white transition">
              {item}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2 shrink-0">
          <button type="button" className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-full text-xs text-white/80 border border-white/15 hover:bg-white/10 transition">
            <Globe className="h-3.5 w-3.5" />
            Tiếng Việt
            <ChevronDown className="h-3 w-3 opacity-60" />
          </button>
          <Link
            to="/login"
            className="h-9 px-4 rounded-full text-sm font-medium text-white border border-white/30 hover:bg-white/10 transition"
          >
            Đăng nhập
          </Link>
        </div>
      </div>
    </header>
  );
}

function HeroVisual() {
  return (
    <ModulesHeroScene className="hidden lg:block w-full max-w-[540px] xl:max-w-[580px] shrink-0 aspect-[16/10] max-h-[320px]" />
  );
}

function ModuleCardIcon({ mod }) {
  if (mod.iconUrl) {
    return (
      <div className="h-14 w-14 mb-1 shrink-0 flex items-center justify-center">
        <img
          src={mod.iconUrl}
          alt=""
          draggable={false}
          className="h-14 w-14 object-contain drop-shadow-md module-brand-icon-ready"
        />
      </div>
    );
  }
  const Icon = mod.Icon;
  return (
    <div
      className="h-14 w-14 rounded-2xl flex items-center justify-center mb-1 shrink-0"
      style={{ background: `${mod.color}14`, color: mod.color }}
    >
      {Icon ? <Icon className="h-7 w-7" strokeWidth={1.75} /> : null}
    </div>
  );
}

function ModuleCard({ mod }) {
  const topBadge = mod.badge === 'bestSeller'
    ? { label: 'BEST SELLER', className: 'bg-orange-500 text-white' }
    : mod.badge === 'new'
      ? { label: 'Mới', className: 'bg-emerald-500 text-white' }
      : { label: 'Sắp ra mắt', className: 'bg-orange-50 text-orange-600 border border-orange-100' };

  return (
    <article className="relative flex flex-col rounded-2xl border border-slate-100 bg-white p-5 shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-200">
      {mod.badge === 'bestSeller' && (
        <span className="absolute -top-2.5 left-4 px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wide bg-orange-500 text-white shadow-sm">
          Best seller
        </span>
      )}
      <span className={`absolute top-4 right-4 text-[10px] font-semibold px-2 py-0.5 rounded-full ${topBadge.className}`}>
        {topBadge.label}
      </span>
      <ModuleCardIcon mod={mod} />
      <h3 className="text-base font-bold text-slate-900 pr-16">{mod.title}</h3>
      <p className="mt-1.5 text-xs leading-relaxed text-slate-500">{mod.description}</p>
      <ul className="mt-3 space-y-1.5 flex-1">
        {mod.features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-[11px] text-slate-600">
            <Check className="h-3.5 w-3.5 shrink-0 mt-0.5 text-orange-500" strokeWidth={2.5} />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 pt-3 border-t border-slate-100">
        <span className="text-lg font-bold" style={{ color: mod.color }}>{mod.price} đ</span>
        <span className="text-xs text-slate-400"> / tháng</span>
      </p>
    </article>
  );
}

export default function ModulesLandingPage() {
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState('featured');

  useEffect(() => {
    void preloadModuleIconsFromModules(UPCOMING_MODULES);
    void preloadModuleIconsFromModules(HERO_SCENE_ICONS.map((i) => ({ imageUrl: i.src })));
  }, []);

  const modules = useMemo(
    () => filterModules(UPCOMING_MODULES, category, sort),
    [category, sort],
  );

  const notify = () => {
    window.alert('Cảm ơn bạn! Chúng tôi sẽ thông báo khi các modun ra mắt.');
  };

  return (
    <div className="min-h-screen bg-[#f1f5f9]">
      <SiteHeader />

      {/* Hero */}
      <section
        className="relative overflow-hidden text-white"
        style={{ background: 'linear-gradient(135deg, #0d1726 0%, #131f33 55%, #0a1322 100%)' }}
      >
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage: 'linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px)',
            backgroundSize: '48px 48px',
          }}
        />
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-7 lg:py-9">
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6 lg:gap-8">
            <div className="max-w-lg">
              <h1 className="text-2xl sm:text-[1.65rem] lg:text-[1.85rem] font-bold leading-snug">
                <span className="text-white">Giới thiệu các </span>
                <span className="text-[#ea5a23]">Modun sắp được bán</span>
              </h1>
              <p className="mt-2 text-xs sm:text-sm text-white/60 leading-relaxed max-w-md">
                Khám phá hệ sinh thái modun mở rộng — giúp doanh nghiệp nội thất tăng trưởng,
                tối ưu vận hành và mở rộng quy mô linh hoạt theo từng giai đoạn.
              </p>
              <div
                className="mt-4 flex flex-col sm:flex-row sm:items-center gap-2.5 rounded-xl px-3 py-2.5 border border-white/10"
                style={{ background: 'rgba(30, 58, 95, 0.45)' }}
              >
                <div className="flex items-start gap-2 flex-1">
                  <Bell className="h-4 w-4 shrink-0 text-blue-300 mt-0.5" />
                  <p className="text-[11px] sm:text-xs text-white/75 leading-relaxed">
                    Các modun sẽ được ra mắt theo từng giai đoạn. Đăng ký để nhận thông báo sớm nhất!
                  </p>
                </div>
                <button
                  type="button"
                  onClick={notify}
                  className="inline-flex items-center justify-center gap-1 shrink-0 px-3 py-2 rounded-lg bg-blue-500 hover:bg-blue-600 text-xs font-semibold text-white transition cursor-pointer"
                >
                  Đăng ký nhận thông báo
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <HeroVisual />
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="sticky top-14 z-40 bg-[#f1f5f9] border-b border-slate-200/80 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide shrink-0">Danh mục</span>
            <div className="flex flex-wrap gap-2">
              {MODULE_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => setCategory(cat.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-medium transition cursor-pointer ${
                    category === cat.id
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'bg-white text-slate-600 border border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-500 shrink-0">
            Sắp xếp:
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="h-8 pl-2 pr-7 rounded-lg border border-slate-200 bg-white text-slate-700 text-xs focus:ring-2 focus:ring-blue-500"
            >
              <option value="featured">Nổi bật</option>
              <option value="price-asc">Giá thấp → cao</option>
              <option value="price-desc">Giá cao → thấp</option>
              <option value="name">Tên A → Z</option>
            </select>
          </label>
        </div>
      </section>

      {/* Grid */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 lg:gap-5">
          {modules.map((mod) => (
            <ModuleCard key={mod.id} mod={mod} />
          ))}
        </div>
        {modules.length === 0 && (
          <p className="text-center text-sm text-slate-500 py-12">Không có modun trong danh mục này.</p>
        )}
      </section>

      {/* FAQ + Newsletter */}
      <section className="border-t border-slate-200 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 lg:py-14">
          <div className="flex flex-col lg:flex-row gap-10 lg:gap-14">
            <div className="flex-1 min-w-0">
              <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900 mb-6">
                <HelpCircle className="h-6 w-6 text-blue-500" />
                Câu hỏi thường gặp
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                {MODULE_FAQ.map((item) => (
                  <div key={item.q}>
                    <h3 className="text-sm font-semibold text-slate-900">{item.q}</h3>
                    <p className="mt-1.5 text-xs text-slate-500 leading-relaxed">{item.a}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:w-80 shrink-0">
              <div className="rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-100 p-6 shadow-sm">
                <div className="h-12 w-12 rounded-full bg-blue-500 flex items-center justify-center mb-4">
                  <Send className="h-5 w-5 text-white" />
                </div>
                <h3 className="text-base font-bold text-slate-900">Đăng ký nhận thông báo</h3>
                <p className="mt-2 text-xs text-slate-500 leading-relaxed">
                  Nhận thông tin sớm về modun mới và ưu đãi ra mắt dành riêng cho khách hàng TuBep Pro.
                </p>
                <button
                  type="button"
                  onClick={notify}
                  className="mt-5 w-full inline-flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-sm font-semibold text-white transition cursor-pointer"
                >
                  Đăng ký ngay
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-[#f8fafc] py-6 text-center text-xs text-slate-400">
        © 2026 TuBep Pro · Phần mềm quản lý nội thất
      </footer>
    </div>
  );
}
