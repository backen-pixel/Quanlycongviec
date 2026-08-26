import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpRight,
  Bell,
  Building2,
  Check,
  ChevronDown,
  Command,
  Menu,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { useAuth } from '../lib/auth';
import { COMMANDS, OS_NAVIGATION, OS_SECONDARY_NAVIGATION } from './osConfig';

function NavItem({ item, onNavigate }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      end={item.to === '/business-os'}
      onClick={onNavigate}
      className={({ isActive }) => `group flex h-10 items-center gap-3 rounded-xl px-3 text-[13px] font-semibold transition ${
        isActive
          ? 'bg-white text-slate-950 shadow-[0_8px_30px_rgba(15,23,42,0.16)]'
          : 'text-slate-400 hover:bg-white/[0.06] hover:text-white'
      }`}
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.badge && (
        <span className="rounded-md bg-violet-500/20 px-1.5 py-0.5 text-[9px] font-extrabold tracking-wider text-violet-200">
          {item.badge}
        </span>
      )}
    </NavLink>
  );
}

function CommandPalette({ open, onClose }) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('vi-VN');
    if (!normalized) return COMMANDS;
    return COMMANDS.filter((item) => `${item.label} ${item.group}`.toLocaleLowerCase('vi-VN').includes(normalized));
  }, [query]);

  if (!open) return null;

  const choose = (to) => {
    navigate(to);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center bg-slate-950/55 px-4 pt-[10vh] backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Tìm kiếm và điều hướng">
      <button type="button" className="absolute inset-0 cursor-default" onClick={onClose} aria-label="Đóng" />
      <div className="relative w-full max-w-2xl overflow-hidden rounded-3xl border border-white/20 bg-white shadow-2xl">
        <div className="flex items-center gap-3 border-b border-slate-200 px-5">
          <Search className="h-5 w-5 text-slate-400" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') onClose();
              if (event.key === 'Enter' && results[0]) choose(results[0].to);
            }}
            placeholder="Tìm không gian, hồ sơ hoặc hành động…"
            className="h-16 min-w-0 flex-1 bg-transparent text-[15px] font-medium text-slate-950 outline-none placeholder:text-slate-400"
          />
          <span className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-500">ESC</span>
        </div>
        <div className="max-h-[56vh] overflow-y-auto p-2">
          {results.length ? results.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => choose(item.to)}
                className="flex w-full items-center gap-3 rounded-2xl px-3 py-3 text-left hover:bg-slate-100"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-slate-900">{item.label}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{item.group}</span>
                </span>
                <ArrowUpRight className="h-4 w-4 text-slate-400" />
              </button>
            );
          }) : (
            <div className="px-5 py-12 text-center text-sm text-slate-500">Không tìm thấy kết quả phù hợp.</div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-5 py-3 text-[11px] text-slate-500">
          <span>Tìm kiếm tuân theo quyền của người đăng nhập</span>
          <span className="font-semibold">Enter để mở</span>
        </div>
      </div>
    </div>
  );
}

function SidebarContent({ company, companies, selectedCompanyId, onCompanyChange, rolloutEnabled, allModulesEnabled, onNavigate }) {
  const [companyMenuOpen, setCompanyMenuOpen] = useState(false);
  const companyName = company?.short_name || company?.name || 'Doanh nghiệp';

  const navigateAndClose = () => {
    setCompanyMenuOpen(false);
    onNavigate?.();
  };

  return (
    <>
      <div className="flex h-[72px] items-center gap-3 border-b border-white/[0.07] px-5">
        <span className="relative flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-blue-500 via-indigo-500 to-violet-600 text-white shadow-lg shadow-blue-950/40">
          <span className="text-sm font-black tracking-tight">OS</span>
          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-emerald-300 ring-2 ring-indigo-600" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold tracking-tight text-white">Business OS</p>
          <p className="mt-0.5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">Tủ Bếp · vNext</p>
        </div>
      </div>

      <div className="relative px-3 py-3">
        <button
          type="button"
          onClick={() => setCompanyMenuOpen((open) => !open)}
          aria-expanded={companyMenuOpen}
          className="flex w-full items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.045] px-3 py-2.5 text-left hover:bg-white/[0.07]"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-slate-300">
            <Building2 className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-bold text-white">{companyName}</span>
            <span className="mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold text-slate-500">
              <span className={`h-1.5 w-1.5 rounded-full ${rolloutEnabled ? 'bg-emerald-400' : 'bg-slate-500'}`} />
              {allModulesEnabled ? 'Toàn bộ module đang mở' : rolloutEnabled ? 'Sales pilot đang hoạt động' : 'Chế độ quan sát'}
            </span>
          </span>
          <ChevronDown className={`h-4 w-4 text-slate-500 transition ${companyMenuOpen ? 'rotate-180' : ''}`} />
        </button>
        {companyMenuOpen && (
          <div className="absolute left-3 right-3 top-[72px] z-30 overflow-hidden rounded-2xl border border-white/10 bg-[#151b2d] p-1.5 shadow-2xl shadow-black/40">
            <p className="px-3 pb-2 pt-1.5 text-[9px] font-extrabold uppercase tracking-[0.16em] text-slate-500">Chọn công ty</p>
            <div className="max-h-64 space-y-1 overflow-y-auto">
              {companies?.length ? companies.map((item) => {
                const selected = String(item.id) === String(selectedCompanyId);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      onCompanyChange?.(item.id);
                      setCompanyMenuOpen(false);
                    }}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${selected ? 'bg-white/10 text-white' : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'}`}
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-black ${selected ? 'bg-blue-500 text-white' : 'bg-white/[0.06] text-slate-400'}`}>
                      {(item.short_name || item.name || 'CT').trim().slice(0, 2).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[11px] font-bold">{item.short_name || item.name}</span>
                      <span className="mt-0.5 block text-[9px] font-semibold text-slate-500">{item.business_os_pilot ? 'Pilot quy trình đang bật' : 'Dữ liệu thật · đúng phân quyền'}</span>
                    </span>
                    {selected && <Check className="h-4 w-4 shrink-0 text-emerald-400" />}
                  </button>
                );
              }) : (
                <p className="px-3 py-5 text-center text-[11px] text-slate-500">Chưa có công ty khả dụng</p>
              )}
            </div>
          </div>
        )}
      </div>

      <nav className="min-h-0 flex-1 space-y-1 overflow-y-auto px-3 pb-4">
        <p className="px-3 pb-1 pt-2 text-[9px] font-extrabold uppercase tracking-[0.18em] text-slate-600">Vận hành</p>
        {OS_NAVIGATION.map((item) => <NavItem key={item.key} item={item} onNavigate={navigateAndClose} />)}
        <p className="px-3 pb-1 pt-5 text-[9px] font-extrabold uppercase tracking-[0.18em] text-slate-600">Nền tảng</p>
        {OS_SECONDARY_NAVIGATION.map((item) => <NavItem key={item.key} item={item} onNavigate={navigateAndClose} />)}
      </nav>

      <div className="border-t border-white/[0.07] p-3">
        <Link
          to="/management"
          onClick={navigateAndClose}
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold text-slate-500 hover:bg-white/[0.05] hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" /> Hệ thống hiện tại
        </Link>
      </div>
    </>
  );
}

export default function BusinessOSShell({ company, companies, selectedCompanyId, onCompanyChange, rolloutEnabled, allModulesEnabled, children }) {
  const location = useLocation();
  const { user } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setCommandOpen(true);
      }
      if (event.key === 'Escape') {
        setCommandOpen(false);
        setMobileOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const current = [...OS_NAVIGATION, ...OS_SECONDARY_NAVIGATION]
    .slice()
    .sort((a, b) => b.to.length - a.to.length)
    .find((item) => item.to === '/business-os' ? location.pathname === item.to : location.pathname.startsWith(item.to));

  const displayName = user?.full_name || user?.name || user?.email || 'Người dùng';
  const initials = displayName.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join('').toUpperCase();

  return (
    <div className="flex h-screen min-h-0 w-full overflow-hidden bg-[#f4f6fa] text-slate-950">
      <aside className="hidden w-[258px] shrink-0 flex-col bg-[#0b1020] lg:flex">
        <SidebarContent company={company} companies={companies} selectedCompanyId={selectedCompanyId} onCompanyChange={onCompanyChange} rolloutEnabled={rolloutEnabled} allModulesEnabled={allModulesEnabled} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <button type="button" className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} aria-label="Đóng menu" />
          <aside className="relative flex h-full w-[286px] flex-col bg-[#0b1020] shadow-2xl">
            <button type="button" onClick={() => setMobileOpen(false)} className="absolute right-3 top-4 z-10 rounded-lg p-2 text-slate-400 hover:bg-white/10 hover:text-white" aria-label="Đóng menu">
              <X className="h-5 w-5" />
            </button>
            <SidebarContent company={company} companies={companies} selectedCompanyId={selectedCompanyId} onCompanyChange={onCompanyChange} rolloutEnabled={rolloutEnabled} allModulesEnabled={allModulesEnabled} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[72px] shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
          <button type="button" onClick={() => setMobileOpen(true)} className="rounded-xl border border-slate-200 p-2.5 text-slate-600 lg:hidden" aria-label="Mở menu">
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-slate-400">Không gian làm việc</p>
            <h1 className="mt-0.5 truncate text-[15px] font-extrabold text-slate-950">{current?.label || 'Business OS'}</h1>
          </div>
          <button
            type="button"
            onClick={() => setCommandOpen(true)}
            className="mx-auto hidden h-10 w-full max-w-xl items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-left text-sm text-slate-400 transition hover:border-slate-300 hover:bg-white md:flex"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1">Tìm hồ sơ hoặc mở nhanh…</span>
            <span className="flex items-center gap-1 rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[10px] font-bold text-slate-500"><Command className="h-3 w-3" /> K</span>
          </button>
          <div className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => setCommandOpen(true)} className="rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50 md:hidden" aria-label="Tìm kiếm">
              <Search className="h-4 w-4" />
            </button>
            <Link to="/business-os/ai" className="hidden h-10 items-center gap-2 rounded-xl bg-violet-50 px-3 text-xs font-bold text-violet-700 hover:bg-violet-100 sm:flex">
              <Sparkles className="h-4 w-4" /> Hỏi AI
            </Link>
            <button type="button" className="relative rounded-xl border border-slate-200 p-2.5 text-slate-600 hover:bg-slate-50" aria-label="Thông báo">
              <Bell className="h-4 w-4" />
              <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-orange-500 ring-2 ring-white" />
            </button>
            <div className="hidden items-center gap-2.5 border-l border-slate-200 pl-3 sm:flex">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-950 text-[11px] font-extrabold text-white">{initials || 'U'}</span>
              <div className="hidden min-w-0 xl:block">
                <p className="max-w-[130px] truncate text-xs font-bold text-slate-900">{displayName}</p>
                <p className="mt-0.5 text-[10px] text-slate-500">{user?.role || 'Thành viên'}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">{children}</main>
      </div>

      <CommandPalette open={commandOpen} onClose={() => setCommandOpen(false)} />
    </div>
  );
}
