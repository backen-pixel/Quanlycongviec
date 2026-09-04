import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useAuth } from '../lib/auth';
import { isAdminLike, isCrmSocialInboxUser, isCrmSocialInboxCompanyLocked } from '../lib/adminRole';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import api from '../lib/api';
import {
  MessageCircle, Users, FileText, MessageSquare, Settings, Send, Search, ExternalLink,
  Link2, Plus, ChevronRight, Bell, Image, Paperclip, RefreshCw, ToggleLeft, ToggleRight,
  X, Trash2, Edit3, UserPlus, Phone, Mail, MoreHorizontal, Check, Copy, Save, Eye, EyeOff,
  Mic, MicOff, File, Camera, Smile, ArrowLeft, BarChart3, StickyNote, Activity, Images,
  Calendar,
} from 'lucide-react';
import DateRangePickerPopover from '../components/DateRangePickerPopover';
import AutoToolPanel from '../components/AutoToolPanel';
import BatchActionsBar from '../components/BatchActionsBar';
import { FacebookAutoCompaniesPanel } from './FacebookAutoCompaniesPage';
import CrmAppChannelPrefsBanner from '../components/CrmAppChannelPrefsBanner';
import AutoToolPanelInline from '../components/AutoToolPanel';
import FacebookPageTokenReminderBanner, { FacebookPageTokenReminderRow } from '../components/FacebookPageTokenReminderBanner';
import { computeFacebookPageTokenReminder, FB_PAGE_TOKEN_REMINDER_DAYS } from '../lib/facebookPageTokenReminder';
import FacebookImageSetsSettings from '../components/facebook/FacebookImageSetsSettings';
import FacebookImageSetPicker from '../components/facebook/FacebookImageSetPicker';
import { patchCrmDashboardCacheLeadFields } from '../lib/crmDashboardCache';

const API = import.meta.env.VITE_API_URL || '';
const hdr = () => ({ Authorization: `Bearer ${localStorage.getItem('token')}`, 'Content-Type': 'application/json' });

/** Tin soạn sẵn cũ trên trình duyệt (chỉ dùng để nhập một lần lên server) */
const LS_FB_CANNED_REPLIES = 'fb_inbox_canned_replies_v1';

function loadCannedRepliesFromStorage() {
  try {
    const raw = localStorage.getItem(LS_FB_CANNED_REPLIES);
    const a = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(a)) return [];
    return a
      .filter((x) => x && typeof x.text === 'string' && String(x.text).trim())
      .map((x, i) => ({
        id: String(x.id || `legacy-${i}`),
        title: String(x.title || x.text.slice(0, 48)).trim() || 'Mẫu',
        text: String(x.text).trim(),
      }));
  } catch {
    return [];
  }
}

/** Mới nhất = max(tin cuối, lúc tạo contact) — khớp backend facebookContactActivity */
function fbActivityTs(c) {
  const msg = c.last_message_at ? new Date(c.last_message_at).getTime() : 0;
  const cre = c.created_at ? new Date(c.created_at).getTime() : 0;
  return Math.max(msg, cre);
}

/** Định dạng YYYY-MM-DD theo giờ máy người dùng (VN) */
function vnYmd(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Chuyển preset lọc thời gian hộp thư → activity_from / activity_to (YYYY-MM-DD) */
function resolveInboxTimeRange(timeFilter, customFrom = '', customTo = '') {
  if (!timeFilter || timeFilter === 'all') return { activity_from: '', activity_to: '', label: '' };
  const now = new Date();
  const today = vnYmd(now);
  if (timeFilter === 'today') return { activity_from: today, activity_to: today, label: 'Hôm nay' };
  if (timeFilter === 'yesterday') {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    const d = vnYmd(y);
    return { activity_from: d, activity_to: d, label: 'Hôm qua' };
  }
  if (timeFilter === '7d') {
    const s = new Date(now);
    s.setDate(s.getDate() - 6);
    return { activity_from: vnYmd(s), activity_to: today, label: '7 ngày qua' };
  }
  if (timeFilter === '30d') {
    const s = new Date(now);
    s.setDate(s.getDate() - 29);
    return { activity_from: vnYmd(s), activity_to: today, label: '30 ngày qua' };
  }
  if (timeFilter === 'custom') {
    const f = String(customFrom || '').trim();
    const t = String(customTo || '').trim();
    if (!f || !t) return { activity_from: '', activity_to: '', label: '' };
    return { activity_from: f, activity_to: t, label: `${f} → ${t}` };
  }
  return { activity_from: '', activity_to: '', label: '' };
}

/** Tin inbound đầu tiên có nằm trong khoảng ngày (giờ VN) không → «hội thoại mới». */
function contactIsNewInRange(c, fromYmd, toYmd) {
  if (!fromYmd) return false;
  const iso = c.first_inbound_at || c.created_at;
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return false;
  const fromMs = new Date(`${fromYmd}T00:00:00+07:00`).getTime();
  const toMs = new Date(`${toYmd || fromYmd}T23:59:59.999+07:00`).getTime();
  return t >= fromMs && t <= toMs;
}

const INBOX_STAT_LABEL = {
  all: 'tất cả khách có tin',
  new: 'hội thoại mới',
  back: 'khách cũ nhắn lại',
  waiting: 'chưa trả lời',
};

function InboxStatCell({ active, onClick, title, value, valueClass, label }) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={active}
      onClick={onClick}
      className={`px-3 py-2 text-left w-full transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 focus-visible:ring-inset ${
        active ? 'bg-indigo-50' : 'hover:bg-gray-50'
      }`}
    >
      <p className={`text-xl font-bold tabular-nums leading-none ${valueClass}`}>{value}</p>
      <p className={`text-[10px] mt-1 leading-tight ${active ? 'font-semibold text-indigo-700' : 'text-gray-500'}`}>
        {label}
      </p>
    </button>
  );
}

function formatFbActivityTime(c) {
  const ts = fbActivityTs(c);
  if (!ts) return null;
  const d = new Date(ts);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;
  if (isYesterday) return `H.qua ${time}`;
  return `${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} ${time}`;
}

function fbActivitySourceLabel(c) {
  if (c.fb_activity_source === 'message') return 'Tin nhắn';
  if (c.fb_activity_source === 'created') return 'Hồ sơ mới';
  const lastMsg = c.last_message_at ? new Date(c.last_message_at).getTime() : 0;
  const created = c.created_at ? new Date(c.created_at).getTime() : 0;
  if (lastMsg >= created && lastMsg > 0) return 'Tin nhắn';
  return 'Hồ sơ mới';
}

// ═══════════════════════════════════════════════════════════════
// FACEBOOK INTEGRATION PAGE
// ═══════════════════════════════════════════════════════════════

const LS_FB_COMPANY = 'facebook_filter_company_id';
/** Lần đầu vào Facebook (admin): mặc định lọc đúng công ty của user, không ép lại sau khi user chọn «Tất cả». */
const LS_FB_COMPANY_INIT = 'facebook_filter_company_initialized';

export default function FacebookPage() {
  const { socket, user } = useAuth();
  const socialInboxLocked = isCrmSocialInboxCompanyLocked(user);
  const isAdmin = isAdminLike(user) && !isCrmSocialInboxUser(user);
  const loginCompanyId = String(user?.company_id || user?.companyId || '').trim();
  const lockToLoginCompany = socialInboxLocked || !!loginCompanyId;
  const [companies, setCompanies] = useState([]);
  const [filterFbCompany, setFilterFbCompany] = useState(() => {
    try { return localStorage.getItem(LS_FB_COMPANY) || ''; } catch { return ''; }
  });
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState(searchParams.get('tab') || 'inbox');
  const [stats, setStats] = useState(null);
  const [fbTokenSummary, setFbTokenSummary] = useState(null);

  const effectiveCompanyFilter = lockToLoginCompany ? loginCompanyId : filterFbCompany;
  const fbCompanyQs = useMemo(
    () => (isAdmin && effectiveCompanyFilter ? `company_id=${encodeURIComponent(effectiveCompanyFilter)}` : ''),
    [isAdmin, effectiveCompanyFilter],
  );

  const loadFbTokenSummary = useCallback(() => {
    const q = fbCompanyQs ? `?${fbCompanyQs}` : '';
    fetch(`${API}/api/facebook/pages/token-reminder-summary${q}`, { headers: hdr() })
      .then((r) => (r.ok ? r.json() : null))
      .then(setFbTokenSummary)
      .catch(() => setFbTokenSummary(null));
  }, [fbCompanyQs]);

  useEffect(() => {
    loadFbTokenSummary();
  }, [loadFbTokenSummary, tab]);

  useEffect(() => {
    if (!isAdmin || lockToLoginCompany) return;
    fetch(`${API}/api/companies?for_module=crm`, { headers: hdr() })
      .then((r) => r.ok ? r.json() : {})
      .then((d) => {
        const list = d?.companies || d || [];
        setCompanies(Array.isArray(list) ? list : []);
      })
      .catch(() => setCompanies([]));
  }, [isAdmin, lockToLoginCompany]);

  useEffect(() => {
    if (!isAdmin || !user || lockToLoginCompany) return;
    try {
      if (localStorage.getItem(LS_FB_COMPANY_INIT)) return;
      const cid = user.company_id || user.companyId;
      if (cid) {
        setFilterFbCompany(String(cid));
        localStorage.setItem(LS_FB_COMPANY, String(cid));
      }
      localStorage.setItem(LS_FB_COMPANY_INIT, '1');
    } catch { /* ignore */ }
  }, [isAdmin, user, lockToLoginCompany]);

  useEffect(() => {
    if (!isAdmin || lockToLoginCompany) return;
    try {
      if (filterFbCompany) localStorage.setItem(LS_FB_COMPANY, filterFbCompany);
      else localStorage.removeItem(LS_FB_COMPANY);
    } catch { /* ignore */ }
  }, [isAdmin, filterFbCompany, lockToLoginCompany]);

  // Pham vi dang chon ben trong hop thu (Page + khoang ngay) — de cac chi so o dau trang
  // bam theo dung cong ty + Page + khoang ngay nguoi dung dang xem, thay vi luon la "hom nay".
  const [inboxScope, setInboxScope] = useState({ pageId: '', pageName: '', from: '', to: '', label: '' });

  const loadStats = useCallback(() => {
    const params = new URLSearchParams(fbCompanyQs || '');
    if (inboxScope.pageId) params.set('page_id', inboxScope.pageId);
    if (inboxScope.from) params.set('from', inboxScope.from);
    if (inboxScope.to) params.set('to', inboxScope.to);
    const q = params.toString() ? `?${params}` : '';
    fetch(`${API}/api/facebook/stats${q}`, { headers: hdr() })
      .then(r => r.ok ? r.json() : {}).then(setStats).catch(() => {});
  }, [fbCompanyQs, inboxScope.pageId, inboxScope.from, inboxScope.to]);

  useEffect(() => { loadStats(); }, [tab, loadStats, fbCompanyQs]);

  useEffect(() => {
    const nextTab = searchParams.get('tab');
    if (nextTab && nextTab !== tab) setTab(nextTab);
  }, [searchParams, tab]);

  useEffect(() => {
    if (!socket) return;
    const h = () => loadStats();
    socket.on('fb_message', h);
    return () => { socket.off('fb_message', h); };
  }, [socket, loadStats]);

  // "Hôm nay" → "hôm nay", "7 ngày qua" → "7 ngày qua", khoảng tự chọn → "trong khoảng đã chọn".
  const statsRangeWord = (() => {
    const label = inboxScope.label || '';
    if (!label) return 'hôm nay';
    if (/^\d{4}-/.test(label)) return 'trong khoảng đã chọn';
    return label.charAt(0).toLowerCase() + label.slice(1);
  })();

  const tabs = [
    { id: 'inbox', label: 'Hộp thư', icon: MessageCircle, badge: stats?.total_unread },
    { id: 'contacts', label: 'Danh bạ', icon: Users },
    { id: 'analytics', label: 'Phân tích', icon: BarChart3 },
    { id: 'lead-ads', label: 'Lead Ads', icon: FileText, badge: stats?.lead_ads_today },
    { id: 'comments', label: 'Bình luận', icon: MessageSquare, badge: stats?.comments_today },
    { id: 'auto-lead', label: 'Tự động', icon: UserPlus },
    ...(isAdmin ? [{ id: 'auto-companies', label: 'Auto công ty', icon: Activity }] : []),
    {
      id: 'settings',
      label: 'Cài đặt',
      icon: Settings,
      badge: fbTokenSummary?.alert_count > 0 ? fbTokenSummary.alert_count : undefined,
    },
  ];

  const goSettingsTab = () => {
    setTab('settings');
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set('tab', 'settings');
      p.delete('contact');
      return p;
    });
  };

  return (
    <div className="h-[calc(100vh-64px)] flex flex-col bg-gray-100">
      <div className="border-b bg-white px-6 py-3 flex items-center justify-between shrink-0 shadow-sm">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-blue-700 rounded-xl flex items-center justify-center shadow-sm">
            <span className="text-white font-bold text-sm">f</span>
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-800">Facebook Messenger</h1>
            <p className="text-[11px] text-gray-400">Quản lý tin nhắn & khách hàng</p>
          </div>
          {isAdmin && !lockToLoginCompany && (
            <select
              value={filterFbCompany}
              onChange={(e) => setFilterFbCompany(e.target.value)}
              className="h-9 min-w-[170px] px-3 border rounded-lg text-sm bg-white"
              title="Lọc Page/chỉ số theo công ty (default_company_id trên Page)"
            >
              <option value="">Tất cả công ty</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
              ))}
            </select>
          )}
          {isAdmin && lockToLoginCompany && (
            <span
              className="h-9 inline-flex items-center px-3 rounded-lg border bg-gray-50 text-sm text-gray-700"
              title="Đang khóa theo công ty đăng nhập"
            >
              🏢 {user?.company_short_name || user?.company_name || 'Công ty đăng nhập'}
            </span>
          )}
        </div>
        {stats && (
          <div className="flex flex-wrap items-center gap-2 text-xs text-gray-500">
            {inboxScope.pageName && (
              <span
                className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600 font-medium max-w-[15rem] truncate"
                title={`Các chỉ số dưới đây chỉ tính cho Page: ${inboxScope.pageName}`}
              >
                {inboxScope.pageName}
              </span>
            )}
            <span className="bg-blue-50 px-2.5 py-1 rounded-full" title={`Số tin khách gửi ${statsRangeWord}`}>
              📨 {stats.messages_today} tin {statsRangeWord}
            </span>
            <span className="bg-indigo-50 px-2.5 py-1 rounded-full" title={`Hội thoại mới phát sinh ${statsRangeWord} — khách cũ nhắn lại không tính`}>
              🗣 {stats.senders_today ?? 0} hội thoại mới
            </span>
            <span className="bg-green-50 px-2.5 py-1 rounded-full" title={inboxScope.pageName ? `Tổng liên hệ của Page ${inboxScope.pageName}` : 'Tổng liên hệ của tất cả Page'}>
              👥 {stats.total_contacts} liên hệ
            </span>
            {stats.unattended_total > 0 && (
              <span className="bg-amber-50 text-amber-700 px-2.5 py-1 rounded-full font-medium" title="Khách nhắn tin cuối, chưa có nhân viên trả lời">
                ⏳ {stats.unattended_total} chưa chăm
              </span>
            )}
          </div>
        )}
      </div>

      <CrmAppChannelPrefsBanner />

      {tab !== 'settings' && (fbTokenSummary?.alert_count || 0) > 0 && (
        <FacebookPageTokenReminderBanner
          compact
          summary={fbTokenSummary}
          onGoSettings={goSettingsTab}
        />
      )}

      <div className="border-b bg-white px-6 flex gap-0.5 shrink-0">
        {tabs.map(t => (
          <button key={t.id} onClick={() => { setTab(t.id); setSearchParams(prev => { const p = new URLSearchParams(prev); p.set('tab', t.id); if (t.id !== 'inbox') p.delete('contact'); return p; }); }}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all cursor-pointer ${
              tab === t.id ? 'border-blue-600 text-blue-600 bg-blue-50/50' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            }`}>
            <t.icon size={15} />
            {t.label}
            {t.badge > 0 && <span className="bg-red-500 text-white text-[10px] rounded-full px-1.5 py-0.5 min-w-[18px] text-center font-bold">{t.badge}</span>}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === 'inbox' && <InboxTab pageStats={stats?.page_stats} fbCompanyQs={fbCompanyQs} companyId={effectiveCompanyFilter || loginCompanyId || null} onScopeChange={setInboxScope} />}
        {tab === 'contacts' && <ContactsTab fbCompanyQs={fbCompanyQs} companyId={effectiveCompanyFilter} isAdmin={isAdmin} />}
        {tab === 'analytics' && <AnalyticsTab fbCompanyQs={fbCompanyQs} />}
        {tab === 'lead-ads' && <LeadAdsTab />}
        {tab === 'comments' && <CommentsTab />}
        {tab === 'settings' && <SettingsTab onPagesChanged={loadFbTokenSummary} fbCompanyQs={fbCompanyQs} />}
        {tab === 'auto-lead' && <AutoLeadTab />}
        {tab === 'auto-companies' && isAdmin && <FacebookAutoCompaniesPanel embedded />}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// INBOX TAB — Messenger Chat (realtime + media)
// ═══════════════════════════════════════════════════════════════


/**
 * Chọn Page + số hội thoại MỚI đổ về của từng Page trong khoảng ngày đang chọn.
 * - Số chính (đậm) = hội thoại mới; khách cũ nhắn lại (NV chăm lại) KHÔNG cộng vào đây.
 * - Chấm hổ phách = trong số mới đó còn bao nhiêu chưa ai trả lời.
 * rangeStats = /api/facebook/page-new-senders (theo bộ lọc ngày); lúc chưa có thì tạm
 * dùng pageStats (hôm nay) để số không bị trống.
 */
function PageSelector({ value, onChange, pages, pageStats, rangeStats, rangeLabel }) {
  const [isOpen, setIsOpen] = useState(false);
  const scopeLabel = rangeLabel || 'hôm nay';

  const statOf = (pageId) => {
    const rs = rangeStats?.find((x) => x.page_id === pageId);
    if (rs) {
      return {
        fresh: rs.new_contacts || 0,
        waiting: rs.new_unattended || 0,
        back: rs.returning_contacts || 0,
      };
    }
    const ps = pageStats?.find((x) => x.page_id === pageId);
    return {
      fresh: ps?.senders_today || 0,
      waiting: ps?.unattended_new_today || 0,
      back: ps?.returning_today || 0,
    };
  };

  const rows = pages
    .map((p) => ({ page: p, ...statOf(p.page_id) }))
    .sort((a, b) => b.fresh - a.fresh || a.page.page_name.localeCompare(b.page.page_name, 'vi'));
  const totalFresh = rows.reduce((n, r) => n + r.fresh, 0);
  const totalWaiting = rows.reduce((n, r) => n + r.waiting, 0);
  const selectedPage = pages.find((p) => p.page_id === value);
  const shown = value ? statOf(value) : { fresh: totalFresh, waiting: totalWaiting, back: 0 };

  /** Ô 6px giữ chỗ cố định để tên Page các dòng luôn thẳng hàng, có chấm hay không. */
  const WaitDot = ({ waiting }) => (
    <span className="w-1.5 shrink-0" aria-hidden>
      {waiting > 0 && <span className="block w-1.5 h-1.5 rounded-full bg-amber-500" />}
    </span>
  );
  const Count = ({ n, muted }) => (
    <span className={`shrink-0 text-[13px] font-bold tabular-nums ${muted ? 'text-gray-300' : n > 0 ? 'text-indigo-600' : 'text-gray-300'}`}>
      {n}
    </span>
  );

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full text-left border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white hover:border-indigo-300 hover:bg-indigo-50/30 transition-colors flex items-center gap-2"
        aria-expanded={isOpen}
      >
        <span className="flex-1 min-w-0">
          <span className="block text-xs font-medium text-gray-800 truncate">
            {selectedPage ? selectedPage.page_name : 'Tất cả các Page'}
          </span>
          <span className="block text-[10px] text-gray-400 truncate">
            {shown.fresh} hội thoại mới · {scopeLabel}
          </span>
        </span>
        <WaitDot waiting={shown.waiting} />
        <Count n={shown.fresh} />
        <ChevronRight size={12} className={`text-gray-400 shrink-0 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 w-full mt-1.5 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 border-b border-gray-100">
            <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Page</span>
            <span className="text-[9px] font-semibold uppercase tracking-wider text-gray-400">Mới</span>
          </div>
          <div className="max-h-64 overflow-y-auto">
            <button
              type="button"
              onClick={() => { onChange(''); setIsOpen(false); }}
              className={`w-full flex items-center gap-2 px-3 py-2 text-left border-l-2 hover:bg-gray-50 ${!value ? 'border-indigo-500 bg-indigo-50/60' : 'border-transparent'}`}
              title={totalWaiting > 0 ? `${totalWaiting} hội thoại mới chưa ai trả lời` : undefined}
            >
              <WaitDot waiting={totalWaiting} />
              <span className={`flex-1 text-xs truncate ${!value ? 'font-semibold text-indigo-700' : 'text-gray-700'}`}>
                Tất cả các Page
              </span>
              <Count n={totalFresh} />
            </button>
            {rows.map(({ page, fresh, waiting, back }) => (
              <button
                key={page.id}
                type="button"
                onClick={() => { onChange(page.page_id); setIsOpen(false); }}
                title={[
                  waiting > 0 ? `${waiting} hội thoại mới chưa ai trả lời` : '',
                  back > 0 ? `${back} khách cũ nhắn lại ${scopeLabel} — không tính vào số mới` : '',
                ].filter(Boolean).join(' · ') || undefined}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left border-l-2 hover:bg-gray-50 ${value === page.page_id ? 'border-indigo-500 bg-indigo-50/60' : 'border-transparent'}`}
              >
                <WaitDot waiting={waiting} />
                <span className={`flex-1 text-xs truncate ${value === page.page_id ? 'font-semibold text-indigo-700' : 'text-gray-700'}`}>
                  {page.page_name}
                </span>
                <Count n={fresh} muted={fresh === 0} />
              </button>
            ))}
          </div>
          <p className="px-3 py-2 text-[10px] leading-snug text-gray-400 bg-gray-50 border-t border-gray-100">
            Số hội thoại mới {scopeLabel} — khách cũ nhắn lại không đếm lại.
            <span className="inline-flex items-center gap-1 ml-0.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" aria-hidden />
              <span className="text-amber-600">chưa ai trả lời</span>
            </span>
          </p>
        </div>
      )}
    </div>
  );
}

function InboxTab({ pageStats, fbCompanyQs = '', companyId = null, onScopeChange }) {
  const { socket } = useAuth();
  const [searchParams] = useSearchParams();
  const [contacts, setContacts] = useState([]);
  const [selected, setSelected] = useState(null);
  const [messages, setMessages] = useState([]);
  const [reply, setReply] = useState('');
  const [search, setSearch] = useState('');
  const [pageFilter, setPageFilter] = useState('');
  const [timeFilter, setTimeFilter] = useState('today'); // all | today | yesterday | 7d | 30d | custom
  const [timeCustomFrom, setTimeCustomFrom] = useState('');
  const [timeCustomTo, setTimeCustomTo] = useState('');
  const [pages, setPages] = useState([]);
  // Phải khớp trần của backend (FB_CONTACTS_MAX_LIMIT, mặc định 1000 — xem
  // backend/src/routes/facebook.js). Trước đây select cho chọn 1000/2000/5000
  // nhưng backend kẹp cứng 400 nên chọn 5000 vẫn chỉ nhận 400 và nhãn nút
  // "Tải thêm N contact" hiện sai số.
  const CONTACT_LIMIT_OPTIONS = [400, 1000];
  const [contactLimit, setContactLimit] = useState(400);
  const [contactMeta, setContactMeta] = useState({ total: 0, hasMore: false, nextOffset: 0, limit: 400 });
  const [leadTitleDraft, setLeadTitleDraft] = useState('');
  const [leadTitleSaving, setLeadTitleSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [recording, setRecording] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState(null);
  const [uploading, setUploading] = useState(false);
  const messagesEndRef = useRef(null);
  const selectedRef = useRef(null);
  const fileInputRef = useRef(null);
  const imageInputRef = useRef(null);
  const cannedToggleRef = useRef(null);
  const cannedSidebarRef = useRef(null);
  const imageSetToggleRef = useRef(null);
  const imageSetSidebarRef = useRef(null);
  const [cannedReplies, setCannedReplies] = useState([]);
  const [cannedListLoading, setCannedListLoading] = useState(true);
  const [cannedSaving, setCannedSaving] = useState(false);
  const [cannedImporting, setCannedImporting] = useState(false);
  const [cannedOpen, setCannedOpen] = useState(false);
  const [cannedDraftTitle, setCannedDraftTitle] = useState('');
  const [cannedDraftBody, setCannedDraftBody] = useState('');
  const [cannedEditingId, setCannedEditingId] = useState(null);
  const [imageSetOpen, setImageSetOpen] = useState(false);
  selectedRef.current = selected;

  const loadCannedFromServer = useCallback(async () => {
    setCannedListLoading(true);
    try {
      const res = await fetch(`${API}/api/facebook/canned-replies`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
      });
      if (!res.ok) throw new Error('api');
      const d = await res.json();
      const items = (d.items || []).map((x) => ({ id: x.id, title: x.title, text: x.body }));
      setCannedReplies(items);
    } catch {
      setCannedReplies(loadCannedRepliesFromStorage());
    } finally {
      setCannedListLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCannedFromServer();
  }, [loadCannedFromServer]);

  const legacyLocalCanned = useMemo(
    () => (cannedOpen ? loadCannedRepliesFromStorage() : []),
    [cannedOpen, cannedListLoading, cannedReplies.length, cannedImporting],
  );

  useEffect(() => {
    if (!cannedOpen) return;
    const onDoc = (e) => {
      const t = e.target;
      if (cannedToggleRef.current?.contains(t)) return;
      if (cannedSidebarRef.current?.contains(t)) return;
      setCannedOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [cannedOpen]);

  const loadReplyIntoCannedForm = useCallback(() => {
    const t = reply.trim();
    if (!t) {
      alert('Soạn tin trong ô nhập trước, rồi bấm «Nạp vào form».');
      return;
    }
    setCannedDraftBody(t);
    setCannedEditingId(null);
    setCannedDraftTitle((prev) => {
      if (prev.trim()) return prev;
      const line = t.split('\n')[0]?.trim() || t;
      return line.slice(0, 56) + (line.length > 56 ? '…' : '');
    });
  }, [reply]);

  const submitCannedDraft = useCallback(async () => {
    const tTitle = cannedDraftTitle.trim();
    const tText = cannedDraftBody.trim();
    if (!tTitle || !tText) {
      alert('Nhập đủ tiêu đề và nội dung.');
      return;
    }
    setCannedSaving(true);
    try {
      if (cannedEditingId) {
        const res = await fetch(`${API}/api/facebook/canned-replies/${encodeURIComponent(cannedEditingId)}`, {
          method: 'PUT',
          headers: hdr(),
          body: JSON.stringify({ title: tTitle, body: tText }),
        });
        const row = await res.json().catch(() => ({}));
        if (!res.ok) {
          alert(row.error || 'Lỗi cập nhật');
          return;
        }
        setCannedReplies((prev) =>
          prev.map((x) => (x.id === cannedEditingId ? { id: row.id, title: row.title, text: row.body } : x)),
        );
        setCannedEditingId(null);
      } else {
        if (cannedReplies.length >= 80) {
          alert('Tối đa 80 mẫu');
          return;
        }
        const res = await fetch(`${API}/api/facebook/canned-replies`, {
          method: 'POST',
          headers: hdr(),
          body: JSON.stringify({ title: tTitle, body: tText }),
        });
        const row = await res.json().catch(() => ({}));
        if (!res.ok) {
          alert(row.error || 'Lỗi thêm mẫu');
          return;
        }
        setCannedReplies((prev) => [{ id: row.id, title: row.title, text: row.body }, ...prev].slice(0, 80));
      }
      setCannedDraftTitle('');
      setCannedDraftBody('');
    } finally {
      setCannedSaving(false);
    }
  }, [cannedDraftTitle, cannedDraftBody, cannedEditingId, cannedReplies.length]);

  const cancelCannedDraft = useCallback(() => {
    setCannedEditingId(null);
    setCannedDraftTitle('');
    setCannedDraftBody('');
  }, []);

  const startEditCanned = useCallback((c) => {
    setCannedEditingId(c.id);
    setCannedDraftTitle(c.title);
    setCannedDraftBody(c.text);
  }, []);

  const removeCannedReply = useCallback(async (id) => {
    if (!window.confirm('Xóa mẫu này?')) return;
    const res = await fetch(`${API}/api/facebook/canned-replies/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: hdr(),
    });
    const err = await res.json().catch(() => ({}));
    if (!res.ok) {
      alert(err.error || 'Xóa thất bại');
      return;
    }
    setCannedReplies((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const importLocalCannedToServer = useCallback(async () => {
    const local = loadCannedRepliesFromStorage();
    if (!local.length) return;
    setCannedImporting(true);
    try {
      const res = await fetch(`${API}/api/facebook/canned-replies/import`, {
        method: 'POST',
        headers: hdr(),
        body: JSON.stringify({ items: local.map((x) => ({ title: x.title, text: x.text })) }),
      });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(d.error || 'Nhập thất bại');
        return;
      }
      await loadCannedFromServer();
      try {
        localStorage.removeItem(LS_FB_CANNED_REPLIES);
      } catch {
        /* ignore */
      }
      if (d.imported) alert(`Đã nhập ${d.imported} mẫu lên server.`);
      else alert(d.message || 'Không nhập thêm được mẫu nào (có thể đã đủ 80 mẫu).');
    } finally {
      setCannedImporting(false);
    }
  }, [loadCannedFromServer]);

  useEffect(() => {
    if (!cannedEditingId) return;
    const exists = cannedReplies.some((c) => c.id === cannedEditingId);
    if (!exists) {
      setCannedEditingId(null);
      setCannedDraftTitle('');
      setCannedDraftBody('');
    }
  }, [cannedReplies, cannedEditingId]);

  const applyCannedReply = useCallback((text) => {
    setReply(text);
    /* Giữ panel mở để chọn thêm mẫu nếu cần */
  }, []);

  // Load pages
  useEffect(() => {
    const q = fbCompanyQs ? `?${fbCompanyQs}` : '';
    fetch(`${API}/api/facebook/pages${q}`, { headers: hdr() })
      .then(r => r.ok ? r.json() : []).then(setPages).catch(() => {});
  }, [fbCompanyQs]);

  const timeRange = useMemo(
    () => resolveInboxTimeRange(timeFilter, timeCustomFrom, timeCustomTo),
    [timeFilter, timeCustomFrom, timeCustomTo],
  );

  const loadContacts = useCallback((append = false) => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (pageFilter) params.set('page_id', pageFilter);
    if (timeRange.activity_from) params.set('activity_from', timeRange.activity_from);
    if (timeRange.activity_to) params.set('activity_to', timeRange.activity_to);
    params.set('limit', String(contactLimit));
    params.set('offset', append ? String(contactMeta.nextOffset || 0) : '0');
    if (fbCompanyQs) {
      new URLSearchParams(fbCompanyQs).forEach((v, k) => params.set(k, v));
    }
    const qs = params.toString() ? `?${params}` : '';
    fetch(`${API}/api/facebook/contacts${qs}`, { headers: hdr() })
      .then(r => r.ok ? r.json() : { data: [], total: 0, hasMore: false, nextOffset: 0 })
      .then(payload => {
        const rows = payload?.data || [];
        const merged = append ? [...contacts, ...rows] : rows;
        const deduped = merged.filter((item, idx, arr) => arr.findIndex(x => x.id === item.id) === idx);
        const sorted = [...deduped].sort((a, b) => {
          const ua = (a.unread_count || 0) > 0 ? 1 : 0;
          const ub = (b.unread_count || 0) > 0 ? 1 : 0;
          if (ub !== ua) return ub - ua;
          const act = fbActivityTs(b) - fbActivityTs(a);
          if (act !== 0) return act;
          const ap = (a.display_phone || a.phone || a.customer?.phone) ? 1 : 0;
          const bp = (b.display_phone || b.phone || b.customer?.phone) ? 1 : 0;
          return bp - ap;
        });
        setContacts(sorted);
        setContactMeta({
          total: payload?.total || 0,
          hasMore: !!payload?.hasMore,
          nextOffset: payload?.nextOffset || 0,
          // Server có thể kẹp ?limit xuống trần của nó — dùng số THỰC nhận được
          // cho nhãn nút "Tải thêm" thay vì con số người dùng đã chọn.
          limit: payload?.limit || contactLimit,
        });
      }).catch(() => {});
  }, [search, pageFilter, timeRange.activity_from, timeRange.activity_to, contactLimit, contactMeta.nextOffset, contacts, fbCompanyQs]);

  useEffect(() => { loadContacts(false); }, [loadContacts]);

  // Số hội thoại mới theo từng Page, theo ĐÚNG khoảng ngày đang chọn (badge trong dropdown Page).
  const [pageRangeStats, setPageRangeStats] = useState(null);
  // Gộp lại cho thẻ số ở đầu danh sách — theo Page đang chọn, hoặc tất cả Page.
  const rangeTotals = useMemo(() => {
    if (!pageRangeStats) return null;
    const rows = pageFilter ? pageRangeStats.filter((r) => r.page_id === pageFilter) : pageRangeStats;
    return rows.reduce((a, r) => ({
      fresh: a.fresh + (r.new_contacts || 0),
      waiting: a.waiting + (r.new_unattended || 0),
      back: a.back + (r.returning_contacts || 0),
    }), { fresh: 0, waiting: 0, back: 0 });
  }, [pageRangeStats, pageFilter]);
  useEffect(() => {
    const params = new URLSearchParams();
    const from = timeRange.activity_from || vnYmd(new Date());
    const to = timeRange.activity_to || from;
    params.set('from', from);
    params.set('to', to);
    if (fbCompanyQs) new URLSearchParams(fbCompanyQs).forEach((v, k) => params.set(k, v));
    let alive = true;
    fetch(`${API}/api/facebook/page-new-senders?${params}`, { headers: hdr() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setPageRangeStats(d?.pages || null); })
      .catch(() => { if (alive) setPageRangeStats(null); });
    return () => { alive = false; };
  }, [timeRange.activity_from, timeRange.activity_to, fbCompanyQs]);

  useEffect(() => {
    const contactId = searchParams.get('contact');
    if (!contactId || selected?.id === contactId) return;
    const found = contacts.find(c => c.id === contactId);
    if (found) {
      setSelected(found);
      fetch(`${API}/api/facebook/contacts/${found.id}`, { headers: hdr() })
        .then(r => r.ok ? r.json() : null)
        .then(fresh => { if (fresh) setSelected(fresh); })
        .catch(() => {});
      return;
    }
    // Không có trong danh sách đang lọc — bộ lọc mặc định là "Hôm nay" nên link trỏ tới hội
    // thoại cũ sẽ không nằm trong danh sách. Tải thẳng theo id để link luôn mở được.
    fetch(`${API}/api/facebook/contacts/${contactId}`, { headers: hdr() })
      .then(r => r.ok ? r.json() : null)
      .then(fresh => { if (fresh?.id) setSelected(fresh); })
      .catch(() => {});
  }, [searchParams, contacts, selected]);

  // Realtime
  useEffect(() => {
    if (!socket) return;
    const h = (data) => {
      setContacts(prev => {
        const now = data.message?.created_at || new Date().toISOString();
        const ex = prev.find(c => c.id === data.contact_id);
        if (ex) {
          const up = { ...ex, last_message_at: now,
            unread_count: selectedRef.current?.id === data.contact_id ? 0 : (ex.unread_count || 0) + 1 };
          return [up, ...prev.filter(c => c.id !== data.contact_id)];
        }
        // Contact mới chưa có trong list — thêm vào đầu
        const newContact = data.contact
          ? { ...data.contact, last_message_at: now, unread_count: 1 }
          : { id: data.contact_id, fb_name: 'Khách', unread_count: 1, last_message_at: now };
        return [newContact, ...prev];
      });
      if (selectedRef.current?.id === data.contact_id && data.message) {
        setMessages(prev => prev.some(m => m.id === data.message.id) ? prev : [...prev, data.message]);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
      }
    };
    const onContactProfile = (data) => {
      const id = data?.contact_id;
      if (!id) return;
      setContacts((prev) =>
        prev.map((c) =>
          String(c.id) === String(id)
            ? { ...c, fb_name: data.fb_name || c.fb_name, fb_profile_pic: data.fb_profile_pic ?? c.fb_profile_pic }
            : c,
        ),
      );
      setSelected((sel) =>
        sel && String(sel.id) === String(id)
          ? { ...sel, fb_name: data.fb_name || sel.fb_name, fb_profile_pic: data.fb_profile_pic ?? sel.fb_profile_pic }
          : sel,
      );
    };
    const onContactCreated = (data) => {
      const fresh = data?.contact;
      if (!fresh?.id) return;
      setContacts((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        const exists = list.some((c) => String(c.id) === String(fresh.id));
        if (exists) return list.map((c) => (String(c.id) === String(fresh.id) ? { ...c, ...fresh } : c));
        const ts = fresh.last_message_at || fresh.created_at || new Date().toISOString();
        return [{ ...fresh, last_message_at: ts }, ...list];
      });
    };
    socket.on('fb_message', h);
    socket.on('fb_contact_updated', onContactProfile);
    socket.on('fb_contact_created', onContactCreated);
    return () => {
      socket.off('fb_message', h);
      socket.off('fb_contact_updated', onContactProfile);
      socket.off('fb_contact_created', onContactCreated);
    };
  }, [socket]);

  useEffect(() => {
    if (!selected) return;
    setLeadTitleDraft(selected.lead?.title || selected.fb_name || '');
    
    // Mark as read in local state immediately
    setContacts(prev => prev.map(c => 
      c.id === selected.id ? { ...c, unread_count: 0 } : c
    ));
    
    // Load messages
    const loadMsgs = () => {
      const msgParams = new URLSearchParams();
      if (timeRange.activity_from) msgParams.set('message_from', timeRange.activity_from);
      if (timeRange.activity_to) msgParams.set('message_to', timeRange.activity_to);
      const msgQs = msgParams.toString() ? `?${msgParams}` : '';
      fetch(`${API}/api/facebook/contacts/${selected.id}/messages${msgQs}`, { headers: hdr() })
        .then(r => r.ok ? r.json() : []).then(d => { 
          setMessages(d); 
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
          
          // Auto-sync nếu ít tin nhắn (< 5) → có thể thiếu history
          if (d.length < 5 && !timeRange.activity_from) {
            fetch(`${API}/api/facebook/contacts/${selected.id}/sync-history`, { method: 'POST', headers: hdr() })
              .then(r => r.ok ? r.json() : null)
              .then(result => {
                if (result?.synced > 0) {
                  console.log(`[FB] Auto-synced ${result.synced} messages`);
                  // Reload messages
                  fetch(`${API}/api/facebook/contacts/${selected.id}/messages${msgQs}`, { headers: hdr() })
                    .then(r => r.ok ? r.json() : [])
                    .then(fresh => { setMessages(fresh); setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100); });
                }
              });
          }
        })
        .catch(() => {});
    };
    
    loadMsgs();
  }, [selected, timeRange.activity_from, timeRange.activity_to]);

  // Send text
  const sendReply = async () => {
    if (!reply.trim() || !selected || sending) return;
    setSending(true);
    try {
      const res = await fetch(`${API}/api/facebook/contacts/${selected.id}/reply`, {
        method: 'POST', headers: hdr(), body: JSON.stringify({ message: reply }),
      });
      if (res.ok) { const msg = await res.json(); setMessages(prev => [...prev, msg]); setReply(''); messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }
    } catch (e) { console.error(e); }
    setSending(false);
  };

  // Upload & send file/image
  const handleFileUpload = async (e, type) => {
    const file = e.target.files?.[0];
    if (!file || !selected) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const upRes = await fetch(`${API}/api/upload/single`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: formData,
      });
      if (!upRes.ok) { const err = await upRes.json().catch(() => ({})); throw new Error(err.error || 'Upload failed'); }
      const upData = await upRes.json();
      const fileUrl = upData.file_url;

      // Determine attachment type
      let attType = type || 'file';
      if (file.type.startsWith('image/')) attType = 'image';
      else if (file.type.startsWith('video/')) attType = 'video';
      else if (file.type.startsWith('audio/')) attType = 'audio';

      const res = await fetch(`${API}/api/facebook/contacts/${selected.id}/reply`, {
        method: 'POST', headers: hdr(),
        body: JSON.stringify({ message: '', attachment_url: fileUrl, attachment_type: attType }),
      });
      if (res.ok) { const msg = await res.json(); setMessages(prev => [...prev, msg]); messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }
    } catch (e) { alert('Lỗi gửi file: ' + e.message); }
    setUploading(false);
    e.target.value = '';
  };

  // Voice recording
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      const chunks = [];
      recorder.ondataavailable = (e) => chunks.push(e.data);
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const file = new window.File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });

        // Upload then send
        setUploading(true);
        try {
          const formData = new FormData();
          formData.append('file', file);
          const upRes = await fetch(`${API}/api/upload/single`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
            body: formData,
          });
          if (!upRes.ok) { const err = await upRes.json().catch(() => ({})); throw new Error(err.error || 'Upload failed'); }
          const upData = await upRes.json();
          const fileUrl = upData.file_url;

          const res = await fetch(`${API}/api/facebook/contacts/${selected.id}/reply`, {
            method: 'POST', headers: hdr(),
            body: JSON.stringify({ message: '', attachment_url: fileUrl, attachment_type: 'audio' }),
          });
          if (res.ok) { const msg = await res.json(); setMessages(prev => [...prev, msg]); messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }
        } catch (e) { alert('Lỗi gửi ghi âm'); }
        setUploading(false);
      };
      recorder.start();
      setMediaRecorder(recorder);
      setRecording(true);
    } catch (e) { alert('Không thể ghi âm. Hãy cấp quyền microphone.'); }
  };

  const stopRecording = () => {
    if (mediaRecorder) { mediaRecorder.stop(); setRecording(false); setMediaRecorder(null); }
  };

  const [contactFilter, setContactFilter] = useState('all'); // all | has_phone | no_phone | has_lead | unattended | attended
  const [statFilter, setStatFilter] = useState('all'); // all | new | back | waiting

  const toggleStatFilter = useCallback((key) => {
    setStatFilter((cur) => (cur === key ? 'all' : key));
    setContactFilter('all');
  }, []);

  const contactFilterOptions = useMemo(() => {
    const hasPhone = (c) => !!(c.display_phone || c.phone || c.customer?.phone);
    return [
      { key: 'all', label: 'Tất cả', count: contacts.length },
      { key: 'unattended', label: '⏳ Chưa chăm sóc', count: contacts.filter((c) => c.attended_status === 'unattended').length },
      { key: 'attended', label: '✅ Đã chăm sóc', count: contacts.filter((c) => c.attended_status === 'attended').length },
      { key: 'has_phone', label: '📞 Có SĐT', count: contacts.filter(hasPhone).length },
      { key: 'no_phone', label: '❌ Chưa có SĐT', count: contacts.filter((c) => !hasPhone(c)).length },
      { key: 'has_lead', label: '🏷 Có Lead', count: contacts.filter((c) => c.lead).length },
      { key: 'no_lead', label: '🔔 Chưa có Lead', count: contacts.filter((c) => !c.lead).length },
      { key: 'lead_has_phone', label: '✅ Lead + SĐT', count: contacts.filter((c) => c.lead && hasPhone(c)).length },
      { key: 'lead_no_phone', label: '⚠️ Lead chưa có SĐT', count: contacts.filter((c) => c.lead && !hasPhone(c)).length },
    ];
  }, [contacts]);

  const formatTime = (d) => new Date(d).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });

  const filteredContacts = contacts.filter(c => {
    const phone = c.display_phone || c.phone || c.customer?.phone;
    if (statFilter === 'new' || statFilter === 'waiting' || statFilter === 'back') {
      const isNew = contactIsNewInRange(c, timeRange.activity_from, timeRange.activity_to);
      if (statFilter === 'new' && !isNew) return false;
      if (statFilter === 'back' && isNew) return false;
      if (statFilter === 'waiting' && !(isNew && c.attended_status === 'unattended')) return false;
    }
    if (contactFilter === 'has_phone') return !!phone;
    if (contactFilter === 'no_phone') return !phone;
    if (contactFilter === 'has_lead') return !!c.lead;
    if (contactFilter === 'no_lead') return !c.lead;
    if (contactFilter === 'lead_has_phone') return !!c.lead && !!phone;
    if (contactFilter === 'lead_no_phone') return !!c.lead && !phone;
    if (contactFilter === 'unattended') return c.attended_status === 'unattended';
    if (contactFilter === 'attended') return c.attended_status === 'attended';
    return true;
  });

  const selectedPageLabel = useMemo(() => {
    if (!pageFilter) return null;
    return pages.find((p) => p.page_id === pageFilter)?.page_name || null;
  }, [pageFilter, pages]);

  // Báo phạm vi đang chọn lên trang cha để 4 chỉ số ở đầu trang (tin / hội thoại mới /
  // liên hệ / chưa chăm) bám theo đúng công ty + Page + khoảng ngày đang xem.
  useEffect(() => {
    if (!onScopeChange) return;
    onScopeChange({
      pageId: pageFilter || '',
      pageName: selectedPageLabel || '',
      from: timeRange.activity_from || '',
      to: timeRange.activity_to || timeRange.activity_from || '',
      label: timeRange.label || '',
    });
  }, [
    onScopeChange, pageFilter, selectedPageLabel,
    timeRange.activity_from, timeRange.activity_to, timeRange.label,
  ]);

  const timeFilterUserTotal = timeRange.label ? (contactMeta.total ?? contacts.length) : null;
  const contactFilterActive = contactFilter !== 'all';

  // Dedup messages — loại bỏ tin nhắn trùng fb_message_id hoặc id
  const uniqueMessages = useMemo(() => {
    const seen = new Set();
    return messages.filter(m => {
      const key = m.fb_message_id || m.id;
      if (seen.has(key)) return false;
      seen.add(key);
      if (m.id && key !== m.id) {
        if (seen.has(m.id)) return false;
        seen.add(m.id);
      }
      return true;
    });
  }, [messages]);

  return (
    <div className="flex h-full min-h-0 min-w-0 overflow-hidden">
      {/* ── LEFT: Contact list ── */}
      <div className={`w-80 border-r bg-white flex flex-col shrink-0 ${selected ? 'hidden md:flex' : 'flex'}`}>
        <div className="p-3 border-b bg-gray-50 space-y-2">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm kiếm khách hàng..."
              className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent" />
          </div>
          <div className="flex items-center gap-2">
            <select
              value={timeFilter}
              onChange={(e) => { setTimeFilter(e.target.value); setStatFilter('all'); }}
              className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-[11px] text-gray-700"
              aria-label="Lọc theo thời gian"
            >
              <option value="all">⏱ Tất cả thời gian</option>
              <option value="today">📅 Hôm nay</option>
              <option value="yesterday">📅 Hôm qua</option>
              <option value="7d">📅 7 ngày qua</option>
              <option value="30d">📅 30 ngày qua</option>
              <option value="custom">📅 Tùy chọn ngày</option>
            </select>
            <select
              value={contactFilter}
              onChange={(e) => setContactFilter(e.target.value)}
              className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-[11px] text-gray-700"
              aria-label="Lọc hội thoại"
            >
              {contactFilterOptions.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label} ({f.count})
                </option>
              ))}
            </select>
            <select
              value={contactLimit}
              onChange={(e) => setContactLimit(Number(e.target.value))}
              className="shrink-0 w-[72px] border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-[11px] text-gray-700"
              aria-label="Giới hạn tải contact"
            >
              {CONTACT_LIMIT_OPTIONS.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          {timeFilter === 'custom' && (
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                value={timeCustomFrom}
                onChange={(e) => { setTimeCustomFrom(e.target.value); setStatFilter('all'); }}
                className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-[11px] text-gray-700"
                aria-label="Từ ngày"
              />
              <span className="text-[10px] text-gray-400 shrink-0">→</span>
              <input
                type="date"
                value={timeCustomTo}
                onChange={(e) => { setTimeCustomTo(e.target.value); setStatFilter('all'); }}
                className="flex-1 min-w-0 border border-gray-200 rounded-lg px-2 py-1.5 bg-white text-[11px] text-gray-700"
                aria-label="Đến ngày"
              />
            </div>
          )}
          {timeRange.label ? (
            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <p className="px-3 pt-2 pb-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 truncate">
                {timeRange.label}
                {selectedPageLabel ? ` · ${selectedPageLabel}` : pages.length > 1 ? ' · Tất cả Page' : ''}
              </p>
              <div className="grid grid-cols-3 border-t border-gray-100 divide-x divide-gray-100">
                <InboxStatCell
                  active={statFilter === 'new'}
                  onClick={() => toggleStatFilter('new')}
                  title="Bấm để chỉ hiện hội thoại mới. Bấm lại để hiện tất cả."
                  value={rangeTotals ? rangeTotals.fresh : '—'}
                  valueClass="text-indigo-600"
                  label="Hội thoại mới"
                />
                <InboxStatCell
                  active={statFilter === 'back'}
                  onClick={() => toggleStatFilter('back')}
                  title="Bấm để chỉ hiện khách cũ nhắn lại. Bấm lại để hiện tất cả."
                  value={rangeTotals ? rangeTotals.back : '—'}
                  valueClass="text-gray-400"
                  label="Cũ nhắn lại"
                />
                <InboxStatCell
                  active={statFilter === 'waiting'}
                  onClick={() => toggleStatFilter('waiting')}
                  title="Bấm để chỉ hiện hội thoại mới chưa ai trả lời. Bấm lại để hiện tất cả."
                  value={rangeTotals ? rangeTotals.waiting : '—'}
                  valueClass={rangeTotals?.waiting ? 'text-amber-600' : 'text-gray-300'}
                  label="Chưa trả lời"
                />
              </div>
              <div className="px-3 py-1.5 bg-gray-50 border-t border-gray-100 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <button
                  type="button"
                  aria-pressed={statFilter === 'all'}
                  onClick={() => { setStatFilter('all'); setContactFilter('all'); }}
                  title="Hiện tất cả khách có tin trong khoảng này"
                  className={`text-[10px] text-left rounded px-1 -mx-1 cursor-pointer hover:text-gray-800 ${
                    statFilter === 'all' ? 'text-gray-700 font-medium' : 'text-gray-500'
                  }`}
                >
                  Tổng <strong className="tabular-nums text-gray-700">{timeFilterUserTotal}</strong> khách có tin
                </button>
                {statFilter !== 'all' && (
                  <span className="text-[10px] text-indigo-600">
                    Đang xem {INBOX_STAT_LABEL[statFilter]} ({filteredContacts.length})
                  </span>
                )}
                {contactFilterActive && filteredContacts.length !== timeFilterUserTotal && (
                  <span className="text-[10px] text-gray-500">
                    Sau lọc thêm: <strong className="tabular-nums text-gray-700">{filteredContacts.length}</strong>
                  </span>
                )}
                {contactMeta.hasMore && contacts.length < (contactMeta.total || 0) && (
                  <span className="text-[10px] text-amber-700">
                    Đã tải {contacts.length}/{contactMeta.total} — bấm «Tải thêm» bên dưới
                  </span>
                )}
              </div>
            </div>
          ) : (
            <div className="text-[11px] text-gray-500">
              Hiển thị {filteredContacts.length}/{contacts.length}
              {contactMeta.total ? ` · Tổng ${contactMeta.total}` : ''}
            </div>
          )}
          {pages.length > 1 && (
            <PageSelector
              value={pageFilter}
              onChange={(v) => { setPageFilter(v); setStatFilter('all'); }}
              pages={pages}
              pageStats={pageStats}
              rangeStats={pageRangeStats}
              rangeLabel={timeRange.label}
            />
          )}
        </div>
        <div className="flex-1 overflow-y-auto">
          {filteredContacts.map(c => (
            <div key={c.id} onClick={() => {
              setSelected(c);
              // Reload contact để check lead còn tồn tại không
              fetch(`${API}/api/facebook/contacts/${c.id}`, { headers: hdr() })
                .then(r => r.ok ? r.json() : null)
                .then(fresh => { if (fresh) setSelected(fresh); })
                .catch(() => {});
            }}
              className={`flex items-center gap-3 px-4 py-3 cursor-pointer border-b border-gray-50 transition-all ${
                selected?.id === c.id ? 'bg-blue-50 border-l-3 border-l-blue-500' : 'hover:bg-gray-50'
              }`}>
              <div className="relative">
                <FBAvatar name={c.fb_name} pic={c.fb_profile_pic} size={11} />
                {c.unread_count > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[9px] rounded-full w-5 h-5 flex items-center justify-center font-bold shadow">{c.unread_count}</span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm truncate ${c.unread_count > 0 ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>{c.fb_name}</p>
                {c.last_message_preview ? (
                  <p className={`text-xs truncate mt-0.5 ${c.unread_count > 0 ? 'text-gray-700 font-medium' : 'text-gray-400'}`}>{c.last_message_preview}</p>
                ) : (
                <div className="flex items-center gap-1.5 mt-0.5">
                  {(c.display_phone || c.phone || c.customer?.phone) && <span className="text-[10px] text-green-600 bg-green-50 px-1.5 py-0.5 rounded-md">📞 {c.display_phone || c.phone || c.customer?.phone}</span>}
                  {c.lead && <span className="text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-md">🏷 {c.lead.code}</span>}
                  {!(c.display_phone || c.phone || c.customer?.phone) && !c.lead && <span className="text-xs text-gray-400">💬 Messenger</span>}
                </div>
                )}
              </div>
              <div className="text-[10px] text-gray-400 shrink-0 text-right max-w-[76px]">
                {c.attended_status === 'unattended' && (
                  <span className="block text-[9px] font-semibold text-amber-600 mb-0.5" title="Khách nhắn tin cuối, chưa có nhân viên trả lời">⏳ Chờ trả lời</span>
                )}
                {c.fb_is_recent_activity && (
                  <span className="block text-[9px] font-semibold text-emerald-600 mb-0.5">Mới</span>
                )}
                {formatFbActivityTime(c) && (
                  <span className="block text-gray-500" title={`Hoạt động cuối: ${fbActivitySourceLabel(c)}`}>
                    {formatFbActivityTime(c)}
                  </span>
                )}
                <span className="block text-[9px] text-gray-400 truncate max-w-[76px]" title={fbActivitySourceLabel(c)}>
                  {fbActivitySourceLabel(c)}
                </span>
                {c.attended_status === 'attended' && c.last_outbound_by_name && (
                  <span className="block text-[9px] text-gray-400 truncate max-w-[76px]" title="Nhân viên trả lời gần nhất">
                    ✓ {c.last_outbound_by_name}
                  </span>
                )}
              </div>
            </div>
          ))}
          {!filteredContacts.length && (
            <div className="text-center py-12">
              <MessageCircle size={40} className="mx-auto mb-2 text-gray-200" />
              <p className="text-sm text-gray-400">
                {contacts.length
                  ? (statFilter !== 'all'
                    ? `Không có ${INBOX_STAT_LABEL[statFilter]} trong danh sách đang tải`
                    : 'Không có kết quả lọc')
                  : timeRange.label
                    ? `Không có hội thoại trong ${timeRange.label}`
                    : 'Chưa có cuộc hội thoại'}
              </p>
            </div>
          )}
          {contactMeta.hasMore && (
            <div className="p-3 border-t bg-white sticky bottom-0">
              <button onClick={() => loadContacts(true)} className="w-full text-xs bg-blue-50 text-blue-700 py-2 rounded-lg hover:bg-blue-100 font-medium">
                Tải thêm {Math.min(contactMeta.limit || contactLimit, (contactMeta.total || 0) - contacts.length)} contact
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT: Chat area ── */}
      <div className={`flex-1 flex flex-col bg-gray-50 min-h-0 min-w-0 overflow-hidden ${!selected ? 'hidden md:flex' : 'flex'}`}>
        {selected ? (
          <>
            {/* Chat header */}
            <div className="border-b px-4 py-3 bg-white flex items-center justify-between shrink-0 shadow-sm">
              <div className="flex items-center gap-3">
                <button onClick={() => setSelected(null)} className="md:hidden text-gray-400 hover:text-gray-600 cursor-pointer mr-1">
                  <ArrowLeft size={20} />
                </button>
                <FBAvatar name={selected.fb_name} pic={selected.fb_profile_pic} size={10} />
                <div>
                  <p className="font-semibold text-sm text-gray-800">{selected.fb_name}</p>
                  <div className="flex items-center gap-2 text-[11px] text-gray-400">
                    {(selected.display_phone || selected.phone || selected.customer?.phone) && <span className="text-green-600">📞 {selected.display_phone || selected.phone || selected.customer?.phone}</span>}
                    {!(selected.display_phone || selected.phone || selected.customer?.phone) && <span>Facebook Messenger</span>}
                  </div>
                  {selected.lead && (
                    <div className="mt-2 flex items-center gap-2">
                      <input
                        value={leadTitleDraft}
                        onChange={e => setLeadTitleDraft(e.target.value)}
                        placeholder="Sửa tên lead"
                        className="px-3 py-1.5 text-xs border border-gray-200 rounded-lg bg-white min-w-[220px]"
                      />
                      <button
                        onClick={async () => {
                          if (!leadTitleDraft.trim() || leadTitleSaving) return;
                          setLeadTitleSaving(true);
                          try {
                            const nextTitle = leadTitleDraft.trim();
                            const res = await fetch(`${API}/api/crm/leads/${selected.lead.id}`, {
                              method: 'PUT',
                              headers: hdr(),
                              body: JSON.stringify({ title: nextTitle }),
                            });
                            const data = await res.json();
                            if (!res.ok) throw new Error(data?.error || 'Lỗi cập nhật lead');
                            const savedTitle = data?.title || nextTitle;
                            setSelected(prev => ({ ...prev, lead: { ...prev.lead, title: savedTitle } }));
                            patchCrmDashboardCacheLeadFields(selected.lead.id, { title: savedTitle });
                            loadContacts(false);
                          } catch (e) {
                            alert(e.message || 'Lỗi cập nhật lead');
                          }
                          setLeadTitleSaving(false);
                        }}
                        disabled={leadTitleSaving || !leadTitleDraft.trim()}
                        className="text-xs bg-amber-50 text-amber-700 px-3 py-1.5 rounded-lg hover:bg-amber-100 disabled:opacity-40"
                      >
                        {leadTitleSaving ? 'Đang lưu...' : 'Lưu tên lead'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <SyncHistoryButton contactId={selected.id} onSynced={() => {
                  const msgParams = new URLSearchParams();
                  if (timeRange.activity_from) msgParams.set('message_from', timeRange.activity_from);
                  if (timeRange.activity_to) msgParams.set('message_to', timeRange.activity_to);
                  const msgQs = msgParams.toString() ? `?${msgParams}` : '';
                  fetch(`${API}/api/facebook/contacts/${selected.id}/messages${msgQs}`, { headers: hdr() })
                    .then(r => r.ok ? r.json() : []).then(d => { setMessages(d); setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100); }).catch(() => {});
                }} />
                {selected.lead ? (
                  <a href={`/crm/leads/${selected.lead.id}`} className="text-xs bg-blue-50 text-blue-600 px-3 py-1.5 rounded-lg hover:bg-blue-100 flex items-center gap-1 font-medium transition">
                    <ExternalLink size={12} /> {selected.lead.code}
                  </a>
                ) : (
                  <CreateLeadButton contactId={selected.id} onCreated={(lead) => { setSelected(prev => ({ ...prev, lead })); loadContacts(); }} />
                )}
              </div>
            </div>

            {/* Messages + khung tin soạn sẵn (chat-style) */}
            <div className="flex flex-1 min-h-0 min-w-0 overflow-hidden flex-row">
              <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden px-4 py-3 space-y-2">
                {timeRange.label && (
                  <div className="sticky top-0 z-10 flex justify-center mb-2">
                    <span className="text-[10px] text-blue-700 bg-blue-50 border border-blue-100 px-3 py-1 rounded-full">
                      Đang lọc tin: {timeRange.label}
                    </span>
                  </div>
                )}
                {!uniqueMessages.length && timeRange.label && (
                  <p className="text-center text-sm text-gray-400 py-8">Không có tin nhắn trong khoảng thời gian này</p>
                )}
                {uniqueMessages.map((m, i) => {
                  const isOut = m.direction === 'outbound';
                  const showDate = i === 0 || new Date(m.created_at).toDateString() !== new Date(uniqueMessages[i - 1]?.created_at).toDateString();
                  return (
                    <div key={m.id} className="min-w-0">
                      {showDate && (
                        <div className="flex justify-center my-3">
                          <span className="text-[10px] text-gray-400 bg-white px-3 py-1 rounded-full shadow-sm border">
                            {new Date(m.created_at).toLocaleDateString('vi-VN', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                          </span>
                        </div>
                      )}
                      <div className={`flex min-w-0 ${isOut ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[min(75%,100%)] min-w-0 w-fit rounded-2xl px-4 py-2.5 shadow-sm overflow-hidden ${
                          isOut ? 'bg-gradient-to-br from-blue-500 to-blue-600 text-white rounded-br-md' : 'bg-white text-gray-800 rounded-bl-md border border-gray-100'
                        }`}>
                          {m.attachment_url && (m.message_type === 'image' || m.attachment_type === 'image') && (
                            <div className="mb-2">
                              <img
                                src={m.attachment_url}
                                className="max-w-[280px] rounded-xl cursor-pointer hover:opacity-90 transition"
                                alt="Hình ảnh"
                                onClick={() => window.open(m.attachment_url, '_blank')}
                              />
                            </div>
                          )}
                          {m.attachment_url && (m.message_type === 'audio' || m.attachment_type === 'audio') && (
                            <div className="mb-1">
                              <audio
                                src={m.attachment_url}
                                controls
                                className="max-w-[280px] h-10"
                                style={{ filter: isOut ? 'invert(1) hue-rotate(180deg)' : 'none' }}
                              />
                            </div>
                          )}
                          {m.attachment_url && (m.message_type === 'video' || m.attachment_type === 'video') && (
                            <div className="mb-2">
                              <video src={m.attachment_url} controls className="max-w-[280px] rounded-xl" preload="metadata" />
                            </div>
                          )}
                          {m.attachment_url && (m.message_type === 'file' || m.attachment_type === 'file') && (
                            <a
                              href={m.attachment_url}
                              target="_blank"
                              rel="noreferrer"
                              className={`flex items-center gap-2 text-sm px-3 py-2 rounded-lg mb-1 transition min-w-0 max-w-full break-all [overflow-wrap:anywhere] ${isOut ? 'bg-blue-400/30 hover:bg-blue-400/50' : 'bg-gray-50 hover:bg-gray-100'}`}
                            >
                              <File size={16} /> Tệp đính kèm
                            </a>
                          )}
                          {m.content && m.content !== '[image]' && m.content !== '[audio]' && m.content !== '[video]' && m.content !== '[file]' && (
                            <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere]">{m.content}</p>
                          )}
                          <p className={`text-[10px] mt-1 ${isOut ? 'text-blue-200' : 'text-gray-400'}`}>{formatTime(m.created_at)}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {cannedOpen && (
                <aside
                  ref={cannedSidebarRef}
                  className="w-[min(100%,320px)] sm:w-[300px] shrink-0 border-l border-amber-100 bg-gradient-to-b from-amber-50/95 via-white to-gray-50 flex flex-col shadow-inner min-h-0"
                  aria-label="Tin soạn sẵn"
                >
                  <div className="px-3 py-2 border-b border-amber-100/80 bg-white/90 flex items-center justify-between gap-2 shrink-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <StickyNote className="h-4 w-4 text-amber-600 shrink-0" />
                      <span className="text-xs font-semibold text-gray-900 truncate">Tin soạn sẵn</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCannedOpen(false)}
                      className="p-1 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 shrink-0"
                      title="Đóng"
                    >
                      <X size={16} />
                    </button>
                  </div>
                  <p className="px-3 py-1.5 text-[10px] text-gray-500 border-b border-gray-100 shrink-0 leading-snug">
                    «Chèn»: đưa <strong>nội dung</strong> vào ô nhập. Mẫu lưu trên <strong>server</strong> (theo tài khoản),
                    tối đa 80 mẫu.
                  </p>
                  <div className="flex-1 overflow-y-auto px-2 py-2 space-y-2 min-h-0">
                    {cannedListLoading ? (
                      <p className="text-[11px] text-gray-400 text-center py-6 px-2">Đang tải mẫu…</p>
                    ) : cannedReplies.length === 0 ? (
                      <div className="text-[11px] text-gray-500 text-center py-4 px-2 space-y-3">
                        <p>Chưa có mẫu trên server. Thêm ở form dưới hoặc «Nạp từ ô nhập».</p>
                        {legacyLocalCanned.length > 0 && (
                          <button
                            type="button"
                            onClick={importLocalCannedToServer}
                            disabled={cannedImporting}
                            className="w-full text-[11px] font-medium px-3 py-2 rounded-lg bg-amber-100 text-amber-900 border border-amber-200 hover:bg-amber-200 disabled:opacity-50"
                          >
                            {cannedImporting
                              ? 'Đang nhập…'
                              : `Nhập ${legacyLocalCanned.length} mẫu từ trình duyệt (cũ) lên server`}
                          </button>
                        )}
                      </div>
                    ) : (
                      cannedReplies.map((c) => (
                        <div key={c.id} className="flex justify-start">
                          <div
                            className={`max-w-[95%] rounded-2xl rounded-bl-md px-3 py-2 shadow-sm border ${
                              cannedEditingId === c.id ? 'border-amber-400 bg-amber-50' : 'border-gray-100 bg-white'
                            }`}
                          >
                            <p className="text-[11px] font-semibold text-gray-900">{c.title}</p>
                            <p className="text-[13px] text-gray-700 whitespace-pre-wrap break-words [overflow-wrap:anywhere] mt-1 leading-relaxed">{c.text}</p>
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              <button
                                type="button"
                                onClick={() => applyCannedReply(c.text)}
                                disabled={cannedSaving}
                                className="text-[10px] font-medium px-2 py-1 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                              >
                                Chèn vào ô nhập
                              </button>
                              <button
                                type="button"
                                onClick={() => startEditCanned(c)}
                                disabled={cannedSaving}
                                className="text-[10px] font-medium px-2 py-1 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1 disabled:opacity-50"
                              >
                                <Edit3 size={11} /> Sửa
                              </button>
                              <button
                                type="button"
                                onClick={() => removeCannedReply(c.id)}
                                disabled={cannedSaving}
                                className="text-[10px] font-medium px-2 py-1 rounded-lg border border-red-100 text-red-600 hover:bg-red-50 inline-flex items-center gap-1 disabled:opacity-50"
                              >
                                <Trash2 size={11} /> Xóa
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                    {!cannedListLoading && cannedReplies.length > 0 && legacyLocalCanned.length > 0 && (
                      <div className="pt-1 border-t border-dashed border-gray-200">
                        <button
                          type="button"
                          onClick={importLocalCannedToServer}
                          disabled={cannedImporting || cannedSaving}
                          className="w-full text-[10px] font-medium px-2 py-1.5 rounded-lg text-gray-600 bg-gray-100 hover:bg-gray-200 disabled:opacity-50"
                        >
                          {cannedImporting ? 'Đang nhập…' : `Gộp thêm từ trình duyệt (${legacyLocalCanned.length})`}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="border-t border-amber-100 bg-white p-2 shrink-0 space-y-2 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
                    <input
                      value={cannedDraftTitle}
                      onChange={(e) => setCannedDraftTitle(e.target.value)}
                      placeholder="Tiêu đề mẫu"
                      className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                    />
                    <textarea
                      value={cannedDraftBody}
                      onChange={(e) => setCannedDraftBody(e.target.value)}
                      placeholder="Nội dung (chèn vào ô nhập khi chọn «Chèn»)"
                      rows={4}
                      className="w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg bg-gray-50 resize-none focus:ring-2 focus:ring-amber-400 focus:border-transparent"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        onClick={submitCannedDraft}
                        disabled={cannedSaving || cannedListLoading}
                        className="text-[11px] font-semibold px-2.5 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 inline-flex items-center gap-1 disabled:opacity-50"
                      >
                        <Save size={12} /> {cannedSaving ? '…' : cannedEditingId ? 'Cập nhật' : 'Thêm mẫu'}
                      </button>
                      {(cannedEditingId || cannedDraftTitle.trim() || cannedDraftBody.trim()) && (
                        <button
                          type="button"
                          onClick={cancelCannedDraft}
                          disabled={cannedSaving}
                          className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                        >
                          Hủy form
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={loadReplyIntoCannedForm}
                        disabled={cannedListLoading}
                        className="text-[11px] font-medium px-2.5 py-1.5 rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 disabled:opacity-50"
                      >
                        Nạp từ ô nhập
                      </button>
                    </div>
                  </div>
                </aside>
              )}

              {imageSetOpen && selected && (
                <div ref={imageSetSidebarRef} className="shrink-0 min-h-0 flex">
                  <FacebookImageSetPicker
                    open
                    onClose={() => setImageSetOpen(false)}
                    contactId={selected.id}
                    companyId={companyId}
                    companyQs={fbCompanyQs}
                    disabled={uploading || recording}
                    onMessagesSent={(msgs) => {
                      setMessages((prev) => [
                        ...prev,
                        ...msgs.map((m) => ({ ...m, contact: selected })),
                      ]);
                      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
                    }}
                  />
                </div>
              )}
            </div>

            {/* ── Input bar ── */}
            <div className="border-t bg-white p-3 shrink-0 shadow-inner">
              {uploading && (
                <div className="flex items-center gap-2 text-xs text-blue-600 mb-2 px-2">
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  Đang tải lên...
                </div>
              )}
              <div className="flex items-center gap-2 min-w-0">
                {/* Image button */}
                <button onClick={() => imageInputRef.current?.click()} disabled={uploading}
                  className="p-2.5 text-gray-400 hover:text-blue-500 hover:bg-blue-50 rounded-xl cursor-pointer transition disabled:opacity-40" title="Gửi hình ảnh">
                  <Image size={20} />
                </button>
                <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFileUpload(e, 'image')} />

                {/* File button */}
                <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                  className="p-2.5 text-gray-400 hover:text-purple-500 hover:bg-purple-50 rounded-xl cursor-pointer transition disabled:opacity-40" title="Gửi file">
                  <Paperclip size={20} />
                </button>
                <input ref={fileInputRef} type="file" className="hidden" onChange={(e) => handleFileUpload(e, 'file')} />

                {/* Voice button */}
                {!recording ? (
                  <button onClick={startRecording} disabled={uploading}
                    className="p-2.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-xl cursor-pointer transition disabled:opacity-40" title="Ghi âm">
                    <Mic size={20} />
                  </button>
                ) : (
                  <button onClick={stopRecording}
                    className="p-2.5 text-red-500 bg-red-50 rounded-xl cursor-pointer animate-pulse" title="Dừng ghi âm">
                    <MicOff size={20} />
                  </button>
                )}

                {/* Tin soạn sẵn — mở khung chat CRUD bên phải */}
                <div className="relative shrink-0" ref={cannedToggleRef}>
                  <button
                    type="button"
                    onClick={() => { setImageSetOpen(false); setCannedOpen((o) => !o); }}
                    disabled={recording}
                    className={`p-2.5 rounded-xl cursor-pointer transition disabled:opacity-40 ${
                      cannedOpen ? 'text-amber-700 bg-amber-100 ring-2 ring-amber-300/60' : 'text-gray-400 hover:text-amber-600 hover:bg-amber-50'
                    }`}
                    title="Tin soạn sẵn — lưu server, chèn vào ô nhập"
                  >
                    <StickyNote size={20} />
                  </button>
                </div>

                {/* Bộ ảnh Drive — gửi hàng loạt */}
                <div className="relative shrink-0" ref={imageSetToggleRef}>
                  <button
                    type="button"
                    onClick={() => { setCannedOpen(false); setImageSetOpen((o) => !o); }}
                    disabled={recording || !selected}
                    className={`p-2.5 rounded-xl cursor-pointer transition disabled:opacity-40 ${
                      imageSetOpen ? 'text-blue-700 bg-blue-100 ring-2 ring-blue-300/60' : 'text-gray-400 hover:text-blue-600 hover:bg-blue-50'
                    }`}
                    title="Gửi bộ ảnh từ Drive"
                  >
                    <Images size={20} />
                  </button>
                </div>

                {/* Text input */}
                <input value={reply} onChange={e => setReply(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendReply()}
                  placeholder={recording ? '🎙 Đang ghi âm...' : 'Nhập tin nhắn...'}
                  disabled={recording}
                  className="flex-1 min-w-0 px-4 py-2.5 border border-gray-200 rounded-2xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-gray-50 disabled:opacity-40" />

                {/* Send button */}
                <button onClick={sendReply} disabled={sending || !reply.trim() || recording}
                  className="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-xl w-10 h-10 flex items-center justify-center hover:from-blue-600 hover:to-blue-700 disabled:opacity-40 cursor-pointer transition shadow-sm">
                  <Send size={16} />
                </button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <div className="w-20 h-20 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <MessageCircle size={36} className="text-blue-400" />
              </div>
              <p className="text-gray-500 font-medium">Chọn cuộc hội thoại</p>
              <p className="text-xs text-gray-400 mt-1">Tin nhắn từ Facebook Messenger sẽ hiện ở đây</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helper: Avatar ──
function FBAvatar({ name, pic, size = 11 }) {
  const cls = `w-${size} h-${size} rounded-full flex items-center justify-center text-white font-bold shrink-0 shadow-sm`;
  const textSize = size >= 10 ? 'text-sm' : 'text-xs';
  if (pic) return <img src={pic} alt="" className={`w-${size} h-${size} rounded-full object-cover shrink-0 shadow-sm`} />;
  return <div className={`${cls} bg-gradient-to-br from-blue-400 to-blue-600 ${textSize}`}>{(name || 'F')[0].toUpperCase()}</div>;
}

// ── Helper: Nút sync lịch sử tin nhắn cũ từ Facebook ──
function SyncHistoryButton({ contactId, onSynced }) {
  const [loading, setLoading] = useState(false);
  const sync = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/facebook/contacts/${contactId}/sync-history`, { method: 'POST', headers: hdr() });
      const data = await res.json();
      if (data.synced > 0) { alert(`✅ Đã đồng bộ ${data.synced} tin nhắn cũ`); onSynced?.(); }
      else alert(data.message || 'Không có tin nhắn mới để đồng bộ');
    } catch (e) { alert('Lỗi đồng bộ'); }
    setLoading(false);
  };
  return (
    <button onClick={sync} disabled={loading}
      className="text-xs text-gray-500 hover:text-blue-600 px-2 py-1.5 rounded-lg hover:bg-gray-100 flex items-center gap-1 cursor-pointer disabled:opacity-50 transition" title="Đồng bộ tin nhắn cũ từ Facebook">
      <RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> {loading ? 'Đang sync...' : 'Sync'}
    </button>
  );
}

// ── Helper: Nút tạo Lead nhanh từ contact ──
function CreateLeadButton({ contactId, onCreated }) {
  const [loading, setLoading] = useState(false);
  const create = async () => {
    if (!confirm('Tạo mới Lead/Deal từ contact này theo cài đặt Page?')) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/facebook/contacts/${contactId}/create-lead`, { method: 'POST', headers: hdr() });
      if (res.ok) { const lead = await res.json(); onCreated(lead); }
      else { const err = await res.json(); alert(err.error || 'Lỗi'); }
    } catch (e) { alert('Lỗi tạo Lead'); }
    setLoading(false);
  };
  return (
    <button onClick={create} disabled={loading}
      className="text-xs bg-green-50 text-green-600 px-3 py-1.5 rounded-lg hover:bg-green-100 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 font-medium transition">
      <UserPlus size={12} /> {loading ? 'Đang tạo...' : 'Tạo mới'}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════════
// CONTACTS TAB — Danh bạ Facebook (CRUD)
// ═══════════════════════════════════════════════════════════════

function ContactsTab({ fbCompanyQs = '', companyId = '', isAdmin = false }) {
  const navigate = useNavigate();
  /** company_id để scope tool theo công ty (rỗng = toàn hệ thống cho admin; NV bị backend ép theo công ty đăng nhập). */
  const toolCompanyId = companyId != null && String(companyId).trim() !== '' ? String(companyId).trim() : undefined;
  const { socket } = useAuth();
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  /** Nguồn cấu hình từ Page setup (facebook_pages.default_source_id) */
  const [pageSources, setPageSources] = useState([]);
  const [sourceFilter, setSourceFilter] = useState('');
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [batchStatus, setBatchStatus] = useState(null); // { type, loading, result }
  const [batchProgress, setBatchProgress] = useState(null);
  const [refreshAvatarLogs, setRefreshAvatarLogs] = useState([]);
  const [audit, setAudit] = useState(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const limitSize = 400;
  /** Số user xử lý (mới→cũ): đồng bộ Graph → quét SĐT từng user một */
  const [chainUserLimit, setChainUserLimit] = useState(50);
  /** Vị trí trong pool server (0, 50, 100, …) — pipeline v2 không dùng offset */
  const [chainPoolOffset, setChainPoolOffset] = useState(0);
  /** Pipeline v2: không quét được SĐT inbound mới → xóa SĐT cũ (trừ khi SĐT mới trùng cũ). */
  const [v2ClearPhoneNoInbound, setV2ClearPhoneNoInbound] = useState(true);
  const [v2DeleteLeadNoPhone, setV2DeleteLeadNoPhone] = useState(false);
  const [v2CleanupWithLead, setV2CleanupWithLead] = useState(false);
  const [meta, setMeta] = useState({ total: 0, hasMore: false, nextOffset: 0 });

  /** Quét SĐT sai / nghi từ link — phone-quality-scan */
  const [pqLoading, setPqLoading] = useState(false);
  const [pqResult, setPqResult] = useState(null);
  const [pqError, setPqError] = useState(null);
  const [pqForm, setPqForm] = useState({
    limit: 150,
    lead_date_from: '',
    lead_date_to: '',
    include_contacts_without_lead_in_range: false,
    /** Khi có khoảng ngày: gộp lead có SĐT KH (customer) xấu — kể cả contact chưa lưu số xấu */
    include_lead_bad_customer_phone: true,
  });
  const [pqSelectedDel, setPqSelectedDel] = useState([]);
  const [pqApplyLoading, setPqApplyLoading] = useState(false);
  const [pqDeleteCustomer, setPqDeleteCustomer] = useState(true);
  const pqBulkDelHeaderRef = useRef(null);

  // ── Tool: Quét lại SĐT (rescan-phones) ───────────────────────────
  const [rescanOpen, setRescanOpen] = useState(false);
  const [rescanForm, setRescanForm] = useState({
    limit: 100,
    mode: 'all',           // 'all' | 'with_phone' | 'without_phone'
    overwrite: true,       // ghi đè SĐT cũ nếu tìm thấy SĐT mới khác
    sort: 'newest_first',  // 'newest_first' | 'oldest_first'
    sync_customer: true,   // đồng bộ SĐT mới sang customer.phone
    delete_lead_when_no_phone: false, // inbound không trích được SĐT → xóa lead (kể cả đang lưu SĐT cũ), điều kiện an toàn
    delete_orphan_customer_no_phone: false, // sau khi xóa lead: xóa KH mồ côi không SĐT (chỉ 1 contact FB)
    lead_date_from: '',    // YYYY-MM-DD — lọc theo ngày tạo lead CRM (type=lead)
    lead_date_to: '',
    include_contacts_without_lead_in_range: false, // gồm contact chưa lead nhưng created_at trong khoảng
  });
  const [rescanStatus, setRescanStatus] = useState(null); // { loading, result, error }
  const [rescanProgress, setRescanProgress] = useState(null);
  /** Tiến trình socket chung với rescan-phones */
  const leadScanRunningRef = useRef(false);
  const [leadScanOpen, setLeadScanOpen] = useState(false);
  const [leadScanForm, setLeadScanForm] = useState({
    lead_date_from: '',
    lead_date_to: '',
    limit: 300,
    sync_graph_first: true,
    graph_pages: 10,
    include_contacts_without_lead_in_range: false,
    sync_customer: true,
  });
  const [leadScanStatus, setLeadScanStatus] = useState(null);
  const [leadScanProgress, setLeadScanProgress] = useState(null);

  const runLeadScanByDate = async () => {
    if (!leadScanForm.lead_date_from?.trim() || !leadScanForm.lead_date_to?.trim()) {
      alert('Chọn đủ Từ ngày và Đến ngày');
      return;
    }
    if (!confirm('Quét lead theo ngày: cập nhật SĐT từ tin user; nếu đang có SĐT mà quét không ra thì xóa lead (nếu được) và xóa user khỏi danh bạ. Tiếp tục?')) return;
    setLeadScanStatus({ loading: true, result: null, error: null });
    setLeadScanProgress({ current: 0, total: leadScanForm.limit, name: '' });
    leadScanRunningRef.current = true;
    try {
      const res = await fetch(`${API}/api/facebook/scan-leads-by-date`, {
        method: 'POST',
        headers: { ...hdr(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lead_date_from: leadScanForm.lead_date_from.trim(),
          lead_date_to: leadScanForm.lead_date_to.trim(),
          limit: leadScanForm.limit,
          sync_graph_first: leadScanForm.sync_graph_first,
          graph_pages: leadScanForm.graph_pages,
          include_contacts_without_lead_in_range: leadScanForm.include_contacts_without_lead_in_range,
          sync_customer: leadScanForm.sync_customer,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setLeadScanStatus({ loading: false, result: data, error: null });
      load(false);
    } catch (e) {
      setLeadScanStatus({ loading: false, result: null, error: e.message });
    } finally {
      leadScanRunningRef.current = false;
      setLeadScanProgress(null);
    }
  };

  const runRescanPhones = async () => {
    setRescanStatus({ loading: true, result: null, error: null });
    setRescanProgress({ current: 0, total: rescanForm.limit, name: '' });
    try {
      const payload = {
        ...rescanForm,
        company_id: toolCompanyId,
        lead_date_from: rescanForm.lead_date_from?.trim() || undefined,
        lead_date_to: rescanForm.lead_date_to?.trim() || undefined,
      };
      const res = await fetch(`${API}/api/facebook/rescan-phones`, {
        method: 'POST',
        headers: { ...hdr(), 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setRescanStatus({ loading: false, result: data, error: null });
      load(false);
    } catch (e) {
      setRescanStatus({ loading: false, result: null, error: e.message });
    } finally {
      setRescanProgress(null);
    }
  };

  const sortContacts = useCallback((list) => {
    const deduped = (list || []).filter((item, idx, arr) => arr.findIndex(x => x.id === item.id) === idx);
    return [...deduped].sort((a, b) => {
      const act = fbActivityTs(b) - fbActivityTs(a);
      if (act !== 0) return act;
      // Tie-breaker: unread only (keep "newest-first" as primary sort)
      const ua = (a.unread_count || 0) > 0 ? 1 : 0;
      const ub = (b.unread_count || 0) > 0 ? 1 : 0;
      if (ub !== ua) return ub - ua;
      const ap = (a.display_phone || a.phone || a.customer?.phone) ? 1 : 0;
      const bp = (b.display_phone || b.phone || b.customer?.phone) ? 1 : 0;
      return bp - ap;
    });
  }, []);

  const load = useCallback((append = false) => {
    const p = new URLSearchParams();
    if (search) p.set('search', search);
    if (filter === 'has_lead') p.set('has_lead', 'true');
    if (filter === 'no_lead') p.set('has_lead', 'false');
    if (filter === 'unattended') p.set('attended', 'unattended');
    if (filter === 'attended') p.set('attended', 'attended');
    if (sourceFilter) {
      p.set('source_id', sourceFilter);
      // Lọc theo nguồn chỉ áp dụng cho contact có lead
      if (filter !== 'has_lead') p.set('has_lead', 'true');
    }
    p.set('limit', '400');
    p.set('offset', append ? String(meta.nextOffset || 0) : '0');
    if (fbCompanyQs) {
      new URLSearchParams(fbCompanyQs).forEach((v, k) => p.set(k, v));
    }
    fetch(`${API}/api/facebook/contacts?${p}`, { headers: hdr() })
      .then(r => r.ok ? r.json() : { data: [], total: 0, hasMore: false, nextOffset: 0 })
      .then(payload => {
        const rows = payload?.data || [];
        const merged = append ? [...contacts, ...rows] : rows;
        const deduped = merged.filter((item, idx, arr) => arr.findIndex(x => x.id === item.id) === idx);
        const sorted = [...deduped].sort((a, b) => {
          const ua = (a.unread_count || 0) > 0 ? 1 : 0;
          const ub = (b.unread_count || 0) > 0 ? 1 : 0;
          if (ub !== ua) return ub - ua;
          const act = fbActivityTs(b) - fbActivityTs(a);
          if (act !== 0) return act;
          const ap = (a.display_phone || a.phone || a.customer?.phone) ? 1 : 0;
          const bp = (b.display_phone || b.phone || b.customer?.phone) ? 1 : 0;
          return bp - ap;
        });
        setContacts(sorted);
        setMeta({ total: payload?.total || 0, hasMore: !!payload?.hasMore, nextOffset: payload?.nextOffset || 0 });
      })
      .catch(() => {});
  }, [search, filter, sourceFilter, meta.nextOffset, sortContacts, fbCompanyQs]);

  // Load DISTINCT nguồn được cấu hình ở Page setup (facebook_pages.default_source_id)
  // — chỉ những nguồn này mới có ý nghĩa khi lọc trên danh bạ FB.
  useEffect(() => {
    fetch(`${API}/api/facebook/page-sources`, { headers: hdr() })
      .then(r => r.ok ? r.json() : { sources: [] })
      .then(data => setPageSources(data?.sources || []))
      .catch(() => setPageSources([]));
  }, []);

  useEffect(() => { load(false); }, [load]);

  useEffect(() => {
    if (!socket) return;

    // Realtime: khi có tin nhắn mới, cập nhật/đẩy contact lên đầu danh sách.
    // Lưu ý: event thường chỉ chứa contact_id + message.created_at → nếu contact chưa có trong list thì fetch chi tiết rồi insert.
    const onFbMessage = (data) => {
      const contactId = data?.contact_id;
      if (!contactId) return;

      const now = data?.message?.created_at || new Date().toISOString();

      // Nếu đang search/filter đặc biệt, tránh insert bừa; fallback reload nhẹ.
      const hasSpecialFilter = !!search || filter !== 'all';
      if (hasSpecialFilter) {
        // Debounce rất nhẹ: chỉ reload nếu contact này đang nằm trong list (để update) hoặc user đang xem lọc.
        load(false);
        return;
      }

      setContacts((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        const ex = list.find((c) => String(c.id) === String(contactId));
        if (ex) {
          const up = {
            ...ex,
            last_message_at: now,
            unread_count: (ex.unread_count || 0) + 1,
          };
          return sortContacts([up, ...list.filter((c) => String(c.id) !== String(contactId))]);
        }
        // Contact chưa có trong list: giữ nguyên, rồi async fetch + insert.
        return list;
      });

      // Fetch & insert nếu chưa có trong list.
      fetch(`${API}/api/facebook/contacts/${encodeURIComponent(contactId)}`, { headers: hdr() })
        .then((r) => (r.ok ? r.json() : null))
        .then((fresh) => {
          if (!fresh) return;
          setContacts((prev) => {
            const list = Array.isArray(prev) ? prev : [];
            const exists = list.some((c) => String(c.id) === String(fresh.id));
            if (exists) return sortContacts(list.map((c) => (String(c.id) === String(fresh.id) ? { ...fresh, unread_count: Math.max(c.unread_count || 0, fresh.unread_count || 0) } : c)));
            const inserted = sortContacts([{ ...fresh, last_message_at: fresh.last_message_at || now }, ...list]);
            // Giữ danh bạ ở mức tối đa 400 contact mới nhất.
            return inserted.slice(0, 400);
          });
        })
        .catch(() => {});
    };
    const onBatchProgress = (data) => {
      if (data.type === 'extract_phones' || data.type === 'sync_then_extract_phones') {
        setBatchProgress(data);
      }
      if (data.type === 'refresh_names') {
        setBatchProgress(data);
        if (data.message || data.phase === 'start') {
          setRefreshAvatarLogs((prev) => {
            const next = [...prev, { ts: new Date().toISOString(), ...data }];
            return next.slice(-80);
          });
        }
      }
    };

    const onBatchDone = (data) => {
      if (data.type === 'refresh_names') {
        setBatchProgress(null);
        setBatchStatus({ type: 'names', loading: false, result: data });
        if (Array.isArray(data.log_lines) && data.log_lines.length) {
          setRefreshAvatarLogs(data.log_lines.slice(-80));
        }
        load();
        return;
      }
      if (data.type !== 'extract_phones') return;
      setBatchProgress(null);
      setBatchStatus({ type: 'phones', loading: false, result: data });
      load();
    };

    const onContactUpdated = (data) => {
      const id = data?.contact_id;
      if (!id) return;
      setContacts((prev) =>
        sortContacts(
          prev.map((c) =>
            String(c.id) === String(id)
              ? { ...c, fb_name: data.fb_name || c.fb_name, fb_profile_pic: data.fb_profile_pic ?? c.fb_profile_pic }
              : c,
          ),
        ),
      );
    };
    const onContactCreated = (data) => {
      const fresh = data?.contact;
      if (!fresh?.id) return;
      const hasSpecialFilter = !!search || filter !== 'all';
      if (hasSpecialFilter) return;
      setContacts((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        const exists = list.some((c) => String(c.id) === String(fresh.id));
        const merged = exists
          ? list.map((c) => (String(c.id) === String(fresh.id) ? { ...c, ...fresh } : c))
          : [{ ...fresh, last_message_at: fresh.last_message_at || fresh.created_at || new Date().toISOString() }, ...list];
        const sorted = sortContacts(merged);
        return sorted.slice(0, 400);
      });
    };
    const onRescanProgress = (p) => {
      setRescanProgress(p);
      if (leadScanRunningRef.current) setLeadScanProgress(p);
    };
    socket.on('fb_message', onFbMessage);
    socket.on('fb_contact_updated', onContactUpdated);
    socket.on('fb_contact_created', onContactCreated);
    socket.on('batch_progress', onBatchProgress);
    socket.on('batch_done', onBatchDone);
    socket.on('rescan_phones_progress', onRescanProgress);
    return () => {
      socket.off('fb_message', onFbMessage);
      socket.off('fb_contact_updated', onContactUpdated);
      socket.off('fb_contact_created', onContactCreated);
      socket.off('batch_progress', onBatchProgress);
      socket.off('batch_done', onBatchDone);
      socket.off('rescan_phones_progress', onRescanProgress);
    };
  }, [socket, load, sortContacts, search, filter]);

  const startEdit = (c) => { setEditing(c.id); setForm({ fb_name: c.fb_name || '', phone: c.phone || '', email: c.email || '', notes: c.notes || '' }); };

  const saveEdit = async (id) => {
    try {
      const res = await fetch(`${API}/api/facebook/contacts/${id}`, { method: 'PUT', headers: hdr(), body: JSON.stringify(form) });
      if (res.ok) { const d = await res.json(); setContacts(prev => prev.map(c => c.id === id ? d : c)); setEditing(null); }
    } catch (e) { alert('Lỗi'); }
  };

  const deleteContact = async (id, name) => {
    if (!confirm(`Xóa liên hệ "${name}" và toàn bộ tin nhắn?`)) return;
    try { await fetch(`${API}/api/facebook/contacts/${id}`, { method: 'DELETE', headers: hdr() }); setContacts(prev => prev.filter(c => c.id !== id)); } catch (e) { alert('Lỗi'); }
  };

  // Batch: tạo Lead cho contact chưa có lead
  const batchCreateLeads = async () => {
    const noLead = contacts.filter(c => !c.lead_id);
    if (!noLead.length) return alert('Tất cả liên hệ đã có bản ghi CRM!');
    if (!confirm(`Tạo mới theo cài đặt Page cho ${noLead.length} liên hệ chưa có bản ghi CRM?`)) return;
    setBatchStatus({ type: 'leads', loading: true, result: null });
    try {
      const res = await fetch(`${API}/api/facebook/batch-create-leads`, { method: 'POST', headers: hdr() });
      const data = await res.json();
      setBatchStatus({ type: 'leads', loading: false, result: data });
      load(); // Refresh danh sách
    } catch (e) {
      setBatchStatus({ type: 'leads', loading: false, result: { error: e.message } });
    }
  };

  // Batch: quét SĐT + thông tin từ tin nhắn (chỉ DB, không gọi Graph)
  const batchExtractPhones = async () => {
    if (!confirm('Đọc tin nhắn đã lưu trong hệ thống để tìm SĐT/địa chỉ (không đồng bộ mới từ Facebook). Tiếp tục?')) return;
    setBatchProgress(null);
    setBatchStatus({ type: 'phones', loading: true, result: null });
    try {
      const res = await fetch(`${API}/api/facebook/batch-extract-phones`, { method: 'POST', headers: hdr() });
      const data = await res.json();
      if (!data?.total) {
        setBatchStatus({ type: 'phones', loading: false, result: data });
      }
    } catch (e) {
      setBatchStatus({ type: 'phones', loading: false, result: { error: e.message } });
    }
  };

  /** Pipeline v2: từng contact chưa lead — Graph → quét inbound → tạo lead (không nối batch HTTP cũ). */
  const batchSyncThenExtractPhones = async () => {
    const n = Math.min(500, Math.max(1, Number(chainUserLimit) || 50));
    if (!confirm(`Chạy pipeline v2 cho tối đa ${n} liên hệ chưa có lead (đồng bộ tin → quét SĐT → tạo lead nếu đủ điều kiện). Tiếp tục?`)) return;
    setBatchProgress(null);
    setBatchStatus({ type: 'sync_then_phones', loading: true, result: null });
    try {
      const res = await fetch(`${API}/api/facebook/pipeline-v2/run`, {
        method: 'POST',
        headers: { ...hdr(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: n,
          graph_pages: 12,
          company_id: toolCompanyId,
          clear_phone_when_no_new_inbound: v2ClearPhoneNoInbound,
          delete_lead_when_no_phone_after_clear: v2DeleteLeadNoPhone,
          cleanup_contacts_with_lead: v2CleanupWithLead,
          cleanup_limit: n,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || res.statusText);
      setChainPoolOffset(0);
      setBatchProgress(null);
      setBatchStatus({ type: 'sync_then_phones', loading: false, result: data });
      load();
    } catch (e) {
      setBatchProgress(null);
      setBatchStatus({ type: 'sync_then_phones', loading: false, result: { error: e.message } });
    }
  };

  const loadAudit = async () => {
    setAuditLoading(true);
    try {
      const res = await fetch(`${API}/api/facebook/audit-phone-sync`, { headers: hdr() });
      const data = await res.json();
      setAudit(data);
    } catch (e) {
      setAudit({ error: e.message });
    }
    setAuditLoading(false);
  };

  const runPhoneQualityScan = async () => {
    setPqLoading(true);
    setPqError(null);
    setPqResult(null);
    setPqSelectedDel([]);
    try {
      const body = {
        limit: pqForm.limit,
        lead_date_from: pqForm.lead_date_from?.trim() || undefined,
        lead_date_to: pqForm.lead_date_to?.trim() || undefined,
        include_contacts_without_lead_in_range: pqForm.include_contacts_without_lead_in_range,
        include_lead_bad_customer_phone: pqForm.include_lead_bad_customer_phone,
      };
      const res = await fetch(`${API}/api/facebook/phone-quality-scan`, {
        method: 'POST',
        headers: { ...hdr(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      setPqResult(data);
    } catch (e) {
      setPqError(e.message);
    } finally {
      setPqLoading(false);
    }
  };

  const togglePqDel = (contactId) => {
    const id = String(contactId);
    setPqSelectedDel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const pqDeleteCandidateIds = useMemo(
    () => (pqResult?.rows || []).filter((r) => !r.scanned_ok).map((r) => String(r.contact_id)),
    [pqResult],
  );
  const allPqDeleteSelected =
    pqDeleteCandidateIds.length > 0 && pqDeleteCandidateIds.every((id) => pqSelectedDel.includes(id));
  const pqDeleteSelectedInTable = pqDeleteCandidateIds.filter((id) => pqSelectedDel.includes(id)).length;

  useEffect(() => {
    const el = pqBulkDelHeaderRef.current;
    if (!el) return;
    el.indeterminate = pqDeleteSelectedInTable > 0 && pqDeleteSelectedInTable < pqDeleteCandidateIds.length;
  }, [pqDeleteSelectedInTable, pqDeleteCandidateIds.length]);

  /** Một cú nhấp: chọn hết các dòng đủ điều kiện xóa (để bấm Xóa ngay). */
  const selectAllPqForDelete = () => {
    if (!pqDeleteCandidateIds.length) return;
    setPqSelectedDel([...pqDeleteCandidateIds]);
  };
  /** Alias tên cũ (tránh ReferenceError nếu còn tham chiếu / cache bundle). */
  const selectAllPqDeleteCandidates = selectAllPqForDelete;

  const togglePqDeleteSelectAllFromHeader = () => {
    if (!pqDeleteCandidateIds.length) return;
    if (allPqDeleteSelected) setPqSelectedDel([]);
    else setPqSelectedDel([...pqDeleteCandidateIds]);
  };

  const applyPhoneQualityUpdates = async () => {
    const ids = (pqResult?.rows || []).filter((r) => r.scanned_ok).map((r) => r.contact_id);
    if (!ids.length) return alert('Không có dòng nào quét được SĐT đúng để cập nhật.');
    if (!confirm(`Cập nhật SĐT chuẩn cho ${ids.length} contact (contact + KH + mô tả lead)?`)) return;
    setPqApplyLoading(true);
    try {
      const res = await fetch(`${API}/api/facebook/phone-quality-apply`, {
        method: 'POST',
        headers: { ...hdr(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          update_contact_ids: ids,
          delete_contact_ids: [],
          sync_customer: true,
          delete_customer: false,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      alert(`Đã cập nhật ${data.updated?.length || 0} contact. Bỏ qua: ${data.update_skipped?.length || 0}`);
      load(false);
      await runPhoneQualityScan();
    } catch (e) {
      alert(e.message);
    } finally {
      setPqApplyLoading(false);
    }
  };

  const applyPhoneQualityDeletes = async () => {
    if (!pqSelectedDel.length) return alert('Chọn ít nhất một dòng (ô xóa).');
    if (
      !confirm(
        `Xóa lead (nếu đủ điều kiện an toàn), xóa user khỏi danh bạ và toàn bộ tin nhắn — các dòng đã chọn${pqDeleteCustomer ? '; có thể xóa KH mồ côi nếu được' : ''}. Tiếp tục?`,
      )
    )
      return;
    setPqApplyLoading(true);
    try {
      const res = await fetch(`${API}/api/facebook/phone-quality-apply`, {
        method: 'POST',
        headers: { ...hdr(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          update_contact_ids: [],
          delete_contact_ids: pqSelectedDel,
          sync_customer: true,
          delete_customer: pqDeleteCustomer,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `HTTP ${res.status}`);
      const blocked = data.delete_blocked || [];
      const blockedLines =
        blocked.length > 0
          ? `\n\nKhông xóa được (${blocked.length}):\n${blocked
              .slice(0, 10)
              .map((b) => {
                const cid = String(b.contact_id || '');
                const short = cid.length > 12 ? `${cid.slice(0, 8)}…` : cid;
                return `• ${short} — ${b.reason || '?'}`;
              })
              .join('\n')}${blocked.length > 10 ? `\n… và ${blocked.length - 10} dòng nữa` : ''}`
          : '';
      alert(
        `Đã xóa ${data.deleted?.length || 0} liên hệ khỏi danh bạ. Chặn: ${blocked.length}. Xóa KH: ${data.customers_deleted?.length || 0}.${blockedLines}`,
      );
      setPqSelectedDel([]);
      load(false);
      await runPhoneQualityScan();
    } catch (e) {
      alert(e.message);
    } finally {
      setPqApplyLoading(false);
    }
  };

  // Refresh tên các contact bị "Facebook User"
  const refreshNames = async () => {
    const stuckNameCount = contacts.filter((c) => !c.fb_name || c.fb_name === 'Facebook User' || c.fb_name === 'User').length;
    if (!stuckNameCount) return alert('Tất cả liên hệ đã có tên!');
    if (!confirm(`Cập nhật tên cho tối đa 100 liên hệ đang thiếu tên (${stuckNameCount} trên trang hiện tại)?`)) return;
    setRefreshAvatarLogs([]);
    setBatchStatus({ type: 'names', loading: true, result: null });
    setBatchProgress({ type: 'refresh_names', phase: 'start', current: 0, total: 100, message: 'Đang refresh tên…' });
    try {
      const res = await fetch(`${API}/api/facebook/refresh-names`, {
        method: 'POST',
        headers: { ...hdr(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: toolCompanyId }),
      });
      const data = await res.json();
      setBatchStatus({ type: 'names', loading: false, result: data });
      setBatchProgress(null);
      if (Array.isArray(data.log_lines) && data.log_lines.length) {
        setRefreshAvatarLogs(data.log_lines.slice(-80));
      }
      if (!res.ok) {
        alert(data.error || 'Lỗi refresh');
        return;
      }
      load();
    } catch (e) {
      setBatchStatus({ type: 'names', loading: false, result: { error: e.message } });
      setBatchProgress(null);
    }
  };

  // Batch: Đồng bộ tất cả tin nhắn từ Facebook
  const batchSyncMessages = async () => {
    if (!confirm('Đồng bộ tin nhắn từ Facebook cho tất cả liên hệ? (có thể mất vài phút)')) return;
    setBatchStatus({ type: 'sync', loading: true, result: null });
    try {
      const res = await fetch(`${API}/api/facebook/batch-sync-messages`, {
        method: 'POST',
        headers: { ...hdr(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode: 'all', company_id: toolCompanyId }),
      });
      const data = await res.json();
      setBatchStatus({ type: 'sync', loading: false, result: data });
      load();
    } catch (e) {
      setBatchStatus({ type: 'sync', loading: false, result: { error: e.message } });
    }
  };

  // Kiểm tra & xóa lead trùng không liên kết FB
  const dedupLeads = async () => {
    if (!confirm('Kiểm tra và xóa lead trùng không liên kết với Facebook?')) return;
    setBatchStatus({ type: 'dedup', loading: true, result: null });
    try {
      const res = await fetch(`${API}/api/facebook/dedup-leads`, {
        method: 'POST',
        headers: { ...hdr(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: toolCompanyId }),
      });
      const data = await res.json();
      setBatchStatus({ type: 'dedup', loading: false, result: data });
      load();
    } catch (e) {
      setBatchStatus({ type: 'dedup', loading: false, result: { error: e.message } });
    }
  };

  return (
    <div className="p-6 overflow-y-auto h-full">
      <div className="mb-4 shrink-0 space-y-3" data-tour="fb-contacts-auto-tools">
        <AutoToolPanel onComplete={() => load(false)} />
        <BatchActionsBar onComplete={() => load(false)} companyId={toolCompanyId} isAdmin={isAdmin} />
      </div>
      <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
        <div>
          <h2 className="text-lg font-bold">👥 Danh bạ Facebook ({contacts.length}/{meta.total || 0})</h2>
          {batchStatus?.loading && batchProgress && batchStatus?.type === 'names' && (
            <div className="mt-2 text-xs text-purple-800 bg-purple-50 border border-purple-100 rounded-lg px-2 py-1.5 space-y-1">
              <div>
                🔄 Refresh tên:{' '}
                <span className="font-medium">{batchProgress.name || batchProgress.message || '…'}</span>
                {batchProgress.total ? (
                  <span> ({batchProgress.current || 0}/{batchProgress.total})</span>
                ) : null}
              </div>
              {batchProgress.total > 0 && (
                <div className="h-1.5 bg-purple-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-purple-500 rounded-full transition-all"
                    style={{ width: `${Math.min(100, ((batchProgress.current || 0) / batchProgress.total) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          )}
          {batchStatus?.loading && batchProgress && (batchStatus?.type === 'phones' || batchStatus?.type === 'sync_then_phones') && (
            <div className="mt-2 text-xs text-gray-600 space-y-1">
              <div>
                {batchStatus?.type === 'sync_then_phones' && batchProgress.phase === 'sync' && '📨 Đồng bộ '}
                {batchStatus?.type === 'sync_then_phones' && batchProgress.phase === 'extract' && '📞 Quét '}
                {batchStatus?.type === 'sync_then_phones' && batchProgress.phase === 'lead_sync' && '📝 '}
                {batchStatus?.type === 'phones' && 'Đang quét: '}
                <span className="font-medium">{batchProgress.name || '...'}</span>
                {' '}({batchProgress.current || 0}/{batchProgress.total || 0})
                {batchStatus?.type === 'sync_then_phones' && batchProgress.phase === 'extract' && batchProgress.synced != null && (
                  <span className="text-indigo-600"> · +{batchProgress.synced} tin mới</span>
                )}
              </div>
              <div className="w-72 max-w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${batchStatus?.type === 'sync_then_phones' ? 'bg-indigo-500' : 'bg-blue-500'}`}
                  style={{ width: `${batchProgress.total ? Math.round(((batchProgress.current || 0) / batchProgress.total) * 100) : 0}%` }}
                />
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button onClick={batchSyncMessages} disabled={batchStatus?.loading}
            className="px-3 py-1.5 text-xs font-medium bg-teal-50 text-teal-700 border border-teal-200 rounded-lg hover:bg-teal-100 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer">
            {batchStatus?.type === 'sync' && batchStatus.loading ? <span className="animate-spin h-3 w-3 border-2 border-teal-600 border-t-transparent rounded-full" /> : '📨'}
            Đồng bộ tin nhắn
          </button>
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg border border-indigo-200 bg-indigo-50/80 flex-wrap">
            <label className="text-[10px] text-indigo-900 font-medium whitespace-nowrap" title="Thứ tự: hoạt động mới nhất trước (theo server)">Sync→Quét</label>
            <input
              type="number"
              min={1}
              max={500}
              value={chainUserLimit}
              onChange={(e) => setChainUserLimit(Math.min(500, Math.max(1, parseInt(e.target.value, 10) || 1)))}
              className="w-12 px-1 py-0.5 text-xs border border-indigo-200 rounded text-center bg-white"
              title="Số user tối đa mỗi lần"
            />
            <span className="text-[9px] text-indigo-700">off</span>
            <input
              type="number"
              min={0}
              value={chainPoolOffset}
              onChange={(e) => setChainPoolOffset(Math.max(0, parseInt(e.target.value, 10) || 0))}
              className="w-14 px-1 py-0.5 text-xs border border-indigo-200 rounded text-center bg-white"
              title="Offset trong pool (tự tăng sau mỗi lần chạy nếu chưa hết pool)"
            />
            <button
              type="button"
              onClick={() => setChainPoolOffset(0)}
              className="text-[9px] px-1 py-0.5 text-indigo-700 hover:bg-indigo-100 rounded cursor-pointer"
              title="Đặt offset về 0"
            >
              ↺0
            </button>
            <button
              onClick={batchSyncThenExtractPhones}
              disabled={batchStatus?.loading}
              className="px-2 py-1 text-[10px] font-semibold bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              {batchStatus?.type === 'sync_then_phones' && batchStatus.loading ? <span className="inline-block animate-spin h-3 w-3 border-2 border-white border-t-transparent rounded-full align-middle mr-0.5" /> : null}
              Chạy
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-gray-600 w-full max-w-xl">
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={v2ClearPhoneNoInbound} onChange={(e) => setV2ClearPhoneNoInbound(e.target.checked)} />
              Xóa SĐT cũ nếu không quét được SĐT inbound mới (giữ nếu mới trùng cũ)
            </label>
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={v2DeleteLeadNoPhone} onChange={(e) => setV2DeleteLeadNoPhone(e.target.checked)} disabled={!v2ClearPhoneNoInbound} />
              Xóa lead an toàn sau khi hết SĐT
            </label>
            <label className="inline-flex items-center gap-1 cursor-pointer">
              <input type="checkbox" checked={v2CleanupWithLead} onChange={(e) => setV2CleanupWithLead(e.target.checked)} disabled={!v2ClearPhoneNoInbound} />
              Thêm lượt contact đã có lead (dọn SĐT sai)
            </label>
          </div>
          <button onClick={batchCreateLeads} disabled={batchStatus?.loading}
            className="px-3 py-1.5 text-xs font-medium bg-green-50 text-green-700 border border-green-200 rounded-lg hover:bg-green-100 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer">
            {batchStatus?.type === 'leads' && batchStatus.loading ? <span className="animate-spin h-3 w-3 border-2 border-green-600 border-t-transparent rounded-full" /> : '🆕'}
            Tạo mới hàng loạt
          </button>
          <button onClick={refreshNames} disabled={batchStatus?.loading}
            className="px-3 py-1.5 text-xs font-medium bg-purple-50 text-purple-700 border border-purple-200 rounded-lg hover:bg-purple-100 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer">
            {batchStatus?.type === 'names' && batchStatus.loading ? <span className="animate-spin h-3 w-3 border-2 border-purple-600 border-t-transparent rounded-full" /> : '🔄'}
            Refresh tên
          </button>
          <button onClick={dedupLeads} disabled={batchStatus?.loading}
            className="px-3 py-1.5 text-xs font-medium bg-orange-50 text-orange-700 border border-orange-200 rounded-lg hover:bg-orange-100 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer">
            {batchStatus?.type === 'dedup' && batchStatus.loading ? <span className="animate-spin h-3 w-3 border-2 border-orange-600 border-t-transparent rounded-full" /> : '🔍'}
            Xóa Lead trùng
          </button>
          <button onClick={batchExtractPhones} disabled={batchStatus?.loading}
            className="px-3 py-1.5 text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            title="Chỉ đọc tin đã lưu DB — không kéo tin mới từ Facebook">
            {batchStatus?.type === 'phones' && batchStatus.loading ? <span className="animate-spin h-3 w-3 border-2 border-blue-600 border-t-transparent rounded-full" /> : '📞'}
            Quét SĐT (DB)
          </button>
          <button
            onClick={() => setRescanOpen(true)}
            disabled={rescanStatus?.loading}
            className="px-3 py-1.5 text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200 rounded-lg hover:bg-rose-100 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            title="Quét lại SĐT (chỉ tin của user FB, bỏ qua link, có thể ghi đè SĐT cũ)"
          >
            {rescanStatus?.loading ? <span className="animate-spin h-3 w-3 border-2 border-rose-600 border-t-transparent rounded-full" /> : '🔁'}
            Quét lại SĐT
          </button>
          <button
            type="button"
            onClick={() => setLeadScanOpen(true)}
            disabled={leadScanStatus?.loading}
            className="px-3 py-1.5 text-xs font-medium bg-amber-50 text-amber-900 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            title="Theo ngày tạo lead: đồng bộ tin (tùy chọn), quét SĐT; có SĐT mới → cập nhật lead; có SĐT nhưng không quét được → xóa lead + user FB"
          >
            {leadScanStatus?.loading ? <span className="animate-spin h-3 w-3 border-2 border-amber-700 border-t-transparent rounded-full" /> : '📅'}
            Quét lead theo ngày
          </button>
          <select value={limitSize} onChange={e => setLimitSize(Number(e.target.value))} className="px-2 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-700">
            <option value={1000}>1000</option>
            <option value={2000}>2000</option>
            <option value={5000}>5000</option>
          </select>
          <button onClick={() => load(false)} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1 cursor-pointer"><RefreshCw size={14} /> Làm mới</button>
        </div>
      </div>

      <div className="mb-4 bg-white border rounded-xl p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="text-sm font-semibold text-gray-800">Đối soát SĐT Contact → Customer → Lead</div>
            <div className="text-xs text-gray-500">Kiểm tra vì sao contact đã có số nhưng dashboard CRM chưa phản ánh.</div>
          </div>
          <button
            onClick={loadAudit}
            disabled={auditLoading}
            className="px-3 py-1.5 text-xs font-medium bg-slate-50 text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-100 disabled:opacity-50 cursor-pointer"
          >
            {auditLoading ? 'Đang kiểm tra...' : 'Kiểm tra mismatch'}
          </button>
        </div>
        {audit && !audit.error && (
          <div className="mt-3 space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
              <div className="bg-gray-50 rounded-lg p-2">Tổng contacts: <strong>{audit.total_contacts || 0}</strong></div>
              <div className="bg-green-50 rounded-lg p-2">Contacts có SĐT: <strong>{audit.contacts_with_phone || 0}</strong></div>
              <div className="bg-blue-50 rounded-lg p-2">Contacts có lead: <strong>{audit.contacts_with_lead || 0}</strong></div>
              <div className="bg-emerald-50 rounded-lg p-2">Lead có `customer.phone`: <strong>{audit.leads_with_customer_phone || 0}</strong></div>
              <div className="bg-amber-50 rounded-lg p-2">Contact có SĐT nhưng customer thiếu: <strong>{audit.mismatches_contact_has_phone_customer_missing || 0}</strong></div>
              <div className="bg-red-50 rounded-lg p-2">Lead có nhưng customer chưa có SĐT: <strong>{audit.mismatches_lead_exists_no_customer_phone || 0}</strong></div>
            </div>
            {!!audit.samples?.length && (
              <div className="max-h-48 overflow-y-auto border rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="text-left px-2 py-2">Loại</th>
                      <th className="text-left px-2 py-2">Tên</th>
                      <th className="text-left px-2 py-2">Contact phone</th>
                      <th className="text-left px-2 py-2">Lead</th>
                      <th className="text-left px-2 py-2">Customer phone</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.samples.map((s, idx) => (
                      <tr key={idx} className="border-t">
                        <td className="px-2 py-2 text-gray-500">{s.kind}</td>
                        <td className="px-2 py-2">{s.fb_name || '—'}</td>
                        <td className="px-2 py-2 text-green-700">{s.contact_phone || '—'}</td>
                        <td className="px-2 py-2 text-blue-700">{s.lead_code || '—'}</td>
                        <td className="px-2 py-2 text-red-700">{s.customer_phone || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
        {audit?.error && <div className="mt-3 text-xs text-red-600">❌ {audit.error}</div>}
      </div>

      <div className="mb-4 bg-violet-50/60 border border-violet-200 rounded-xl p-4 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div className="min-w-[200px]">
            <div className="text-sm font-semibold text-violet-950">Quét SĐT sai / dài / nghi từ link</div>
            <p className="text-xs text-violet-900/85 mt-1 leading-relaxed">
              Gồm SĐT trên contact <strong>hoặc</strong> trên khách hàng CRM khi có khoảng ngày: không chuẩn VN, <strong>&gt; 11 chữ số</strong>, hoặc <strong>≥ 5 số liền kề giống nhau</strong> (hay gặp khi dính id/link).
              Hệ thống đọc lại tin <strong>inbound</strong> (đã loại URL). «SĐT quét được» chuẩn VN → <strong>cập nhật</strong>; không có → chọn <strong>xóa</strong> (và tùy chọn xóa KH mồ côi).
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="number"
              min={1}
              max={500}
              className="w-16 px-2 py-1 text-xs border border-violet-200 rounded-md bg-white"
              value={pqForm.limit}
              onChange={(e) => setPqForm((f) => ({ ...f, limit: Math.min(500, Math.max(1, parseInt(e.target.value, 10) || 150)) }))}
              title="Tối đa contact sau lọc"
            />
            <label className="text-[10px] text-violet-900 flex items-center gap-1">
              <span>Từ</span>
              <input
                type="date"
                className="text-xs border border-violet-200 rounded px-1 py-0.5 bg-white"
                value={pqForm.lead_date_from}
                onChange={(e) => setPqForm((f) => ({ ...f, lead_date_from: e.target.value }))}
              />
            </label>
            <label className="text-[10px] text-violet-900 flex items-center gap-1">
              <span>Đến</span>
              <input
                type="date"
                className="text-xs border border-violet-200 rounded px-1 py-0.5 bg-white"
                value={pqForm.lead_date_to}
                onChange={(e) => setPqForm((f) => ({ ...f, lead_date_to: e.target.value }))}
              />
            </label>
            <button
              type="button"
              onClick={() => void runPhoneQualityScan()}
              disabled={pqLoading}
              className="px-3 py-1.5 text-xs font-semibold bg-violet-600 text-white rounded-lg hover:bg-violet-700 disabled:opacity-50 cursor-pointer"
            >
              {pqLoading ? 'Đang quét…' : '🔎 Quét'}
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 mb-2">
          <label className="inline-flex items-center gap-2 text-[11px] text-violet-900 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={pqForm.include_contacts_without_lead_in_range}
              onChange={(e) => setPqForm((f) => ({ ...f, include_contacts_without_lead_in_range: e.target.checked }))}
            />
            Khi có khoảng ngày: gồm contact chưa lead (theo ngày tạo contact), giống «Quét lại SĐT»
          </label>
          <label className="inline-flex items-center gap-2 text-[11px] text-violet-900 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={pqForm.include_lead_bad_customer_phone}
              onChange={(e) => setPqForm((f) => ({ ...f, include_lead_bad_customer_phone: e.target.checked }))}
            />
            Khi có khoảng ngày: thêm lead có <strong>SĐT khách hàng</strong> xấu (dù contact chưa hiện số lỗi)
          </label>
        </div>
        {pqError && <div className="text-xs text-red-700 mb-2">❌ {pqError}</div>}
        {pqResult && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2 text-[11px] text-violet-950 bg-white/70 rounded-lg px-2 py-1.5 border border-violet-100">
              <span>Pool DB: <strong>{pqResult.pool_fetched}</strong></span>
              {(pqResult.merged_from_customer_phone ?? 0) > 0 && (
                <span>· Thêm từ SĐT KH: <strong>{pqResult.merged_from_customer_phone}</strong></span>
              )}
              <span>· SĐT xấu (gộp): <strong>{pqResult.bad_stored_count}</strong></span>
              {pqResult.date_filter_active && (
                <>
                  <span>· Sau lọc ngày: <strong>{pqResult.pool_after_date_filter}</strong></span>
                  <span>· Loại khoảng: <strong>{pqResult.skipped_by_lead_date}</strong></span>
                </>
              )}
              <span>· Trả về: <strong>{pqResult.rows_returned}</strong></span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void applyPhoneQualityUpdates()}
                disabled={pqApplyLoading || !(pqResult.rows || []).some((r) => r.scanned_ok)}
                className="px-3 py-1.5 text-xs font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-40 cursor-pointer"
              >
                {pqApplyLoading ? '…' : `✅ Cập nhật SĐT đúng (${(pqResult.rows || []).filter((r) => r.scanned_ok).length})`}
              </button>
              <button
                type="button"
                onClick={selectAllPqForDelete}
                disabled={!pqDeleteCandidateIds.length || pqApplyLoading}
                className="px-3 py-1.5 text-xs font-semibold border border-violet-400 rounded-lg text-violet-950 bg-violet-100/80 hover:bg-violet-200 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                title="Tick tất cả ô xóa (dòng không quét được SĐT đúng)"
              >
                Chọn tất cả để xóa
              </button>
              <label className="inline-flex items-center gap-1.5 text-[11px] text-violet-950 cursor-pointer">
                <input type="checkbox" checked={pqDeleteCustomer} onChange={(e) => setPqDeleteCustomer(e.target.checked)} />
                Xóa luôn KH mồ côi (không SĐT, an toàn)
              </label>
              <button
                type="button"
                onClick={() => void applyPhoneQualityDeletes()}
                disabled={pqApplyLoading || pqSelectedDel.length === 0}
                className="px-3 py-1.5 text-xs font-semibold bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-40 cursor-pointer"
              >
                🗑 Xóa lead / gỡ SĐT ({pqSelectedDel.length})
              </button>
            </div>
            <div className="max-h-96 overflow-auto border border-violet-200 rounded-lg bg-white">
              <table className="w-full text-[11px]">
                <thead className="bg-violet-100/80 sticky top-0">
                  <tr>
                    <th className="text-center p-1.5 w-10">
                      <input
                        ref={pqBulkDelHeaderRef}
                        type="checkbox"
                        className="rounded border-violet-500 cursor-pointer"
                        checked={allPqDeleteSelected && pqDeleteCandidateIds.length > 0}
                        disabled={!pqDeleteCandidateIds.length || pqApplyLoading}
                        onChange={togglePqDeleteSelectAllFromHeader}
                        title={allPqDeleteSelected ? 'Bỏ chọn tất cả' : 'Chọn tất cả để xóa'}
                        aria-label="Chọn tất cả để xóa"
                      />
                    </th>
                    <th className="text-left p-1.5">Tên</th>
                    <th className="text-left p-1.5">SĐT đang lưu</th>
                    <th className="text-left p-1.5">Cảnh báo</th>
                    <th className="text-center p-1.5">Tin</th>
                    <th className="text-left p-1.5">SĐT quét được</th>
                    <th className="text-left p-1.5">Gợi ý</th>
                  </tr>
                </thead>
                <tbody>
                  {(pqResult.rows || []).map((row) => (
                    <tr key={row.contact_id} className="border-t border-violet-100 hover:bg-violet-50/80">
                      <td className="p-1.5 text-center">
                        {!row.scanned_ok ? (
                          <input
                            type="checkbox"
                            className="rounded border-violet-400"
                            checked={pqSelectedDel.includes(String(row.contact_id))}
                            onChange={() => togglePqDel(row.contact_id)}
                          />
                        ) : (
                          <span className="text-violet-300">—</span>
                        )}
                      </td>
                      <td className="p-1.5 font-medium text-gray-800 truncate max-w-[140px]" title={row.fb_name}>
                        {row.fb_name || '—'}
                      </td>
                      <td className="p-1.5 font-mono text-red-800 break-all max-w-[160px]">
                        {row.stored_phone}
                        {row.phone_issue_source === 'customer' && (
                          <span className="block text-[9px] text-violet-700 font-sans mt-0.5">(theo KH CRM)</span>
                        )}
                      </td>
                      <td className="p-1.5 text-gray-700">
                        {(() => {
                          const si = row.stored_issue || {};
                          const bits = [];
                          if ((si.suspicious_repeat_run ?? 0) >= 5) bits.push(`Lặp ${si.suspicious_repeat_run} số liền nhau`);
                          if ((si.digit_count ?? 0) > 11) bits.push(`Quá dài (${si.digit_count} số)`);
                          if (si.likely_from_link && bits.length === 0) bits.push(`Nghi link / URL (${si.digit_count} số)`);
                          if (!bits.length) bits.push('Không chuẩn VN');
                          return bits.join(' · ');
                        })()}
                      </td>
                      <td className="p-1.5 text-center text-gray-600">{row.messages_scanned}</td>
                      <td className="p-1.5 font-mono text-emerald-800">{row.scanned_phone || '—'}</td>
                      <td className="p-1.5">
                        {row.scanned_ok ? (
                          <span className="text-emerald-700 font-medium">Cập nhật</span>
                        ) : (
                          <span className="text-red-700 font-medium">Xóa / gỡ</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!(pqResult.rows || []).length && (
                <p className="text-center text-gray-500 py-6 text-xs">Không có contact SĐT sai trong phạm vi quét.</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Batch result banner */}
      {batchStatus?.result && !batchStatus.loading && (
        <div className={`mb-4 rounded-xl text-sm ${batchStatus.result.error ? 'bg-red-50 text-red-700 border border-red-200 p-3' : 'bg-green-50 text-green-700 border border-green-200 p-3'}`}>
          <div className="flex items-center justify-between">
            <div>
              {batchStatus.result.error ? (
                <span>❌ Lỗi: {batchStatus.result.error}</span>
              ) : batchStatus.type === 'sync' ? (
                <span>✅ Đã đồng bộ <strong>{batchStatus.result.totalSynced || 0}</strong> tin nhắn mới từ <strong>{batchStatus.result.total || 0}</strong> liên hệ</span>
              ) : batchStatus.type === 'leads' ? (
                <span>✅ Đã tạo <strong>{batchStatus.result.created || 0}</strong> Lead mới — Bỏ qua: {batchStatus.result.skipped || 0} (đã có Lead)</span>
              ) : batchStatus.type === 'dedup' ? (
                <span>✅ {batchStatus.result.message}</span>
              ) : batchStatus.type === 'names' ? (
                <span>
                  ✅ Refresh tên: <strong>{batchStatus.result.updated ?? 0}</strong>/{batchStatus.result.total ?? 0} contact
                </span>
              ) : batchStatus.type === 'sync_then_phones' ? (
                <span>
                  {batchStatus.result.leadsCreated != null ? (
                    <>
                      ✅ Pipeline v2: <strong>{batchStatus.result.processed || 0}</strong> contact — <strong>{batchStatus.result.messagesSynced || 0}</strong> tin mới,
                      quét cập nhật: <strong>{batchStatus.result.extractUpdated || 0}</strong>, lead mới: <strong>{batchStatus.result.leadsCreated || 0}</strong>
                      {(batchStatus.result.phonesClearedNoInbound > 0 || batchStatus.result.leadsDeletedAfterClear > 0) && (
                        <span className="block text-xs mt-1 text-amber-800 font-normal">
                          Đã xóa SĐT lưu (không có inbound mới): <strong>{batchStatus.result.phonesClearedNoInbound || 0}</strong>
                          {' · '}
                          Lead đã xóa (sau dọn SĐT): <strong>{batchStatus.result.leadsDeletedAfterClear || 0}</strong>
                          {batchStatus.result.cleanup_processed ? (
                            <> · Contact đã lead (lượt dọn): <strong>{batchStatus.result.cleanup_processed}</strong></>
                          ) : null}
                        </span>
                      )}
                      {batchStatus.result.message ? (
                        <span className="block text-xs mt-1 text-green-900/80 font-normal">{batchStatus.result.message}</span>
                      ) : null}
                    </>
                  ) : (
                    <>
                      ✅ Đã xử lý <strong>{batchStatus.result.processed || 0}</strong> user (sync→quét) — <strong>{batchStatus.result.total_messages_synced || 0}</strong> tin mới từ Facebook,
                      cập nhật quét: <strong>{batchStatus.result.extract_updated || 0}</strong>, bỏ qua đã có SĐT: <strong>{batchStatus.result.extract_skipped_has_phone || 0}</strong>
                      {batchStatus.result.pool_total != null && (
                        <span className="block text-xs mt-1 text-green-900/80 font-normal">
                          Pool server: <strong>{batchStatus.result.pool_total}</strong>
                          {typeof batchStatus.result.next_offset === 'number' && (
                            <> · Offset tiếp (đã gán vào ô «off»): <strong>{batchStatus.result.next_offset}</strong></>
                          )}
                          {batchStatus.result.done_pool ? ' · Đã hết pool lần này' : ''}
                        </span>
                      )}
                    </>
                  )}
                </span>
              ) : (
                <span>✅ Quét <strong>{batchStatus.result.total || 0}</strong> liên hệ — Tìm thấy: <strong>{batchStatus.result.foundPhones || 0}</strong> SĐT mới</span>
              )}
            </div>
            <button onClick={() => { setBatchStatus(null); setRefreshAvatarLogs([]); }} className="text-gray-400 hover:text-gray-600 cursor-pointer">✕</button>
          </div>

          {batchStatus.type === 'names' && refreshAvatarLogs.length > 0 && (
            <details open className="mt-3 text-xs">
              <summary className="cursor-pointer text-purple-800 font-medium hover:underline">
                📋 Log refresh tên ({refreshAvatarLogs.length} dòng)
              </summary>
              <div className="mt-2 max-h-56 overflow-y-auto border border-purple-100 rounded-lg bg-white font-mono text-[10px] leading-relaxed">
                {refreshAvatarLogs.map((line, idx) => (
                  <div
                    key={`${line.ts || idx}-${line.psid || idx}`}
                    className={`px-2 py-1 border-b border-gray-50 ${line.real_pic ? 'text-green-700 bg-green-50/40' : line.graph_denied ? 'text-amber-800 bg-amber-50/40' : line.status === 'updated' ? 'text-blue-800' : 'text-gray-600'}`}
                  >
                    {line.message || `${line.phase || line.step || ''} ${line.name || ''}`.trim()}
                    {line.source ? <span className="text-gray-400"> · {line.source}</span> : null}
                    {line.current && line.total ? <span className="text-gray-400"> · {line.current}/{line.total}</span> : null}
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Chi tiết kết quả quét SĐT */}
          {batchStatus.type === 'phones' && !batchStatus.result.error && batchStatus.result.leadsUpdatedPhone != null && (
            <div className="mt-3 space-y-2">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                <div className="bg-white rounded-lg p-2 border">Contact SĐT mới: <strong className="text-green-700">{batchStatus.result.updatedContactPhone || 0}</strong></div>
                <div className="bg-white rounded-lg p-2 border">Customer SĐT mới: <strong className="text-blue-700">{batchStatus.result.updatedCustomerPhone || 0}</strong></div>
                <div className="bg-white rounded-lg p-2 border">Địa chỉ KH: <strong className="text-purple-700">{batchStatus.result.updatedCustomerAddress || 0}</strong></div>
                <div className="bg-white rounded-lg p-2 border">Không tìm thấy: <strong className="text-gray-500">{batchStatus.result.noInfo || 0}</strong></div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="bg-green-100 rounded-lg p-2 border border-green-300">🎯 Lead được gắn SĐT: <strong className="text-green-800">{batchStatus.result.leadsUpdatedPhone}</strong></div>
                <div className="bg-blue-100 rounded-lg p-2 border border-blue-300">✅ Lead có SĐT: <strong className="text-blue-800">{batchStatus.result.leadsWithPhone || 0}/{batchStatus.result.totalLeads || 0}</strong></div>
                <div className="bg-red-100 rounded-lg p-2 border border-red-300">❌ Lead còn thiếu: <strong className="text-red-800">{batchStatus.result.leadsStillMissingPhone || 0}</strong></div>
              </div>
              {batchStatus.result.leadsUpdatedList?.length > 0 && (
                <details className="text-xs">
                  <summary className="cursor-pointer text-green-700 font-medium hover:underline">📋 Danh sách {batchStatus.result.leadsUpdatedList.length} lead đã update SĐT</summary>
                  <div className="mt-2 max-h-48 overflow-y-auto border rounded-lg bg-white">
                    <table className="w-full">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="text-left px-2 py-1.5">Mã</th>
                          <th className="text-left px-2 py-1.5">Tên Lead</th>
                          <th className="text-left px-2 py-1.5">SĐT</th>
                        </tr>
                      </thead>
                      <tbody>
                        {batchStatus.result.leadsUpdatedList.map((l, idx) => (
                          <tr key={idx} className="border-t hover:bg-gray-50">
                            <td className="px-2 py-1.5 text-blue-600 font-mono">{l.code}</td>
                            <td className="px-2 py-1.5">{l.title}</td>
                            <td className="px-2 py-1.5 text-green-700 font-mono">{l.phone}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      )}
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Tìm tên, SĐT..."
            className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500" />
        </div>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
          {[['all','Tất cả'], ['unattended','⏳ Chưa chăm'], ['has_lead','Có Lead'], ['no_lead','Chưa có Lead']].map(([k,l]) => (
            <button key={k} onClick={() => setFilter(k)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition cursor-pointer ${filter === k ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>{l}</button>
          ))}
        </div>
        <select
          value={sourceFilter}
          onChange={(e) => setSourceFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border rounded-lg bg-white text-gray-700 focus:ring-2 focus:ring-blue-500 cursor-pointer"
          title="Lọc theo nguồn đã cấu hình ở Page setup"
          disabled={!pageSources.length}
        >
          <option value="">
            {pageSources.length
              ? '— Nguồn (tất cả Page) —'
              : '— Chưa có Page nào set nguồn —'}
          </option>
          {pageSources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.category?.icon ? `${s.category.icon} ` : ''}{s.name}
              {s.category?.name ? ` · ${s.category.name}` : ''}
            </option>
          ))}
        </select>
        {sourceFilter && (
          <button
            onClick={() => setSourceFilter('')}
            className="px-2 py-1.5 text-xs text-gray-500 hover:text-red-600 cursor-pointer"
            title="Xóa lọc nguồn"
          >
            ✕ Xóa lọc
          </button>
        )}
      </div>
      <div className="bg-white border rounded-xl overflow-hidden shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Tên</th>
              <th className="text-center px-3 py-3 font-semibold text-gray-600">💬</th>
              <th className="text-left px-3 py-3 font-semibold text-gray-600">Hoạt động</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">SĐT</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Lead</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Phân loại nguồn</th>
              <th className="text-left px-4 py-3 font-semibold text-gray-600">Ghi chú</th>
              <th className="text-right px-4 py-3 font-semibold text-gray-600">Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {contacts.map(c => (
              <tr key={c.id} className="border-b last:border-0 hover:bg-gray-50">
                {editing === c.id ? (
                  <>
                    <td className="px-4 py-2"><input value={form.fb_name} onChange={e => setForm({...form, fb_name: e.target.value})} className="w-full px-2 py-1 border rounded text-sm" /></td>
                    <td className="px-3 py-2 text-center text-xs text-gray-400">{c.message_count || 0}</td>
                    <td className="px-3 py-2 text-xs text-gray-400">—</td>
                    <td className="px-4 py-2"><input value={form.phone} onChange={e => setForm({...form, phone: e.target.value})} className="w-full px-2 py-1 border rounded text-sm" placeholder="SĐT" /></td>
                    <td className="px-4 py-2">—</td>
                    <td className="px-4 py-2 text-gray-300 text-xs">—</td>
                    <td className="px-4 py-2"><input value={form.notes} onChange={e => setForm({...form, notes: e.target.value})} className="w-full px-2 py-1 border rounded text-sm" placeholder="Ghi chú" /></td>
                    <td className="px-4 py-2 text-right">
                      <button onClick={() => saveEdit(c.id)} className="text-green-600 hover:text-green-800 p-1 cursor-pointer"><Check size={16} /></button>
                      <button onClick={() => setEditing(null)} className="text-gray-400 hover:text-gray-600 p-1 cursor-pointer"><X size={16} /></button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => navigate(`/facebook?tab=inbox&contact=${c.id}`)}
                        className="flex items-center gap-2 text-left cursor-pointer hover:opacity-80"
                      >
                        <FBAvatar name={c.fb_name} pic={c.fb_profile_pic} size={8} />
                        <div>
                          <span className="font-medium text-gray-800">{c.fb_name}</span>
                          {c.unread_count > 0 && <span className="ml-1.5 bg-red-500 text-white text-[9px] px-1.5 py-0.5 rounded-full font-bold">{c.unread_count} mới</span>}
                          {c.attended_status === 'unattended' && <span className="ml-1.5 bg-amber-100 text-amber-700 text-[9px] px-1.5 py-0.5 rounded-full font-bold" title="Khách nhắn tin cuối, chưa có nhân viên trả lời">⏳ Chưa chăm</span>}
                        </div>
                      </button>
                    </td>
                    <td className="px-3 py-3 text-center">
                      {c.message_count > 0 ? (
                        <span className="text-xs font-semibold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">{c.message_count}</span>
                      ) : <span className="text-gray-300 text-xs">0</span>}
                    </td>
                    <td className="px-3 py-3 text-xs text-gray-500">
                      <div className="flex flex-col gap-0.5">
                        {c.fb_is_recent_activity && (
                          <span className="text-[10px] font-semibold text-emerald-600 w-fit">Mới (48h)</span>
                        )}
                        <span>{formatFbActivityTime(c) || <span className="text-gray-300">—</span>}</span>
                        <span className="text-[10px] text-gray-400">{fbActivitySourceLabel(c)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{c.display_phone || c.phone || c.customer?.phone || <span className="text-gray-300">—</span>}</td>
                    <td className="px-4 py-3">
                      {c.lead ? (
                        <a href={`/crm/leads/${c.lead.id}`} className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded hover:bg-blue-100">{c.lead.code}</a>
                      ) : (
                        <CreateLeadButton contactId={c.id} onCreated={() => load()} />
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const cat = c.lead?.source?.category;
                        const src = c.lead?.source;
                        if (!cat && !src) return <span className="text-gray-300 text-xs">—</span>;
                        return (
                          <div className="flex flex-col gap-0.5">
                            {cat && (
                              <span
                                className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full w-fit"
                                style={{
                                  backgroundColor: cat.color ? `${cat.color}1A` : '#f3f4f6',
                                  color: cat.color || '#374151',
                                }}
                                title={cat.name}
                              >
                                {cat.icon && <span>{cat.icon}</span>}
                                <span>{cat.name}</span>
                              </span>
                            )}
                            {src?.name && (
                              <span className="text-[10px] text-gray-500 truncate max-w-[140px]" title={src.name}>{src.name}</span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs max-w-[150px] truncate">{c.notes || ''}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => navigate(`/facebook?tab=inbox&contact=${c.id}`)} className="text-gray-400 hover:text-teal-600 p-1 cursor-pointer" title="Mở chat"><MessageCircle size={14} /></button>
                      <button onClick={() => startEdit(c)} className="text-gray-400 hover:text-blue-600 p-1 cursor-pointer" title="Sửa"><Edit3 size={14} /></button>
                      <button onClick={() => deleteContact(c.id, c.fb_name)} className="text-gray-400 hover:text-red-600 p-1 cursor-pointer" title="Xóa"><Trash2 size={14} /></button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {!contacts.length && <p className="text-center text-gray-400 py-8 text-sm">Chưa có liên hệ nào</p>}
        {meta.total > 400 && (
          <div className="p-4 border-t bg-gray-50 text-xs text-gray-500">
            Đang hiển thị 400 contact mới nhất.
          </div>
        )}
      </div>

      {rescanOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !rescanStatus?.loading && setRescanOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b flex items-center justify-between sticky top-0 bg-white">
              <div>
                <h3 className="text-lg font-bold text-rose-700">🔁 Quét lại SĐT từ tin nhắn user</h3>
                <p className="text-xs text-gray-500 mt-0.5">Chỉ quét tin user FB (inbound) · không quét tin mình gửi · không quét link</p>
              </div>
              <button onClick={() => !rescanStatus?.loading && setRescanOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Số lượng cần quét (1 — 1000)</label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={rescanForm.limit}
                  onChange={(e) => setRescanForm((f) => ({ ...f, limit: Math.min(1000, Math.max(1, parseInt(e.target.value, 10) || 1)) }))}
                  disabled={rescanStatus?.loading}
                  className="w-32 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-rose-300 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Phạm vi quét</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { v: 'all', l: 'Tất cả', d: 'Quét cả user đã có lẫn chưa có SĐT' },
                    { v: 'without_phone', l: 'Chỉ chưa có SĐT', d: 'Tìm SĐT cho contact trống' },
                    { v: 'with_phone', l: 'Chỉ đã có SĐT', d: 'Tìm SĐT mới (xác minh/cập nhật)' },
                  ].map(opt => (
                    <button
                      key={opt.v}
                      type="button"
                      disabled={rescanStatus?.loading}
                      onClick={() => setRescanForm((f) => ({ ...f, mode: opt.v }))}
                      className={`p-2 text-left rounded-lg border text-xs ${rescanForm.mode === opt.v ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                    >
                      <div className="font-semibold">{opt.l}</div>
                      <div className="text-[10px] text-gray-500 mt-0.5">{opt.d}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1.5">Sắp xếp</label>
                <div className="flex gap-2">
                  {[
                    { v: 'newest_first', l: 'Hoạt động mới nhất trước' },
                    { v: 'oldest_first', l: 'Hoạt động cũ nhất trước' },
                  ].map(opt => (
                    <button
                      key={opt.v}
                      type="button"
                      disabled={rescanStatus?.loading}
                      onClick={() => setRescanForm((f) => ({ ...f, sort: opt.v }))}
                      className={`px-3 py-1.5 rounded-lg border text-xs ${rescanForm.sort === opt.v ? 'border-rose-500 bg-rose-50 text-rose-700' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                    >
                      {opt.l}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-gray-500 mt-1.5 leading-snug">
                  «Mới nhất» = <strong>hoạt động gần nhất</strong> giữa tin nhắn cuối và lúc tạo hồ sơ (khớp danh bạ). Server lấy tối đa 40× số lượng rồi sắp lại đúng thứ tự trước khi quét
                  (hoặc tối đa 50k contact khi có lọc theo ngày lead).
                </p>
              </div>

              <div className="border border-slate-200 rounded-lg p-3 bg-slate-50/80 space-y-2">
                <div className="text-xs font-semibold text-slate-800">Lọc theo ngày tạo lead CRM (tùy chọn)</div>
                <p className="text-[10px] text-slate-600 leading-snug">
                  Chỉ lấy contact gắn <strong>lead dạng lead</strong> có <code className="text-[10px] bg-white px-1 rounded">created_at</code> trong khoảng (UTC). Điền một hoặc cả hai ô; để trống = không lọc theo ngày.
                </p>
                <div className="flex flex-wrap items-end gap-3">
                  <label className="flex flex-col gap-0.5 text-[11px]">
                    <span className="text-slate-600">Từ ngày</span>
                    <input
                      type="date"
                      value={rescanForm.lead_date_from}
                      onChange={(e) => setRescanForm((f) => ({ ...f, lead_date_from: e.target.value }))}
                      disabled={rescanStatus?.loading}
                      className="px-2 py-1.5 border border-slate-200 rounded-md text-sm bg-white"
                    />
                  </label>
                  <label className="flex flex-col gap-0.5 text-[11px]">
                    <span className="text-slate-600">Đến ngày</span>
                    <input
                      type="date"
                      value={rescanForm.lead_date_to}
                      onChange={(e) => setRescanForm((f) => ({ ...f, lead_date_to: e.target.value }))}
                      disabled={rescanStatus?.loading}
                      className="px-2 py-1.5 border border-slate-200 rounded-md text-sm bg-white"
                    />
                  </label>
                </div>
                <label className="flex items-start gap-2 cursor-pointer text-[11px] text-slate-800">
                  <input
                    type="checkbox"
                    className="mt-0.5 rounded border-slate-300"
                    checked={!!rescanForm.include_contacts_without_lead_in_range}
                    onChange={(e) => setRescanForm((f) => ({ ...f, include_contacts_without_lead_in_range: e.target.checked }))}
                    disabled={rescanStatus?.loading}
                  />
                  <span>
                    Gồm contact <strong>chưa có lead</strong> nhưng <code className="text-[10px]">created_at</code> contact nằm trong cùng khoảng ngày (khi đã chọn từ/đến).
                  </span>
                </label>
              </div>

              <details className="text-[11px] border border-dashed border-rose-200 rounded-lg p-2 bg-rose-50/30">
                <summary className="cursor-pointer font-medium text-rose-900">Ví dụ gọi API (Copy / Postman / curl)</summary>
                <pre className="mt-2 p-2 bg-white rounded text-[10px] overflow-x-auto text-slate-800 border border-rose-100">
{`POST /api/facebook/rescan-phones
Content-Type: application/json

{
  "limit": 80,
  "mode": "without_phone",
  "sort": "newest_first",
  "overwrite": true,
  "sync_customer": true,
  "lead_date_from": "2026-04-01",
  "lead_date_to": "2026-04-28",
  "include_contacts_without_lead_in_range": false,
  "delete_lead_when_no_phone": true,
  "delete_orphan_customer_no_phone": true
}`}
                </pre>
              </details>

              <div className="flex flex-col gap-2 bg-gray-50 rounded-lg p-3">
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={rescanForm.overwrite}
                    onChange={(e) => setRescanForm((f) => ({ ...f, overwrite: e.target.checked }))}
                    disabled={rescanStatus?.loading}
                    className="rounded text-rose-600 focus:ring-rose-300"
                  />
                  <span><strong>Ghi đè SĐT cũ</strong> nếu phát hiện SĐT mới khác trong tin nhắn</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="checkbox"
                    checked={rescanForm.sync_customer}
                    onChange={(e) => setRescanForm((f) => ({ ...f, sync_customer: e.target.checked }))}
                    disabled={rescanStatus?.loading}
                    className="rounded text-rose-600 focus:ring-rose-300"
                  />
                  <span>Đồng bộ SĐT mới sang <strong>customer.phone</strong> (nếu contact đã có khách hàng liên kết)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm border-t border-rose-100/80 pt-2 mt-1">
                  <input
                    type="checkbox"
                    checked={!!rescanForm.delete_lead_when_no_phone}
                    onChange={(e) => setRescanForm((f) => ({ ...f, delete_lead_when_no_phone: e.target.checked }))}
                    disabled={rescanStatus?.loading}
                    className="rounded text-rose-600 focus:ring-rose-300"
                  />
                  <span>
                    <strong className="text-rose-800">Xóa lead</strong> nếu quét inbound <strong>không trích được SĐT</strong> (kể cả contact vẫn đang có SĐT cũ trên hồ sơ) — chỉ lead dạng thường, không dự án/đơn/báo giá, không gắn thêm contact FB khác.
                  </span>
                </label>
                <label className={`flex items-center gap-2 cursor-pointer text-sm border-t border-rose-100/80 pt-2 mt-1 ${!rescanForm.delete_lead_when_no_phone ? 'opacity-45' : ''}`}>
                  <input
                    type="checkbox"
                    checked={!!rescanForm.delete_orphan_customer_no_phone}
                    onChange={(e) => setRescanForm((f) => ({ ...f, delete_orphan_customer_no_phone: e.target.checked }))}
                    disabled={rescanStatus?.loading || !rescanForm.delete_lead_when_no_phone}
                    className="rounded text-rose-600 focus:ring-rose-300"
                  />
                  <span>
                    <strong className="text-rose-800">Xóa khách hàng (KH)</strong> sau khi đã xóa lead: chỉ KH <strong>không có SĐT</strong>, không còn lead/dự án/đơn/báo giá, và <strong>chỉ một</strong> contact Facebook trỏ tới KH đó.
                  </span>
                </label>
              </div>

              {rescanProgress && rescanStatus?.loading && (
                <div className="text-xs text-gray-600 space-y-1">
                  <div>Đang quét: <span className="font-medium">{rescanProgress.name || '...'}</span> ({rescanProgress.current || 0}/{rescanProgress.total || 0})</div>
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div className="h-full bg-rose-500 rounded-full transition-all" style={{ width: `${rescanProgress.total ? Math.round(((rescanProgress.current || 0) / rescanProgress.total) * 100) : 0}%` }} />
                  </div>
                </div>
              )}

              {rescanStatus?.error && (
                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">❌ {rescanStatus.error}</div>
              )}

              {rescanStatus?.result && !rescanStatus.error && (
                <div className="space-y-2">
                  {(rescanStatus.result.sort_note || typeof rescanStatus.result.pool_fetched === 'number') && (
                    <div className="text-[11px] text-gray-600 bg-slate-50 border border-slate-100 rounded-lg px-2 py-1.5 space-y-1">
                      {rescanStatus.result.sort_note && <span>{rescanStatus.result.sort_note}</span>}
                      {typeof rescanStatus.result.pool_fetched === 'number' && rescanStatus.result.pool_fetched > (rescanStatus.result.limit || 0) && (
                        <span className="block mt-0.5 text-slate-500">
                          Đã xét {rescanStatus.result.pool_fetched} contact trong pool tải về → quét đúng {rescanStatus.result.limit || rescanStatus.result.scanned} theo thứ tự trên.
                        </span>
                      )}
                      {rescanStatus.result.date_filter_active && (
                        <span className="block text-slate-700">
                          Sau lọc ngày lead: <strong>{rescanStatus.result.pool_after_lead_date_filter ?? '—'}</strong> contact trong khoảng
                          {typeof rescanStatus.result.skipped_by_lead_date === 'number' && (
                            <> · Loại (ngoài khoảng / không phải lead): <strong>{rescanStatus.result.skipped_by_lead_date}</strong></>
                          )}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-2 text-xs">
                    <div className="bg-gray-50 rounded p-2"><div className="text-gray-500">Đã quét</div><div className="font-bold text-base">{rescanStatus.result.scanned}</div></div>
                    <div className="bg-green-50 rounded p-2"><div className="text-green-700">Set SĐT mới</div><div className="font-bold text-base text-green-700">{rescanStatus.result.updated_set || 0}</div></div>
                    <div className="bg-amber-50 rounded p-2"><div className="text-amber-700">Ghi đè</div><div className="font-bold text-base text-amber-700">{rescanStatus.result.updated_replaced || 0}</div></div>
                    <div className="bg-gray-100 rounded p-2"><div className="text-gray-600">Không tìm SĐT</div><div className="font-bold text-base">{rescanStatus.result.no_phone_found || 0}</div></div>
                    {(rescanStatus.result.leads_deleted ?? 0) > 0 && (
                      <div className="bg-red-50 rounded p-2"><div className="text-red-700">Đã xóa lead</div><div className="font-bold text-base text-red-800">{rescanStatus.result.leads_deleted}</div></div>
                    )}
                    {(rescanStatus.result.leads_delete_blocked ?? 0) > 0 && (
                      <div className="bg-orange-50 rounded p-2"><div className="text-orange-800">Lead giữ lại</div><div className="font-bold text-base text-orange-900">{rescanStatus.result.leads_delete_blocked}</div><div className="text-[9px] text-orange-700 mt-0.5">Không đủ điều kiện xóa</div></div>
                    )}
                    {(rescanStatus.result.customers_deleted ?? 0) > 0 && (
                      <div className="bg-purple-50 rounded p-2"><div className="text-purple-800">Đã xóa KH</div><div className="font-bold text-base text-purple-900">{rescanStatus.result.customers_deleted}</div></div>
                    )}
                    {(rescanStatus.result.customers_delete_blocked ?? 0) > 0 && (
                      <div className="bg-amber-50 rounded p-2"><div className="text-amber-900">KH giữ lại</div><div className="font-bold text-base text-amber-950">{rescanStatus.result.customers_delete_blocked}</div><div className="text-[9px] text-amber-800 mt-0.5">Có SĐT / nhiều contact / còn dữ liệu</div></div>
                    )}
                  </div>
                  {Array.isArray(rescanStatus.result.results) && rescanStatus.result.results.length > 0 && (
                    <div className="border rounded-lg overflow-hidden max-h-72 overflow-y-auto">
                      <table className="w-full text-[11px]">
                        <thead className="bg-gray-100 sticky top-0">
                          <tr><th className="text-left p-1.5">User FB</th><th className="text-left p-1.5">SĐT cũ</th><th className="text-left p-1.5">SĐT mới</th><th className="text-left p-1.5">Tin quét</th><th className="text-left p-1.5">Action</th></tr>
                        </thead>
                        <tbody>
                          {rescanStatus.result.results.map((r, i) => (
                            <tr key={i} className="border-t hover:bg-gray-50">
                              <td className="p-1.5 truncate max-w-[160px]" title={r.fb_name}>{r.fb_name || '—'}</td>
                              <td className="p-1.5 font-mono text-gray-500">{r.old_phone || '—'}</td>
                              <td className="p-1.5 font-mono text-rose-700">{r.new_phone || '—'}</td>
                              <td className="p-1.5 text-gray-500">{r.messages_scanned ?? 0}</td>
                              <td className="p-1.5">
                                <span className={
                                  r.action === 'set_new' ? 'text-green-700' :
                                  r.action === 'replaced' ? 'text-amber-700' :
                                  r.action === 'unchanged_same' ? 'text-gray-500' :
                                  r.action === 'kept_existing' ? 'text-blue-700' :
                                  r.action === 'lead_deleted' ? 'text-red-700' :
                                  r.action === 'error' ? 'text-red-700' :
                                  'text-gray-400'
                                }>
                                  {r.action === 'set_new' ? '✅ Set SĐT mới' :
                                   r.action === 'replaced' ? '🔁 Ghi đè' :
                                   r.action === 'unchanged_same' ? '⏸ Trùng SĐT cũ' :
                                   r.action === 'kept_existing' ? '⏭ Giữ SĐT cũ' :
                                   r.action === 'lead_deleted' ? `🗑 Đã xóa lead${r.deleted_lead_id ? ` (${String(r.deleted_lead_id).slice(0, 8)}…)` : ''}${r.customer_deleted ? ' + xóa KH' : r.customer_delete_blocked ? ` · KH giữ (${r.customer_delete_blocked})` : ''}` :
                                   r.action === 'error' ? `❌ ${r.error || ''}` :
                                   r.lead_delete_blocked ? `— Không SĐT · lead giữ (${r.lead_delete_blocked})` :
                                   '— Không tìm SĐT'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="p-4 border-t bg-gray-50 flex items-center justify-end gap-2 sticky bottom-0">
              <button
                onClick={() => !rescanStatus?.loading && setRescanOpen(false)}
                disabled={rescanStatus?.loading}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50"
              >
                Đóng
              </button>
              <button
                onClick={runRescanPhones}
                disabled={rescanStatus?.loading}
                className="px-4 py-2 text-sm font-semibold bg-rose-600 text-white rounded-lg hover:bg-rose-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                {rescanStatus?.loading ? <><span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" /> Đang quét…</> : '🔁 Bắt đầu quét'}
              </button>
            </div>
          </div>
        </div>
      )}

      {leadScanOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => !leadScanStatus?.loading && setLeadScanOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5 border-b flex items-center justify-between sticky top-0 bg-white">
              <div>
                <h3 className="text-lg font-bold text-amber-900">📅 Quét lead theo ngày</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Lọc theo <strong>ngày tạo lead CRM</strong> (UTC). Chưa có SĐT → bổ sung từ tin user; có SĐT mới → cập nhật contact + lead; có SĐT nhưng quét không ra → xóa lead (nếu được) và xóa user khỏi danh bạ.
                </p>
              </div>
              <button type="button" onClick={() => !leadScanStatus?.loading && setLeadScanOpen(false)} className="text-gray-400 hover:text-gray-700 text-xl leading-none">×</button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex flex-wrap items-end gap-3">
                <label className="flex flex-col gap-0.5 text-[11px]">
                  <span className="text-gray-600 font-medium">Từ ngày</span>
                  <input
                    type="date"
                    value={leadScanForm.lead_date_from}
                    onChange={(e) => setLeadScanForm((f) => ({ ...f, lead_date_from: e.target.value }))}
                    disabled={leadScanStatus?.loading}
                    className="px-2 py-1.5 border border-amber-200 rounded-md text-sm bg-white"
                  />
                </label>
                <label className="flex flex-col gap-0.5 text-[11px]">
                  <span className="text-gray-600 font-medium">Đến ngày</span>
                  <input
                    type="date"
                    value={leadScanForm.lead_date_to}
                    onChange={(e) => setLeadScanForm((f) => ({ ...f, lead_date_to: e.target.value }))}
                    disabled={leadScanStatus?.loading}
                    className="px-2 py-1.5 border border-amber-200 rounded-md text-sm bg-white"
                  />
                </label>
                <label className="flex flex-col gap-0.5 text-[11px]">
                  <span className="text-gray-600 font-medium">Tối đa contact</span>
                  <input
                    type="number"
                    min={1}
                    max={2000}
                    value={leadScanForm.limit}
                    onChange={(e) => setLeadScanForm((f) => ({ ...f, limit: Math.min(2000, Math.max(1, parseInt(e.target.value, 10) || 300)) }))}
                    disabled={leadScanStatus?.loading}
                    className="w-20 px-2 py-1.5 border border-amber-200 rounded-md text-sm"
                  />
                </label>
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={leadScanForm.sync_graph_first}
                  onChange={(e) => setLeadScanForm((f) => ({ ...f, sync_graph_first: e.target.checked }))}
                  disabled={leadScanStatus?.loading}
                  className="rounded text-amber-600"
                />
                <span>Đồng bộ tin từ Facebook trước khi quét (khuyến nghị; tắt = chỉ đọc tin đã lưu DB)</span>
              </label>
              {leadScanForm.sync_graph_first && (
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <span className="text-xs w-28">Trang Graph / contact</span>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={leadScanForm.graph_pages}
                    onChange={(e) => setLeadScanForm((f) => ({ ...f, graph_pages: Math.min(30, Math.max(1, parseInt(e.target.value, 10) || 10)) }))}
                    disabled={leadScanStatus?.loading}
                    className="w-16 px-2 py-1 border rounded text-sm"
                  />
                </label>
              )}
              <label className="flex items-center gap-2 cursor-pointer text-sm">
                <input
                  type="checkbox"
                  checked={leadScanForm.sync_customer}
                  onChange={(e) => setLeadScanForm((f) => ({ ...f, sync_customer: e.target.checked }))}
                  disabled={leadScanStatus?.loading}
                  className="rounded text-amber-600"
                />
                <span>Đồng bộ SĐT sang <strong>customer.phone</strong></span>
              </label>
              <label className="flex items-start gap-2 cursor-pointer text-[13px] text-gray-800">
                <input
                  type="checkbox"
                  className="mt-0.5 rounded border-amber-300"
                  checked={leadScanForm.include_contacts_without_lead_in_range}
                  onChange={(e) => setLeadScanForm((f) => ({ ...f, include_contacts_without_lead_in_range: e.target.checked }))}
                  disabled={leadScanStatus?.loading}
                />
                <span>Gồm contact <strong>chưa có lead</strong> nhưng ngày tạo contact nằm trong khoảng (giống «Quét lại SĐT»)</span>
              </label>

              {leadScanProgress && leadScanStatus?.loading && (
                <div className="text-xs text-gray-600 space-y-1">
                  <div>
                    Đang xử lý: <span className="font-medium">{leadScanProgress.name || '…'}</span> ({leadScanProgress.current || 0}/{leadScanProgress.total || 0})
                  </div>
                  <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="h-full bg-amber-500 rounded-full transition-all"
                      style={{ width: `${leadScanProgress.total ? Math.round(((leadScanProgress.current || 0) / leadScanProgress.total) * 100) : 0}%` }}
                    />
                  </div>
                </div>
              )}

              {leadScanStatus?.error && (
                <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">❌ {leadScanStatus.error}</div>
              )}

              {leadScanStatus?.result && !leadScanStatus.error && (
                <div className="space-y-2 text-xs">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    <div className="bg-gray-50 rounded p-2"><div className="text-gray-500">Đã quét</div><div className="font-bold">{leadScanStatus.result.scanned}</div></div>
                    <div className="bg-green-50 rounded p-2"><div className="text-green-700">Set SĐT mới</div><div className="font-bold text-green-800">{leadScanStatus.result.updated_set ?? 0}</div></div>
                    <div className="bg-amber-50 rounded p-2"><div className="text-amber-800">Đổi SĐT</div><div className="font-bold text-amber-900">{leadScanStatus.result.updated_replaced ?? 0}</div></div>
                    <div className="bg-gray-100 rounded p-2"><div className="text-gray-600">Giữ nguyên (trùng)</div><div className="font-bold">{leadScanStatus.result.unchanged_same ?? 0}</div></div>
                    <div className="bg-slate-50 rounded p-2"><div className="text-slate-600">Vẫn không có SĐT</div><div className="font-bold">{leadScanStatus.result.still_no_phone ?? 0}</div></div>
                    <div className="bg-red-50 rounded p-2"><div className="text-red-700">Đã xóa user FB</div><div className="font-bold text-red-800">{leadScanStatus.result.deleted_contacts ?? 0}</div></div>
                    <div className="bg-rose-50 rounded p-2"><div className="text-rose-800">Đã xóa lead</div><div className="font-bold">{leadScanStatus.result.leads_deleted ?? 0}</div></div>
                    <div className="bg-orange-50 rounded p-2"><div className="text-orange-800">Lead không xóa được</div><div className="font-bold">{leadScanStatus.result.lead_delete_blocked ?? 0}</div></div>
                    <div className="bg-purple-50 rounded p-2"><div className="text-purple-800">Đã xóa KH mồ côi</div><div className="font-bold">{leadScanStatus.result.customers_deleted ?? 0}</div></div>
                  </div>
                  {typeof leadScanStatus.result.graph_messages_synced === 'number' && leadScanStatus.result.graph_messages_synced > 0 && (
                    <p className="text-[11px] text-gray-500">Tin mới từ Graph (ước lượng): +{leadScanStatus.result.graph_messages_synced}</p>
                  )}
                  {leadScanStatus.result.skipped_by_lead_date > 0 && (
                    <p className="text-[11px] text-gray-500">Loại khỏi khoảng ngày: {leadScanStatus.result.skipped_by_lead_date}</p>
                  )}
                </div>
              )}
            </div>
            <div className="p-4 border-t bg-amber-50/50 flex items-center justify-end gap-2 sticky bottom-0">
              <button
                type="button"
                onClick={() => !leadScanStatus?.loading && setLeadScanOpen(false)}
                disabled={leadScanStatus?.loading}
                className="px-4 py-2 text-sm border border-gray-200 rounded-lg hover:bg-gray-100 disabled:opacity-50"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={() => void runLeadScanByDate()}
                disabled={leadScanStatus?.loading}
                className="px-4 py-2 text-sm font-semibold bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 flex items-center gap-1.5"
              >
                {leadScanStatus?.loading ? <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" /> : '📅'}
                Chạy quét
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// LEAD ADS TAB
// ═══════════════════════════════════════════════════════════════

function LeadAdsTab() {
  const [ads, setAds] = useState([]);
  useEffect(() => {
    fetch(`${API}/api/facebook/lead-ads`, { headers: hdr() }).then(r => r.ok ? r.json() : []).then(setAds).catch(() => {});
  }, []);
  return (
    <div className="p-6 overflow-y-auto h-full">
      <h2 className="text-lg font-bold mb-4">📋 Facebook Lead Ads</h2>
      {!ads.length ? (
        <div className="text-center text-gray-400 py-12"><FileText size={48} className="mx-auto mb-3 opacity-30" /><p>Chưa có lead ads.</p></div>
      ) : (
        <div className="space-y-3">
          {ads.map(ad => (
            <div key={ad.id} className="bg-white border rounded-lg p-4 hover:shadow-md transition">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📋</span>
                  <span className="font-medium">{ad.full_name || 'N/A'}</span>
                  {ad.phone && <span className="text-sm text-gray-500">📞 {ad.phone}</span>}
                </div>
                {ad.lead && <a href={`/crm/leads/${ad.lead.id}`} className="text-xs bg-green-50 text-green-600 px-2 py-1 rounded hover:bg-green-100">✅ {ad.lead.code}</a>}
              </div>
              <p className="text-[10px] text-gray-400 mt-2">{new Date(ad.created_at).toLocaleString('vi-VN')}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// COMMENTS TAB
// ═══════════════════════════════════════════════════════════════

function CommentsTab() {
  const [comments, setComments] = useState([]);
  const [replyingTo, setReplyingTo] = useState(null);
  const [replyText, setReplyText] = useState('');
  useEffect(() => {
    fetch(`${API}/api/facebook/comments`, { headers: hdr() }).then(r => r.ok ? r.json() : []).then(setComments).catch(() => {});
  }, []);
  const sendReply = async (commentId) => {
    if (!replyText.trim()) return;
    try {
      await fetch(`${API}/api/facebook/comments/${commentId}/reply`, { method: 'POST', headers: hdr(), body: JSON.stringify({ message: replyText }) });
      setComments(prev => prev.map(c => c.id === commentId ? { ...c, replied: true, reply_text: replyText } : c));
      setReplyingTo(null); setReplyText('');
    } catch (e) { console.error(e); }
  };
  return (
    <div className="p-6 overflow-y-auto h-full">
      <h2 className="text-lg font-bold mb-4">💬 Bình luận Facebook</h2>
      {!comments.length ? (
        <div className="text-center text-gray-400 py-12"><MessageSquare size={48} className="mx-auto mb-3 opacity-30" /><p>Chưa có bình luận.</p></div>
      ) : (
        <div className="space-y-3">
          {comments.map(c => (
            <div key={c.id} className="bg-white border rounded-lg p-4">
              <div className="flex items-start justify-between">
                <div><p className="font-medium text-sm">{c.from_name || 'Ẩn danh'}</p><p className="text-sm text-gray-700 mt-1">{c.message}</p></div>
                {c.replied ? <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded shrink-0">✅ Đã trả lời</span> :
                  <button onClick={() => { setReplyingTo(c.id); setReplyText(''); }} className="text-xs text-blue-600 hover:underline cursor-pointer shrink-0">Trả lời</button>}
              </div>
              {c.replied && c.reply_text && <div className="mt-2 ml-4 border-l-2 border-blue-200 pl-3"><p className="text-xs text-blue-600">↩ {c.reply_text}</p></div>}
              {replyingTo === c.id && (
                <div className="mt-3 flex gap-2">
                  <input value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Nhập phản hồi..." className="flex-1 px-3 py-1.5 text-sm border rounded" />
                  <button onClick={() => sendReply(c.id)} className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm hover:bg-blue-700 cursor-pointer">Gửi</button>
                  <button onClick={() => setReplyingTo(null)} className="text-gray-500 text-sm cursor-pointer">Hủy</button>
                </div>
              )}
              <p className="text-[10px] text-gray-400 mt-2">{new Date(c.created_at).toLocaleString('vi-VN')}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS TAB — CRUD Facebook Pages
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// ANALYTICS TAB — Phân tích hành vi khách hàng
// ═══════════════════════════════════════════════════════════════

function lastNDaysYmd(n) {
  const toD = new Date();
  const fromD = new Date();
  fromD.setDate(fromD.getDate() - (Math.max(1, n) - 1));
  return { from: vnYmd(fromD), to: vnYmd(toD) };
}

function formatYmdVi(s) {
  const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s || '';
}

function AnalyticsTab({ fbCompanyQs = '' }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [pageFilter, setPageFilter] = useState('');
  const [daysPreset, setDaysPreset] = useState('30');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [rangePickerOpen, setRangePickerOpen] = useState(false);
  const [pages, setPages] = useState([]);

  useEffect(() => {
    const q = fbCompanyQs ? `?${fbCompanyQs}` : '';
    fetch(`${API}/api/facebook/pages${q}`, { headers: hdr() })
      .then(r => r.ok ? r.json() : []).then(setPages).catch(() => {});
  }, [fbCompanyQs]);

  useEffect(() => {
    setPageFilter('');
  }, [fbCompanyQs]);

  useEffect(() => {
    if (daysPreset === 'custom' && (!customFrom || !customTo)) return undefined;
    const ac = new AbortController();
    setLoading(true);
    setLoadError('');
    const params = new URLSearchParams();
    if (daysPreset === 'custom') {
      params.set('from', customFrom);
      params.set('to', customTo);
    } else {
      params.set('days', daysPreset);
    }
    if (pageFilter) params.set('page_id', pageFilter);
    if (fbCompanyQs) {
      new URLSearchParams(fbCompanyQs).forEach((v, k) => params.set(k, v));
    }
    fetch(`${API}/api/facebook/analytics?${params}`, { headers: hdr(), signal: ac.signal })
      .then(async (r) => {
        const j = await r.json().catch(() => null);
        if (!r.ok) {
          setLoadError(j?.error || 'Không tải được thống kê');
          return null;
        }
        return j;
      })
      .then((d) => { if (d) setData(d); setLoading(false); })
      .catch((e) => {
        if (e?.name === 'AbortError') return;
        setLoadError('Không tải được thống kê');
        setLoading(false);
      });
    return () => ac.abort();
  }, [pageFilter, daysPreset, customFrom, customTo, fbCompanyQs]);

  if (loading && !data) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>;
  if (!data && loadError) return <p className="text-center py-8 text-red-500">{loadError}</p>;
  if (!data) return <p className="text-center py-8 text-gray-400">Không có dữ liệu</p>;

  const f = data.conversionFunnel;
  const cmp = data.comparison || {};
  const frt = data.firstResponseTime || {};
  const maxMsg = Math.max(...(data.messagesByHour || []).map(h => h.total), 1);
  const maxDay = Math.max(...(data.messagesByDay || []).map(d => d.total), 1);

  /** Badge nhỏ "▲12% so kỳ trước" / "▼8%" / "Mới" bên dưới mỗi thẻ KPI. */
  function DeltaBadge({ cmpKey }) {
    const c = cmp[cmpKey];
    if (!c) return null;
    if (c.pct === null) {
      if (!c.current) return null;
      return <span className="text-[10px] text-blue-500 font-medium">✨ Mới so kỳ trước</span>;
    }
    if (c.pct === 0) return <span className="text-[10px] text-gray-400">— so kỳ trước</span>;
    const up = c.pct > 0;
    return (
      <span className={`text-[10px] font-medium ${up ? 'text-green-600' : 'text-red-500'}`}>
        {up ? '▲' : '▼'} {Math.abs(c.pct)}% so kỳ trước
      </span>
    );
  }

  return (
    <div className="p-6 overflow-y-auto h-full space-y-6">
      {/* Header + Filters */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-gray-800">📊 Phân tích hành vi khách hàng</h2>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {pages.length > 1 && (
            <select value={pageFilter} onChange={e => setPageFilter(e.target.value)}
              className="text-sm border rounded-lg px-3 py-1.5 bg-white">
              <option value="">Tất cả Page</option>
              {pages.map(p => <option key={p.id} value={p.page_id}>{p.page_name}</option>)}
            </select>
          )}
          <select
            value={daysPreset}
            onChange={(e) => {
              const v = e.target.value;
              setDaysPreset(v);
              if (v === 'custom') {
                if (!customFrom || !customTo) {
                  const r = lastNDaysYmd(30);
                  setCustomFrom(r.from);
                  setCustomTo(r.to);
                }
                setRangePickerOpen(true);
              }
            }}
            className="text-sm border rounded-lg px-3 py-1.5 bg-white"
            aria-label="Khoảng thời gian"
          >
            <option value="7">7 ngày</option>
            <option value="14">14 ngày</option>
            <option value="30">30 ngày</option>
            <option value="90">90 ngày</option>
            <option value="custom">Tùy chọn ngày</option>
          </select>
          {daysPreset === 'custom' && (
            <button
              type="button"
              onClick={() => setRangePickerOpen(true)}
              className="inline-flex items-center gap-1.5 text-sm border rounded-lg px-3 py-1.5 bg-white hover:bg-gray-50"
              title="Chọn khoảng ngày"
            >
              <Calendar className="h-3.5 w-3.5 text-gray-500" />
              {customFrom && customTo ? `${formatYmdVi(customFrom)} → ${formatYmdVi(customTo)}` : 'Chọn ngày'}
            </button>
          )}
          {loading && data && <span className="text-xs text-gray-400">Đang tải…</span>}
        </div>
      </div>
      {loadError && (
        <p className="text-sm text-red-500">{loadError}</p>
      )}
      <DateRangePickerPopover
        open={rangePickerOpen}
        title="Chọn khoảng thời gian thống kê"
        from={customFrom}
        to={customTo}
        allowClear={false}
        onClose={() => setRangePickerOpen(false)}
        onChange={({ from, to }) => {
          if (!from || !to) return;
          setCustomFrom(from);
          setCustomTo(to);
          setDaysPreset('custom');
          setRangePickerOpen(false);
        }}
      />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        {[
          { label: 'Liên hệ mới trong kỳ', value: data.totalContacts, icon: '👥', color: 'blue', cmpKey: 'totalContacts' },
          { label: 'Có SĐT', value: data.hasPhone, icon: '📞', color: 'green', sub: `${f.phone_rate}%`, cmpKey: 'hasPhone' },
          { label: 'Có Lead', value: data.hasLead, icon: '🏷️', color: 'purple', sub: `${f.lead_rate}%`, cmpKey: 'hasLead' },
          { label: 'Đã chuyển Deal', value: data.dealCount, icon: '🤝', color: 'orange', sub: `${f.deal_rate}%`, cmpKey: 'dealCount' },
          { label: 'Tin nhắn', value: data.totalMessages, icon: '💬', color: 'cyan', cmpKey: 'totalMessages' },
          { label: 'TG phản hồi (mọi lượt)', value: data.avgResponseTime ? `${data.avgResponseTime} phút` : '—', icon: '⏱️', color: 'pink' },
          { label: 'Chưa chăm sóc', value: data.unattendedTotal || 0, icon: '⏳', color: 'amber' },
        ].map((kpi, i) => (
          <div key={i} className={`bg-white rounded-xl border p-4 space-y-1`}>
            <div className="flex items-center justify-between">
              <span className="text-xl">{kpi.icon}</span>
              {kpi.sub && <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-${kpi.color}-50 text-${kpi.color}-600`}>{kpi.sub}</span>}
            </div>
            <p className="text-2xl font-bold text-gray-900">{kpi.value}</p>
            <p className="text-xs text-gray-500">{kpi.label}</p>
            {kpi.cmpKey && <DeltaBadge cmpKey={kpi.cmpKey} />}
          </div>
        ))}
      </div>

      {/* Conversion Funnel */}
      <div className="bg-white rounded-xl border p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-4">🔄 Phễu chuyển đổi</h3>
        <div className="space-y-3">
          {[
            { label: 'Tổng liên hệ nhắn tin', count: f.total_contacts, pct: 100, color: 'bg-blue-500' },
            { label: 'Để lại SĐT', count: f.has_phone, pct: f.phone_rate, color: 'bg-green-500' },
            { label: 'Tạo Lead', count: f.has_lead, pct: f.lead_rate, color: 'bg-purple-500' },
            { label: 'Chuyển đổi Deal', count: f.has_deal, pct: f.overall_rate, color: 'bg-orange-500' },
          ].map((step, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className="w-32 text-xs text-gray-600 text-right shrink-0">{step.label}</div>
              <div className="flex-1 bg-gray-100 rounded-full h-7 relative overflow-hidden">
                <div className={`${step.color} h-full rounded-full transition-all duration-500`} style={{ width: `${Math.max(step.pct, 2)}%` }} />
                <span className="absolute inset-0 flex items-center justify-center text-xs font-medium">
                  {step.count} ({step.pct}%)
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* First Response Time */}
      {frt.sampleCount > 0 && (
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-4">⏱️ Thời gian phản hồi lần đầu</h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="space-y-1">
              <p className="text-2xl font-bold text-gray-900">{frt.avgMinutes ?? '—'} phút</p>
              <p className="text-xs text-gray-500">Trung bình</p>
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-bold text-gray-900">{frt.medianMinutes ?? '—'} phút</p>
              <p className="text-xs text-gray-500">Trung vị (median)</p>
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-bold text-green-600">{frt.slaUnder15m}%</p>
              <p className="text-xs text-gray-500">Trả lời &lt; 15 phút</p>
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-bold text-blue-600">{frt.slaUnder1h}%</p>
              <p className="text-xs text-gray-500">Trả lời &lt; 1 giờ</p>
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-bold text-gray-700">{frt.slaUnder4h}%</p>
              <p className="text-xs text-gray-500">Trả lời &lt; 4 giờ</p>
            </div>
          </div>
          <p className="text-[10px] text-gray-400 mt-3">Dựa trên {frt.sampleCount} lượt phản hồi đầu tiên (tin nhắn đầu tiên của khách → tin nhắn đầu tiên nhân viên trả lời)</p>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Messages by Hour */}
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-4">🕐 Khung giờ nhắn tin (UTC+7)</h3>
          <div className="flex items-end gap-1 h-40">
            {(data.messagesByHour || []).map((h, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <div className="w-full flex flex-col items-center justify-end" style={{ height: '120px' }}>
                  <div className="w-full bg-blue-400 rounded-t-sm transition-all" style={{ height: `${Math.max(h.total / maxMsg * 100, 2)}%` }}
                    title={`${h.hour}: ${h.total} tin (${h.inbound} đến)`} />
                </div>
                <span className="text-[9px] text-gray-400">{i % 3 === 0 ? h.hour.split(':')[0] : ''}</span>
              </div>
            ))}
          </div>
          <div className="mt-2 flex gap-4 text-[10px] text-gray-400">
            <span>📥 Đến: {data.inboundMessages}</span>
            <span>📤 Đi: {data.outboundMessages}</span>
          </div>
        </div>

        {/* Messages by Day */}
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-4">📅 Tin nhắn theo ngày</h3>
          <div className="flex items-end gap-0.5 h-40">
            {(daysPreset === 'custom' ? (data.messagesByDay || []) : (data.messagesByDay || []).slice(-Number(daysPreset) || 30)).map((d, i) => (
              <div key={i} className="flex-1 flex flex-col items-center justify-end" style={{ height: '120px' }}>
                <div className="w-full rounded-t-sm transition-all" style={{ height: `${Math.max(d.total / maxDay * 100, 2)}%` }}
                  title={`${d.date}: ${d.inbound} đến + ${d.outbound} đi = ${d.total}`}>
                  <div className="bg-blue-400 w-full rounded-t-sm" style={{ height: `${d.inbound / Math.max(d.total, 1) * 100}%` }} />
                  <div className="bg-green-400 w-full" style={{ height: `${d.outbound / Math.max(d.total, 1) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 flex justify-between text-[9px] text-gray-400">
            <span>{(data.messagesByDay || [])[0]?.date?.slice(5)}</span>
            <span>{(data.messagesByDay || []).slice(-1)[0]?.date?.slice(5)}</span>
          </div>
        </div>
      </div>

      {/* Employee Performance */}
      {data.employeePerformance?.length > 0 && (
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-4">👤 Hiệu suất theo nhân viên</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 font-medium">Nhân viên</th>
                  <th className="py-2 font-medium text-center">Tin đã gửi</th>
                  <th className="py-2 font-medium text-center">Khách đã chăm</th>
                  <th className="py-2 font-medium text-center">TG phản hồi TB</th>
                </tr>
              </thead>
              <tbody>
                {data.employeePerformance.map(emp => (
                  <tr key={emp.user_id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2.5 font-medium">{emp.name}</td>
                    <td className="py-2.5 text-center">{emp.messages_sent}</td>
                    <td className="py-2.5 text-center text-purple-600">{emp.contacts_handled}</td>
                    <td className="py-2.5 text-center">{emp.avg_response_minutes != null ? `${emp.avg_response_minutes} phút` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Page Breakdown */}
      {data.pageBreakdown?.length > 0 && (
        <div className="bg-white rounded-xl border p-5">
          <h3 className="text-sm font-bold text-gray-700 mb-4">📄 Theo Page</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="py-2 font-medium">Page</th>
                  <th className="py-2 font-medium text-center">Liên hệ</th>
                  <th className="py-2 font-medium text-center">Có SĐT</th>
                  <th className="py-2 font-medium text-center">Có Lead</th>
                  <th className="py-2 font-medium text-center">Tỷ lệ SĐT</th>
                  <th className="py-2 font-medium text-center">Chưa chăm</th>
                </tr>
              </thead>
              <tbody>
                {data.pageBreakdown.map(p => (
                  <tr key={p.page_id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="py-2.5 font-medium">{p.page_name}</td>
                    <td className="py-2.5 text-center">{p.contacts}</td>
                    <td className="py-2.5 text-center text-green-600">{p.has_phone}</td>
                    <td className="py-2.5 text-center text-purple-600">{p.has_lead}</td>
                    <td className="py-2.5 text-center">
                      <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-full text-xs font-medium">
                        {p.contacts ? Math.round(p.has_phone / p.contacts * 100) : 0}%
                      </span>
                    </td>
                    <td className="py-2.5 text-center">
                      {p.unattended > 0 ? (
                        <span className="bg-amber-50 text-amber-700 px-2 py-0.5 rounded-full text-xs font-medium">⏳ {p.unattended}</span>
                      ) : (
                        <span className="text-gray-300">0</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════
// SETTINGS TAB
// ═══════════════════════════════════════════════════════════════

function AutoLeadTab() {
  const { user } = useAuth();
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [companies, setCompanies] = useState([]);
  const [leadTypes, setLeadTypes] = useState([]);
  const [leadTypesLoading, setLeadTypesLoading] = useState(false);

  useEffect(() => {
    fetch(`${API}/api/facebook/auto-lead-config`, { headers: hdr() })
      .then(r => r.ok ? r.json() : null).then(setConfig).catch(() => {});
  }, []);

  // Load companies list for admin setup
  useEffect(() => {
    if (!isAdminLike(user)) return;
    fetch(`${API}/api/companies`, { headers: hdr() })
      .then(r => r.ok ? r.json() : null)
      .then((d) => {
        const list = d?.companies || d || [];
        setCompanies(Array.isArray(list) ? list : []);
      })
      .catch(() => setCompanies([]));
  }, [user?.role]);

  // Load lead types when default_company_id changes
  useEffect(() => {
    const cid = config?.default_company_id;
    if (!cid) { setLeadTypes([]); return; }
    let cancelled = false;
    setLeadTypesLoading(true);
    fetch(`${API}/api/crm/lead-types?company_id=${encodeURIComponent(cid)}&all=true`, { headers: hdr() })
      .then(r => r.ok ? r.json() : [])
      .then((d) => { if (!cancelled) setLeadTypes(Array.isArray(d) ? d : []); })
      .catch(() => { if (!cancelled) setLeadTypes([]); })
      .finally(() => { if (!cancelled) setLeadTypesLoading(false); });
    return () => { cancelled = true; };
  }, [config?.default_company_id]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/facebook/auto-lead-config`, {
        method: 'PUT', headers: hdr(), body: JSON.stringify(config),
      });
      if (res.ok) { const d = await res.json(); setConfig(d); setSaved(true); setTimeout(() => setSaved(false), 3000); }
      else { const e = await res.json(); alert(e.error || 'Lỗi'); }
    } catch (e) { alert('Lỗi: ' + e.message); }
    setSaving(false);
  };

  const reset = async () => {
    if (!confirm('Khôi phục cài đặt mặc định?')) return;
    const res = await fetch(`${API}/api/facebook/auto-lead-config/defaults`, { headers: hdr() });
    if (res.ok) { const d = await res.json(); setConfig(d); }
  };

  const set = (key, val) => setConfig(prev => ({ ...prev, [key]: val }));

  if (!config) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" /></div>;

  const triggers = [
    { id: 'first_message', icon: '⚡', label: 'Tạo ngay khi có tin nhắn', desc: 'Khách nhắn tin lần đầu → tự động tạo Lead ngay lập tức' },
    { id: 'message_count', icon: '🔢', label: 'Sau N tin nhắn', desc: 'Chờ khách nhắn đủ số tin nhắn mới tạo Lead' },
    { id: 'has_phone', icon: '📞', label: 'Khi có số điện thoại', desc: 'Chỉ tạo Lead khi tìm được SĐT trong tin nhắn' },
    { id: 'manual', icon: '🖱️', label: 'Thủ công', desc: 'Không tự tạo — chỉ tạo Lead bằng tay' },
  ];

  return (
    <div className="p-6 overflow-y-auto h-full max-w-3xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-bold text-gray-900">🤖 Điều kiện tự động tạo Lead</h2>
          <p className="text-sm text-gray-500 mt-0.5">Cấu hình khi nào hệ thống tự tạo Lead từ tin nhắn Facebook</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={reset} className="text-xs text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 cursor-pointer">
            Mặc định
          </button>
          <button onClick={save} disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1.5 cursor-pointer shadow-sm">
            {saving ? <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" /> : <Save size={14} />}
            Lưu cài đặt
          </button>
        </div>
      </div>

      {saved && (
        <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-700 flex items-center gap-2">
          <Check size={16} /> Đã lưu cài đặt thành công!
        </div>
      )}

      {/* ═══ TRIGGER — Điều kiện tạo Lead ═══ */}
      <div className="bg-white border rounded-xl p-5 shadow-sm mb-4">
        <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
          <span className="w-6 h-6 bg-blue-100 rounded-lg flex items-center justify-center text-xs">1</span>
          Điều kiện tạo Lead
        </h3>
        <div className="space-y-2">
          {triggers.map(t => (
            <label key={t.id}
              className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition ${config.trigger === t.id ? 'border-blue-500 bg-blue-50' : 'border-gray-100 hover:border-gray-200'}`}
              onClick={() => set('trigger', t.id)}>
              <input type="radio" name="trigger" checked={config.trigger === t.id} onChange={() => set('trigger', t.id)}
                className="mt-0.5 cursor-pointer" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span>{t.icon}</span>
                  <span className="text-sm font-semibold text-gray-800">{t.label}</span>
                </div>
                <p className="text-xs text-gray-500 mt-0.5">{t.desc}</p>
              </div>
            </label>
          ))}
        </div>

        {/* Threshold cho message_count */}
        {config.trigger === 'message_count' && (
          <div className="mt-3 ml-9 p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <label className="text-xs font-medium text-amber-800 block mb-1.5">Số tin nhắn tối thiểu</label>
            <div className="flex items-center gap-3">
              <input type="range" min={1} max={10} value={config.message_count_threshold || 2}
                onChange={e => set('message_count_threshold', parseInt(e.target.value))}
                className="flex-1 cursor-pointer" />
              <span className="text-lg font-bold text-amber-700 w-8 text-center">{config.message_count_threshold || 2}</span>
            </div>
            <p className="text-[10px] text-amber-600 mt-1">
              Khách phải nhắn ít nhất {config.message_count_threshold || 2} tin nhắn mới tự động tạo Lead
            </p>
          </div>
        )}
      </div>

      {/* ═══ TÊN KHÁCH MẶC ĐỊNH ═══ */}
      <div className="bg-white border rounded-xl p-5 shadow-sm mb-4">
        <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
          <span className="w-6 h-6 bg-purple-100 rounded-lg flex items-center justify-center text-xs">2</span>
          Tên khách mặc định
        </h3>
        <div className="flex items-center gap-3">
          <input value={config.default_customer_name || ''} onChange={e => set('default_customer_name', e.target.value)}
            placeholder="User" className="flex-1 px-3 py-2 text-sm border rounded-lg focus:ring-2 focus:ring-blue-500" />
          <p className="text-xs text-gray-500">Tên tạm khi chưa biết tên thật</p>
        </div>
      </div>

      {/* ═══ TỰ ĐỘNG CẬP NHẬT ═══ */}
      <div className="bg-white border rounded-xl p-5 shadow-sm mb-4">
        <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
          <span className="w-6 h-6 bg-green-100 rounded-lg flex items-center justify-center text-xs">3</span>
          Tự động cập nhật thông tin
        </h3>
        <div className="space-y-3">
          {[
            { key: 'auto_update_name', icon: '👤', label: 'Cập nhật tên', desc: 'Tự động cập nhật tên khách khi lấy được từ Facebook' },
            { key: 'auto_update_phone', icon: '📞', label: 'Cập nhật SĐT', desc: 'Tự động cập nhật SĐT khi tìm được trong tin nhắn' },
            { key: 'auto_update_address', icon: '📍', label: 'Cập nhật địa chỉ', desc: 'Tự động cập nhật địa chỉ khi tìm được trong tin nhắn' },
          ].map(item => (
            <div key={item.key} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
              <div className="flex items-center gap-2">
                <span>{item.icon}</span>
                <div>
                  <p className="text-sm font-medium text-gray-700">{item.label}</p>
                  <p className="text-[10px] text-gray-500">{item.desc}</p>
                </div>
              </div>
              <button onClick={() => set(item.key, !config[item.key])}
                className={`w-10 h-6 rounded-full transition cursor-pointer flex items-center ${config[item.key] ? 'bg-green-500 justify-end' : 'bg-gray-300 justify-start'}`}>
                <span className="w-5 h-5 bg-white rounded-full shadow mx-0.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ COMPANY + LEAD TYPE DEFAULTS ═══ */}
      <div className="bg-white border rounded-xl p-5 shadow-sm mb-4">
        <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
          <span className="w-6 h-6 bg-indigo-100 rounded-lg flex items-center justify-center text-xs">4</span>
          Công ty & loại Lead mặc định
        </h3>
        {!isAdminLike(user) ? (
          <div className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            Chỉ Admin được cấu hình công ty/loại mặc định cho auto tạo lead từ Facebook.
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">🏢 Công ty mặc định</label>
              <select
                value={config.default_company_id || ''}
                onChange={(e) => {
                  const next = e.target.value || null;
                  set('default_company_id', next);
                  // reset type when company changes
                  set('default_lead_type_id', null);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
              >
                <option value="">— Không đặt (dùng theo Page nếu có) —</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.short_name || c.name}</option>
                ))}
              </select>
              <p className="text-[10px] text-gray-500 mt-1">
                Nếu từng Page đã set <strong>default_company_id</strong> thì Page sẽ được ưu tiên.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1.5">🏷️ Loại Lead mặc định</label>
              <select
                value={config.default_lead_type_id || ''}
                onChange={(e) => set('default_lead_type_id', e.target.value || null)}
                disabled={!config.default_company_id || leadTypesLoading}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white disabled:opacity-60"
              >
                <option value="">— Không bắt buộc —</option>
                {leadTypes
                  .filter((t) => t.is_active !== false)
                  .filter((t) => t.applies_to === 'both' || t.applies_to === 'lead')
                  .map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
              </select>
              {!config.default_company_id && (
                <p className="text-[10px] text-amber-600 mt-1">Chọn công ty trước để load danh sách loại.</p>
              )}
              <p className="text-[10px] text-gray-500 mt-1">
                Hệ thống sẽ chỉ áp dụng loại nếu loại đó thuộc đúng công ty & áp dụng cho Lead.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ═══ HÀNH VI KHÁC ═══ */}
      <div className="bg-white border rounded-xl p-5 shadow-sm mb-4">
        <h3 className="text-sm font-bold text-gray-800 mb-3 flex items-center gap-2">
          <span className="w-6 h-6 bg-amber-100 rounded-lg flex items-center justify-center text-xs">4</span>
          Hành vi khác
        </h3>
        <div className="space-y-3">
          {[
            { key: 'auto_reply_first_message', icon: '💬', label: 'Tự động trả lời tin đầu', desc: 'Gửi tin nhắn tự động khi khách nhắn lần đầu (cấu hình ở Cài đặt Page)' },
            { key: 'recreate_deleted_leads', icon: '♻️', label: 'Tạo lại Lead đã xóa', desc: 'Nếu Lead cũ bị xóa, tạo lại khi khách nhắn tin tiếp' },
            { key: 'notify_on_new_lead', icon: '🔔', label: 'Thông báo Lead mới', desc: 'Gửi thông báo cho người phụ trách khi tạo Lead mới' },
            { key: 'notify_on_phone_found', icon: '📲', label: 'Thông báo tìm SĐT', desc: 'Gửi thông báo khi tìm được SĐT mới trong tin nhắn' },
          ].map(item => (
            <div key={item.key} className="flex items-center justify-between p-3 rounded-lg bg-gray-50">
              <div className="flex items-center gap-2">
                <span>{item.icon}</span>
                <div>
                  <p className="text-sm font-medium text-gray-700">{item.label}</p>
                  <p className="text-[10px] text-gray-500">{item.desc}</p>
                </div>
              </div>
              <button onClick={() => set(item.key, !config[item.key])}
                className={`w-10 h-6 rounded-full transition cursor-pointer flex items-center ${config[item.key] ? 'bg-green-500 justify-end' : 'bg-gray-300 justify-start'}`}>
                <span className="w-5 h-5 bg-white rounded-full shadow mx-0.5" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ═══ PREVIEW ═══ */}
      <div className="bg-gradient-to-br from-gray-50 to-blue-50 border-2 border-dashed border-blue-200 rounded-xl p-5">
        <h3 className="text-sm font-bold text-gray-700 mb-3">👁️ Xem trước luồng hoạt động</h3>
        <div className="space-y-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold">1</span>
            <span className="text-gray-600">Khách nhắn tin trên Facebook Messenger</span>
          </div>
          <div className="ml-2.5 border-l-2 border-blue-200 h-3" />
          {config.trigger === 'first_message' ? (
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 bg-green-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold">2</span>
              <span className="text-gray-600">⚡ <strong>Tạo Lead ngay</strong> — tên: "{config.default_customer_name || 'User'}"</span>
            </div>
          ) : config.trigger === 'message_count' ? (
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 bg-amber-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold">2</span>
              <span className="text-gray-600">⏳ Chờ khách nhắn đủ <strong>{config.message_count_threshold}</strong> tin → tạo Lead</span>
            </div>
          ) : config.trigger === 'has_phone' ? (
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 bg-purple-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold">2</span>
              <span className="text-gray-600">📞 Chờ phát hiện SĐT trong tin nhắn → tạo Lead</span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="w-5 h-5 bg-gray-400 text-white rounded-full flex items-center justify-center text-[10px] font-bold">2</span>
              <span className="text-gray-600">🖱️ Không tạo Lead tự động — chờ nhân viên tạo thủ công</span>
            </div>
          )}
          <div className="ml-2.5 border-l-2 border-blue-200 h-3" />
          <div className="flex items-start gap-2">
            <span className="w-5 h-5 bg-blue-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">3</span>
            <div className="text-gray-600">
              {config.auto_update_name && '👤 Cập nhật tên'}
              {config.auto_update_name && config.auto_update_phone && ' → '}
              {config.auto_update_phone && '📞 Cập nhật SĐT'}
              {(config.auto_update_name || config.auto_update_phone) && config.auto_update_address && ' → '}
              {config.auto_update_address && '📍 Cập nhật địa chỉ'}
              {!config.auto_update_name && !config.auto_update_phone && !config.auto_update_address && 'Không tự cập nhật'}
              <p className="text-[10px] text-blue-700 mt-1 font-normal leading-snug">
                Thứ tự quét trên server và quét SĐT định kỳ: ưu tiên khách hoạt động mới nhất (tin nhắn hoặc hồ sơ mới tạo).
              </p>
            </div>
          </div>
          {config.notify_on_new_lead && (
            <>
              <div className="ml-2.5 border-l-2 border-blue-200 h-3" />
              <div className="flex items-center gap-2">
                <span className="w-5 h-5 bg-orange-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold">4</span>
                <span className="text-gray-600">🔔 Thông báo cho người phụ trách</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ══ LEAD SCAN — Quét SĐT → Tạo lead theo lịch ══ */}
      <LeadScanPanel />

      {/* ══ RESCAN PHONES — Quét lại SĐT từ tin inbound theo lịch ══ */}
      <RescanPhonesSchedulePanel />

      {/* ══ AUTO TOOL v2 — Đồng bộ + quét SĐT + tạo lead (realtime) ══ */}
      <AutoToolPanelInline />
    </div>
  );
}

function LeadScanPanel() {
  const [cfg, setCfg] = useState({ enabled: false, interval_minutes: 60, timer_active: false });
  const [preview, setPreview] = useState(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const loadCfg = () => fetch(`${API}/api/facebook/lead-scan/config`, { headers: hdr() })
    .then(r => r.ok ? r.json() : null).then(d => d && setCfg(d)).catch(() => {});

  const loadPreview = () => fetch(`${API}/api/facebook/lead-scan/preview`, { headers: hdr() })
    .then(r => r.ok ? r.json() : null).then(d => d && setPreview(d)).catch(() => {});

  useEffect(() => { loadCfg(); loadPreview(); }, []);

  const saveCfg = async (patch) => {
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/facebook/lead-scan/config`, {
        method: 'PUT', headers: hdr(), body: JSON.stringify({ ...cfg, ...patch }),
      });
      if (res.ok) { const d = await res.json(); setCfg(d); }
    } catch (e) { alert('Lỗi: ' + e.message); }
    setSaving(false);
  };

  const runNow = async () => {
    if (!confirm(`Chạy quét ngay bây giờ? Sẽ tạo lead cho ${preview?.count || 0} contact có SĐT.`)) return;
    setRunning(true); setResult(null);
    try {
      const res = await fetch(`${API}/api/facebook/lead-scan/run`, { method: 'POST', headers: hdr() });
      const d = await res.json();
      setResult(d);
      loadPreview();
    } catch (e) { alert('Lỗi: ' + e.message); }
    setRunning(false);
  };

  const INTERVALS = [
    { value: 15, label: 'Mỗi 15 phút' },
    { value: 30, label: 'Mỗi 30 phút' },
    { value: 60, label: 'Mỗi 1 giờ' },
    { value: 120, label: 'Mỗi 2 giờ' },
    { value: 360, label: 'Mỗi 6 giờ' },
    { value: 720, label: 'Mỗi 12 giờ' },
    { value: 1440, label: 'Mỗi 24 giờ' },
  ];

  return (
    <div className="bg-white border rounded-xl p-5 shadow-sm mt-4">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            📶 Quét contact có SĐT → Tạo Lead tự động
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Hệ thống sẽ quét contact Facebook có số điện thoại nhưng chưa có Lead → tự động tạo Lead theo lịch.
            Danh sách và thứ tự xử lý: <strong className="text-gray-700">mới nhất trước</strong> (theo tin cuối hoặc lúc tạo hồ sơ), không xử lý từ đầu danh sách cũ.
            Nguồn Lead theo tên Page Facebook tương ứng.
          </p>
        </div>
        {/* Toggle enabled */}
        <label className="flex items-center gap-2 cursor-pointer ml-4">
          <div
            onClick={() => saveCfg({ enabled: !cfg.enabled })}
            className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
              cfg.enabled ? 'bg-green-500' : 'bg-gray-300'
            }`}>
            <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${cfg.enabled ? 'translate-x-6' : ''}`} />
          </div>
          <span className={`text-xs font-medium ${cfg.enabled ? 'text-green-700' : 'text-gray-500'}`}>
            {cfg.enabled ? '✅ Đang bật' : 'Tắt'}
          </span>
        </label>
      </div>

      {/* Preview count */}
      <div className="flex items-center gap-3 mb-4 p-3 rounded-lg bg-blue-50 border border-blue-100">
        <span className="text-2xl font-bold text-blue-700">{preview?.count ?? '...'}</span>
        <div>
          <div className="text-sm font-medium text-blue-800">contact có SĐT, chưa có Lead</div>
          <button onClick={() => { loadPreview(); setShowPreview(v => !v); }}
            className="text-xs text-blue-600 hover:underline cursor-pointer">
            {showPreview ? 'Ẩn danh sách' : 'Xem danh sách'}
          </button>
        </div>
        <div className="ml-auto flex gap-2">
          <button onClick={runNow} disabled={running || (preview?.count ?? 0) === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white text-xs rounded-lg hover:bg-green-700 disabled:opacity-50 cursor-pointer shadow-sm">
            {running
              ? <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
              : '▶️'}
            Chạy ngay
          </button>
        </div>
      </div>

      {/* Preview list */}
      {showPreview && preview?.contacts?.length > 0 && (
        <div className="mb-4 border rounded-lg overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left text-gray-500 w-8">#</th>
                <th className="px-3 py-2 text-left text-gray-500">Tên</th>
                <th className="px-3 py-2 text-left text-gray-500">SĐT</th>
                <th className="px-3 py-2 text-left text-gray-500">Page Facebook</th>
                <th className="px-3 py-2 text-left text-gray-500">Tin inbound</th>
                <th className="px-3 py-2 text-left text-gray-500">Hoạt động cuối</th>
                <th className="px-3 py-2 text-left text-gray-500">Nguồn</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {preview.contacts.map((c, idx) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-400 font-mono text-[10px]">{idx + 1}</td>
                  <td className="px-3 py-2">
                    {idx === 0 && (
                      <span className="mr-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1 py-0.5 rounded">Tiếp theo</span>
                    )}
                    {c.fb_name || 'Facebook User'}
                  </td>
                  <td className="px-3 py-2 font-mono text-green-700">{c.phone}</td>
                  <td className="px-3 py-2 text-blue-700">{c.page_name}</td>
                  <td className="px-3 py-2 text-gray-500">{c.message_count ?? 0} tin</td>
                  <td className="px-3 py-2 text-gray-600 text-[11px]">
                    {c.fb_last_activity_at
                      ? new Date(c.fb_last_activity_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                      : '—'}
                    {c.fb_is_recent_activity && <span className="ml-1 text-emerald-600 font-medium">· Mới</span>}
                  </td>
                  <td className="px-3 py-2 text-gray-500 text-[11px]">{c.fb_activity_source === 'message' ? 'Tin nhắn' : 'Hồ sơ'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Schedule settings */}
      {cfg.enabled && (
        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg mb-4">
          <span className="text-sm text-gray-700 whitespace-nowrap">⏰ Chạy tự động:</span>
          <select
            value={cfg.interval_minutes}
            onChange={e => saveCfg({ interval_minutes: parseInt(e.target.value) })}
            className="flex-1 px-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-blue-400 cursor-pointer bg-white">
            {INTERVALS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
          </select>
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${
            cfg.timer_active ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
          }`}>
            {cfg.timer_active ? '⏰ Đang chạy' : '⏹️ Chưa chạy'}
          </span>
        </div>
      )}

      {/* Last scan result */}
      {result && (
        <div className={`p-3 rounded-lg border text-sm ${
          result.errors?.length ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'
        }`}>
          <div className="font-semibold mb-1">📊 Kết quả quét:</div>
          {result.sort_note && <p className="text-[11px] text-gray-600 mb-1">{result.sort_note}</p>}
          <div className="flex gap-4 text-xs">
            <span>🔍 Quét: <b>{result.scanned}</b></span>
            <span className="text-green-700">✅ Tạo: <b>{result.created}</b></span>
            <span className="text-gray-500">⏩ Bỏ qua: <b>{result.skipped}</b></span>
            {result.errors?.length > 0 && <span className="text-red-600">❌ Lỗi: <b>{result.errors.length}</b></span>}
          </div>
          {result.leads?.length > 0 && (
            <div className="mt-2 space-y-1">
              {result.leads.map((l, i) => (
                <div key={i} className="text-xs text-green-700">✅ {l.code} — {l.name} — {l.phone}</div>
              ))}
            </div>
          )}
          {result.errors?.length > 0 && (
            <div className="mt-1 text-xs text-red-600">{result.errors.join('; ')}</div>
          )}
        </div>
      )}
    </div>
  );
}

function RescanPhonesSchedulePanel() {
  const empty = {
    enabled: false,
    interval_minutes: 60,
    limit: 50,
    mode: 'all',
    overwrite: true,
    sort: 'newest_first',
    page_id: null,
    sync_customer: true,
    delete_lead_when_no_phone: false,
    timer_armed: false,
    running: false,
    next_run_at: null,
  };
  const [cfg, setCfg] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [pages, setPages] = useState([]);

  const loadCfg = useCallback(() => {
    fetch(`${API}/api/facebook/rescan-phones/schedule/config`, { headers: hdr() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setCfg({ ...empty, ...d }))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadCfg();
    fetch(`${API}/api/facebook/pages`, { headers: hdr() })
      .then((r) => (r.ok ? r.json() : []))
      .then((d) => setPages(Array.isArray(d) ? d : []))
      .catch(() => setPages([]));
  }, [loadCfg]);

  const saveCfg = async (patch) => {
    setSaving(true);
    try {
      const merged = { ...cfg, ...patch };
      const body = {
        enabled: !!merged.enabled,
        interval_minutes: merged.interval_minutes,
        limit: merged.limit,
        mode: merged.mode,
        overwrite: merged.overwrite !== false,
        sort: merged.sort,
        sync_customer: merged.sync_customer !== false,
        delete_lead_when_no_phone: !!merged.delete_lead_when_no_phone,
        page_id: merged.page_id && String(merged.page_id).trim() ? String(merged.page_id).trim() : null,
      };
      const res = await fetch(`${API}/api/facebook/rescan-phones/schedule/config`, {
        method: 'PUT',
        headers: { ...hdr(), 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const d = await res.json();
        setCfg({ ...empty, ...d });
      } else {
        const e = await res.json().catch(() => ({}));
        alert(e.error || 'Lỗi lưu lịch quét SĐT');
      }
    } catch (e) {
      alert('Lỗi: ' + e.message);
    }
    setSaving(false);
  };

  const INTERVALS = [
    { value: 15, label: 'Nghỉ 15 phút giữa các lần' },
    { value: 30, label: 'Nghỉ 30 phút' },
    { value: 60, label: 'Nghỉ 1 giờ' },
    { value: 120, label: 'Nghỉ 2 giờ' },
    { value: 360, label: 'Nghỉ 6 giờ' },
    { value: 720, label: 'Nghỉ 12 giờ' },
    { value: 1440, label: 'Nghỉ 24 giờ' },
  ];

  const intervalSelectOptions = useMemo(() => {
    const v = Math.max(15, parseInt(cfg.interval_minutes, 10) || 60);
    if (INTERVALS.some((i) => i.value === v)) return INTERVALS;
    return [...INTERVALS, { value: v, label: `Nghỉ ${v} phút` }].sort((a, b) => a.value - b.value);
  }, [cfg.interval_minutes]);

  const nextLabel = cfg.next_run_at
    ? new Date(cfg.next_run_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
    : '—';

  return (
    <div className="bg-white border rounded-xl p-5 shadow-sm mt-4 border-rose-100">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
            🔁 Quét lại SĐT từ tin nhắn (lịch tự động)
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            Mỗi lần chạy đọc tin inbound đã lưu, cập nhật SĐT contact (giống công cụ trong Danh bạ). Sau mỗi lần xong, hệ thống nghỉ đủ số phút bạn chọn rồi chạy tiếp.
          </p>
        </div>
        <label className="flex items-center gap-2 cursor-pointer ml-4 shrink-0">
          <div
            onClick={() => { if (saving) return; saveCfg({ enabled: !cfg.enabled }); }}
            className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
              cfg.enabled ? 'bg-rose-500' : 'bg-gray-300'
            } ${saving ? 'opacity-50 pointer-events-none' : ''}`}
          >
            <div className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${cfg.enabled ? 'translate-x-6' : ''}`} />
          </div>
          <span className={`text-xs font-medium whitespace-nowrap ${cfg.enabled ? 'text-rose-700' : 'text-gray-500'}`}>
            {cfg.enabled ? 'Đang bật' : 'Tắt'}
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3 text-[11px]">
        <span className={`px-2 py-0.5 rounded-full font-medium ${cfg.running ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-600'}`}>
          {cfg.running ? 'Đang chạy một lượt' : 'Rảnh'}
        </span>
        <span className={`px-2 py-0.5 rounded-full font-medium ${cfg.timer_armed ? 'bg-rose-100 text-rose-800' : 'bg-gray-100 text-gray-500'}`}>
          {cfg.timer_armed ? 'Đã hẹn lượt tiếp' : 'Chưa hẹn'}
        </span>
        <span className="text-gray-500">
          Lượt tiếp (dự kiến): <strong className="text-gray-800">{nextLabel}</strong>
        </span>
        <button
          type="button"
          onClick={loadCfg}
          disabled={saving}
          className="ml-auto text-xs text-rose-600 hover:underline cursor-pointer disabled:opacity-50"
        >
          Làm mới trạng thái
        </button>
      </div>

      {cfg.enabled && (
        <div className="space-y-3 p-3 bg-rose-50/60 rounded-lg border border-rose-100">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-700 whitespace-nowrap">Nghỉ giữa hai lần chạy:</span>
            <select
              value={Math.max(15, parseInt(cfg.interval_minutes, 10) || 60)}
              onChange={(e) => saveCfg({ interval_minutes: parseInt(e.target.value, 10) })}
              disabled={saving}
              className="flex-1 min-w-[200px] px-2 py-1.5 text-xs border rounded-lg bg-white cursor-pointer disabled:opacity-50"
            >
              {intervalSelectOptions.map((i) => (
                <option key={i.value} value={i.value}>{i.label}</option>
              ))}
            </select>
          </div>

          <div>
            <span className="text-xs text-gray-700 block mb-1">Số contact mỗi lần (1–1000)</span>
            <input
              type="number"
              min={1}
              max={1000}
              value={cfg.limit}
              onChange={(e) => setCfg((c) => ({ ...c, limit: Math.min(1000, Math.max(1, parseInt(e.target.value, 10) || 1)) }))}
              onBlur={(e) => {
                const v = Math.min(1000, Math.max(1, parseInt(e.target.value, 10) || 50));
                setCfg((c) => ({ ...c, limit: v }));
                saveCfg({ limit: v });
              }}
              disabled={saving}
              className="w-28 px-2 py-1.5 text-xs border rounded-lg disabled:opacity-50"
            />
          </div>

          <div>
            <span className="text-xs text-gray-700 block mb-1">Phạm vi</span>
            <div className="flex flex-wrap gap-1.5">
              {[
                { v: 'all', l: 'Tất cả' },
                { v: 'without_phone', l: 'Chưa có SĐT' },
                { v: 'with_phone', l: 'Đã có SĐT' },
              ].map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  disabled={saving}
                  onClick={() => saveCfg({ mode: opt.v })}
                  className={`px-2 py-1 rounded-md text-[11px] border cursor-pointer disabled:opacity-50 ${
                    cfg.mode === opt.v ? 'border-rose-500 bg-white text-rose-800' : 'border-gray-200 bg-white/80 text-gray-600 hover:bg-white'
                  }`}
                >
                  {opt.l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-xs text-gray-700 block mb-1">Thứ tự</span>
            <div className="flex gap-1.5">
              {[
                { v: 'newest_first', l: 'Mới nhất trước' },
                { v: 'oldest_first', l: 'Cũ nhất trước' },
              ].map((opt) => (
                <button
                  key={opt.v}
                  type="button"
                  disabled={saving}
                  onClick={() => saveCfg({ sort: opt.v })}
                  className={`px-2 py-1 rounded-md text-[11px] border cursor-pointer disabled:opacity-50 ${
                    cfg.sort === opt.v ? 'border-rose-500 bg-white text-rose-800' : 'border-gray-200 bg-white/80 text-gray-600 hover:bg-white'
                  }`}
                >
                  {opt.l}
                </button>
              ))}
            </div>
          </div>

          <div>
            <span className="text-xs text-gray-700 block mb-1">Giới hạn Page (tuỳ chọn)</span>
            <select
              value={cfg.page_id || ''}
              onChange={(e) => saveCfg({ page_id: e.target.value || null })}
              disabled={saving}
              className="w-full max-w-md px-2 py-1.5 text-xs border rounded-lg bg-white cursor-pointer disabled:opacity-50"
            >
              <option value="">Tất cả Page</option>
              {(pages || []).map((p) => (
                <option key={p.page_id} value={p.page_id}>{p.page_name || p.page_id}</option>
              ))}
            </select>
          </div>

          <div className="flex flex-col gap-1.5 text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={cfg.overwrite !== false}
                onChange={(e) => saveCfg({ overwrite: e.target.checked })}
                disabled={saving}
                className="rounded text-rose-600"
              />
              Ghi đè SĐT cũ nếu tìm SĐT mới khác
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={cfg.sync_customer !== false}
                onChange={(e) => saveCfg({ sync_customer: e.target.checked })}
                disabled={saving}
                className="rounded text-rose-600"
              />
              Đồng bộ sang customer.phone khi có khách hàng liên kết
            </label>
            <label className="flex items-center gap-2 cursor-pointer text-rose-900">
              <input
                type="checkbox"
                checked={!!cfg.delete_lead_when_no_phone}
                onChange={(e) => saveCfg({ delete_lead_when_no_phone: e.target.checked })}
                disabled={saving}
                className="rounded text-rose-600"
              />
              Xóa lead nếu inbound không trích được SĐT (kể cả contact còn SĐT cũ; điều kiện an toàn)
            </label>
          </div>

          <p className="text-[10px] text-gray-500 leading-snug">
            Lần đầu sau khi bật hoặc sau khi đổi cấu hình: chạy sau khoảng 5 giây. Sau mỗi lần quét xong mới bắt đầu đếm thời gian nghỉ. Có thể vẫn dùng nút quét thủ công trong tab Danh bạ bất cứ lúc nào.
            {' '}Thứ tự «mới nhất» = max(tin cuối, lúc tạo hồ sơ), giống danh bạ.
          </p>
        </div>
      )}
    </div>
  );
}

// ═══ WEBHOOK LOGS TAB ═══
// Disabled: không hiển thị/không gọi API logs nữa.
function WebhookLogsTab() { return null; }

function SettingsTab({ onPagesChanged, fbCompanyQs = '' }) {
  const { user } = useAuth();
  const showImageSetsAdmin = isAdminLike(user) && !isCrmSocialInboxUser(user);
  const [pages, setPages] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [stages, setStages] = useState([]);
  const [stagesLoading, setStagesLoading] = useState(false);
  const [users, setUsers] = useState([]);
  const [leadTypes, setLeadTypes] = useState([]);
  const [leadTypesLoading, setLeadTypesLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [pageDeleteTarget, setPageDeleteTarget] = useState(null);
  const [pageDeleteBusy, setPageDeleteBusy] = useState(false);
  const emptyForm = { page_id: '', page_name: '', access_token: '', webhook_verify_token: 'tubep_pro_verify_2024', auto_reply_message: 'Cảm ơn bạn đã liên hệ! Chúng tôi sẽ phản hồi sớm nhất.', auto_create_lead: true, default_module_key: '', default_target_type: 'lead', default_company_id: '', default_region_id: '', default_lead_type_id: '', default_stage_id: '', default_lead_owner_id: '' };
  const [form, setForm] = useState({ ...emptyForm });
  const [formCompanyRegions, setFormCompanyRegions] = useState([]);
  const [regionsByCompanyId, setRegionsByCompanyId] = useState({});
  const recordKind = String(form.default_target_type || 'lead').toLowerCase() === 'deal' ? 'deal' : 'lead';
  const moduleKey = recordKind === 'lead'
    ? 'crm'
    : String(form.default_module_key || 'crm').trim().toLowerCase();
  const targetType = recordKind === 'lead'
    ? 'lead'
    : (moduleKey === 'production' || moduleKey === 'logistics' ? 'deal' : recordKind);

  const load = () => {
    const q = fbCompanyQs ? `?${fbCompanyQs}` : '';
    fetch(`${API}/api/facebook/pages${q}`, { headers: hdr() })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows) => {
        setPages(rows);
        onPagesChanged?.();
      })
      .catch(() => {});
  };
  useEffect(() => {
    load();
  }, [fbCompanyQs]);

  useEffect(() => {
    if (!moduleKey) {
      setCompanies([]);
      return;
    }
    api.get('/companies', { params: { for_module: moduleKey } })
      .then((r) => setCompanies(r.data?.companies || r.data || []))
      .catch(() => setCompanies([]));
  }, [moduleKey]);

  useEffect(() => {
    const cid = form.default_company_id;
    if (!cid || !moduleKey) {
      setUsers([]);
      return;
    }
    api.get('/crm/employees-by-company', { params: { company_id: cid, for_module: moduleKey } })
      .then((r) => setUsers(Array.isArray(r.data?.users) ? r.data.users : []))
      .catch(() => setUsers([]));
  }, [form.default_company_id, moduleKey]);

  /** Tên khu vực cho badge từng Page (theo công ty + module của Page) */
  useEffect(() => {
    const keys = [...new Set((pages || []).map((p) => {
      const cid = p.default_company_id ? String(p.default_company_id) : '';
      const mk = String(p.default_module_key || '').trim().toLowerCase();
      return cid ? `${cid}::${mk || 'crm'}` : '';
    }).filter(Boolean))];
    if (!keys.length) {
      setRegionsByCompanyId({});
      return;
    }
    let cancelled = false;
    Promise.all(
      keys.map((key) => {
        const [cid, mk] = String(key).split('::');
        api
          .get('/crm/company-regions', { params: { company_id: cid, for_module: mk || 'crm' } })
          .then((r) => [key, Array.isArray(r.data) ? r.data : []])
          .catch(() => [key, []]);
      }),
    ).then((pairs) => {
      if (!cancelled) setRegionsByCompanyId(Object.fromEntries(pairs));
    });
    return () => {
      cancelled = true;
    };
  }, [pages]);

  useEffect(() => {
    const cid = form.default_company_id;
    if (!cid || !moduleKey) {
      setFormCompanyRegions([]);
      return;
    }
    let cancelled = false;
    api
      .get('/crm/company-regions', { params: { company_id: cid, for_module: moduleKey } })
      .then((r) => {
        if (cancelled) return;
        setFormCompanyRegions(Array.isArray(r.data) ? r.data : []);
      })
      .catch(() => {
        if (!cancelled) setFormCompanyRegions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [form.default_company_id, moduleKey]);

  useEffect(() => {
    if (!form.default_region_id || !form.default_company_id) return;
    if (formCompanyRegions.length === 0) return;
    const ok = formCompanyRegions.some((reg) => String(reg.id) === String(form.default_region_id));
    if (!ok) setForm((prev) => ({ ...prev, default_region_id: '' }));
  }, [formCompanyRegions, form.default_region_id, form.default_company_id]);

  // Giai đoạn/cột theo module + công ty + phân loại đang chọn
  useEffect(() => {
    const cid = form.default_company_id;
    if (!cid || !targetType) {
      setStages([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setStagesLoading(true);
      try {
        let arr = [];
        if (moduleKey === 'production') {
          const { data: st } = await api.get('/production/pipeline-stages', {
            params: {
              company_id: cid,
              strict_company: 'true',
              workshop_type_id: form.default_lead_type_id || 'global',
              all: 'true',
            },
          });
          arr = Array.isArray(st) ? st : [];
        } else if (moduleKey === 'logistics') {
          // Tạm dùng pipeline CRM Deal cho module logistics ở bước tạo bản ghi từ FB.
          const { data: pls } = await api.get('/crm/pipelines');
          const list = Array.isArray(pls) ? pls : [];
          const forCo = list.filter((p) => String(p.company_id || '') === String(cid));
          const pl = forCo.find((p) => p.is_default) || forCo[0];
          if (pl?.id) {
            const { data: st } = await api.get('/crm/pipeline-stages', {
              params: { type: 'deal', pipeline_id: pl.id, all: 'true' },
            });
            arr = Array.isArray(st) ? st : [];
          }
        } else {
          const { data: pls } = await api.get('/crm/pipelines');
          const list = Array.isArray(pls) ? pls : [];
          const forCo = list.filter((p) => String(p.company_id || '') === String(cid));
          const pl = forCo.find((p) => p.is_default) || forCo[0];
          if (pl?.id) {
            const { data: st } = await api.get('/crm/pipeline-stages', {
              params: { type: targetType, pipeline_id: pl.id, all: 'true' },
            });
            arr = Array.isArray(st) ? st : [];
          }
        }
        if (!cancelled) {
          setStages(arr);
          setForm((prev) => {
            if (!prev.default_stage_id) return prev;
            if (arr.some((s) => String(s.id) === String(prev.default_stage_id))) return prev;
            return { ...prev, default_stage_id: '' };
          });
        }
      } catch {
        if (!cancelled) {
          setStages([]);
          setForm((prev) => (prev.default_stage_id ? { ...prev, default_stage_id: '' } : prev));
        }
      } finally {
        if (!cancelled) setStagesLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [form.default_company_id, form.default_lead_type_id, targetType, moduleKey]);

  const addPage = async () => {
    if (!form.page_id || !form.access_token) return alert('Cần nhập Page ID và Access Token');
    if (!form.default_company_id) return alert('Cần chọn công ty của module đã chọn');
    const payload = { ...form, default_module_key: moduleKey, default_target_type: recordKind };
    const res = await fetch(`${API}/api/facebook/pages`, { method: 'POST', headers: hdr(), body: JSON.stringify(payload) });
    if (res.ok) { load(); setShowAdd(false); setForm({ ...emptyForm }); } else { const e = await res.json(); alert(e.error || 'Lỗi'); }
  };
  const updatePage = async (id, updates) => {
    const res = await fetch(`${API}/api/facebook/pages/${id}`, { method: 'PUT', headers: hdr(), body: JSON.stringify(updates) });
    if (res.ok) { const d = await res.json(); setPages(prev => prev.map(p => p.id === id ? { ...p, ...d } : p)); }
  };
  const confirmDeletePage = async () => {
    if (!pageDeleteTarget || pageDeleteBusy) return;
    setPageDeleteBusy(true);
    try {
      const res = await fetch(`${API}/api/facebook/pages/${pageDeleteTarget.id}`, { method: 'DELETE', headers: hdr() });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        alert(e.error || 'Xóa Page thất bại');
        return;
      }
      setPages((prev) => prev.filter((p) => p.id !== pageDeleteTarget.id));
      if (editingId === pageDeleteTarget.id) setEditingId(null);
      setPageDeleteTarget(null);
      onPagesChanged?.();
    } catch {
      alert('Xóa Page thất bại');
    } finally {
      setPageDeleteBusy(false);
    }
  };
  const startEdit = (p) => {
    setEditingId(p.id);
    setForm({
      page_id: p.page_id,
      page_name: p.page_name || '',
      access_token: '',
      webhook_verify_token: p.webhook_verify_token || '',
      auto_reply_message: p.auto_reply_message || '',
      auto_create_lead: p.auto_create_lead,
      default_module_key: p.default_module_key || 'crm',
      default_target_type: String(p.default_target_type || 'lead').toLowerCase() === 'deal' ? 'deal' : 'lead',
      default_company_id: p.default_company_id || '',
      default_region_id: p.default_region_id || '',
      default_lead_type_id: p.default_lead_type_id || '',
      default_stage_id: p.default_stage_id || '',
      default_lead_owner_id: p.default_lead_owner_id || '',
    });
  };
  const saveEdit = async (id) => {
    if (!form.default_company_id) return alert('Cần chọn công ty của module đã chọn');
    const updates = {
      ...form,
      default_module_key: moduleKey,
      default_target_type: recordKind,
    };
    if (!updates.access_token) delete updates.access_token;
            await fetch(`${API}/api/facebook/pages/${id}`, { method: 'PUT', headers: hdr(), body: JSON.stringify(updates) });
    setEditingId(null); load();
  };

  const webhookUrl = `${window.location.origin.replace(/:\d+$/, '').replace('http://', 'https://').replace('frontend-s30w', 'backend')}/api/facebook/webhook`;

  // Load classifications when company/module changes (for Page setup)
  useEffect(() => {
    const cid = form.default_company_id;
    if (!cid || !moduleKey) {
      setLeadTypes([]);
      if (form.default_lead_type_id) setForm((prev) => ({ ...prev, default_lead_type_id: '' }));
      return;
    }
    let cancelled = false;
    setLeadTypesLoading(true);
    const req = moduleKey === 'production' || moduleKey === 'logistics'
      ? api.get('/workshop/project-types', {
        params: { company_id: cid, module: moduleKey, all: 'true' },
      })
      : api.get('/crm/lead-types', { params: { company_id: cid, all: 'true' } });
    req.then((r) => {
      if (cancelled) return;
      setLeadTypes(Array.isArray(r.data) ? r.data : []);
    })
      .catch(() => { if (!cancelled) setLeadTypes([]); })
      .finally(() => { if (!cancelled) setLeadTypesLoading(false); });
    return () => { cancelled = true; };
  }, [form.default_company_id, moduleKey]);

  const CompanyStageSelectors = () => (
    <div className="space-y-3">
      <div
        className="rounded-xl border-2 border-blue-500 bg-blue-50 px-3 py-3 shadow-sm"
        data-fb-setup-record-kind
      >
        <p className="text-sm font-bold text-blue-900 mb-2">Tạo Lead hay Deal từ Facebook *</p>
        <select
          value={form.default_target_type || 'lead'}
          onChange={(e) => {
            const tt = e.target.value === 'deal' ? 'deal' : 'lead';
            setForm({
              ...form,
              default_target_type: tt,
              default_module_key: tt === 'lead' ? 'crm' : (form.default_module_key && form.default_module_key !== 'crm' ? form.default_module_key : 'crm'),
              default_company_id: '',
              default_region_id: '',
              default_lead_type_id: '',
              default_stage_id: '',
              default_lead_owner_id: '',
            });
          }}
          className="w-full px-3 py-2.5 text-sm border-2 border-blue-300 rounded-lg bg-white cursor-pointer font-medium"
        >
          <option value="lead">📘 Lead — tạo trên pipeline Lead CRM</option>
          <option value="deal">🎯 Deal — tạo trên pipeline Deal (hoặc Sản xuất / Lắp đặt)</option>
        </select>
        <p className="text-[11px] text-blue-800 mt-2">
          {recordKind === 'deal'
            ? 'Chọn Deal để gán giai đoạn mặc định từ pipeline Deal. Có thể tạo thẳng deal CRM hoặc deal module khác bên dưới.'
            : 'Chọn Lead để tin nhắn Facebook tạo lead trên Kanban Lead của công ty.'}
        </p>
      </div>

      {recordKind === 'deal' ? (
        <div>
          <label className="text-xs text-gray-600 mb-1 block font-medium">Module Deal *</label>
          <select
            value={moduleKey || 'crm'}
            onChange={(e) => {
              const mk = e.target.value || 'crm';
              setForm({
                ...form,
                default_module_key: mk,
                default_target_type: 'deal',
                default_company_id: '',
                default_region_id: '',
                default_lead_type_id: '',
                default_stage_id: '',
                default_lead_owner_id: '',
              });
            }}
            className="w-full px-3 py-2 text-sm border rounded cursor-pointer"
          >
            <option value="crm">CRM — Kanban Deal (pipeline Deal công ty)</option>
            <option value="production">Sản xuất — pipeline xưởng</option>
            <option value="logistics">Lắp đặt — pipeline lắp đặt</option>
          </select>
        </div>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
          Module: <strong>CRM</strong> (Lead)
        </div>
      )}
      <div>
        <label className="text-xs text-gray-600 mb-1 block font-medium">Công ty mặc định của module đã chọn *</label>
        <select
          value={form.default_company_id}
          onChange={(e) =>
            setForm({
              ...form,
              default_company_id: e.target.value,
              default_lead_type_id: '',
              default_stage_id: '',
              default_region_id: '',
            })
          }
          disabled={!targetType}
          className="w-full px-3 py-2 text-sm border rounded cursor-pointer"
        >
          <option value="">-- Chọn công ty --</option>
          {companies.map(c => <option key={c.id} value={c.id}>{c.short_name || c.name}</option>)}
        </select>
        {!targetType && <p className="text-[10px] text-gray-400 mt-1">Chọn module trước để mở danh sách công ty</p>}
      </div>

      {/* Luôn hiển thị — đặt ngay sau công ty để dễ thấy (phân khu vực theo công ty đã chọn) */}
      <div
        className="rounded-xl border-2 border-teal-500 bg-teal-50 px-3 py-3 shadow-sm"
        data-fb-setup-region
      >
        <p className="text-sm font-bold text-teal-900 mb-2 flex items-center gap-2">
          <span className="text-lg" aria-hidden>📍</span>
          Khu vực CRM
          <span className="text-[10px] font-normal text-teal-700">(theo công ty đã chọn)</span>
        </p>
        <select
          value={form.default_region_id || ''}
          onChange={(e) => setForm({ ...form, default_region_id: e.target.value })}
          disabled={!targetType || !form.default_company_id}
          className="w-full px-3 py-2.5 text-sm border-2 border-teal-300 rounded-lg bg-white cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <option value="">— Chưa chọn khu vực —</option>
          {formCompanyRegions
            .filter((reg) => reg.is_active !== false)
            .map((reg) => (
              <option key={reg.id} value={reg.id}>
                {reg.name}
                {reg.code ? ` (${reg.code})` : ''}
              </option>
            ))}
        </select>
        {!targetType ? (
          <p className="text-[11px] text-teal-900 mt-2">Chọn <strong>module tạo mới</strong> trước.</p>
        ) : !form.default_company_id ? (
          <p className="text-[11px] text-teal-900 mt-2">Chọn <strong>công ty mặc định</strong> phía trên để mở danh sách khu vực.</p>
        ) : formCompanyRegions.length === 0 ? (
          <p className="text-[11px] text-amber-800 mt-2 font-medium">
            Công ty này chưa có khu vực trong CRM. Vào{' '}
            <Link to="/tasks/regions" className="underline text-blue-700">Không gian làm việc → Khu vực công ty</Link> để tạo.
          </p>
        ) : (
          <p className="text-[11px] text-teal-800 mt-2">{targetType === 'deal' ? 'Deal' : 'Lead'} từ Facebook sẽ gắn đúng khu vực này.</p>
        )}
      </div>

      <div>
        <label className="text-xs text-gray-600 mb-1 block">
          {moduleKey === 'production' || moduleKey === 'logistics'
            ? 'Phân loại mặc định (Đầu vào / Đầu ra)'
            : `Phân loại mặc định (${targetType === 'deal' ? 'Deal' : 'Lead'})`}
        </label>
        <select
          value={form.default_lead_type_id}
          onChange={e => setForm({ ...form, default_lead_type_id: e.target.value })}
          disabled={!targetType || !form.default_company_id || leadTypesLoading}
          className="w-full px-3 py-2 text-sm border rounded cursor-pointer disabled:opacity-60"
        >
          <option value="">-- Không chọn --</option>
          {leadTypes
            .filter((t) => t.is_active !== false)
            .filter((t) => {
              if (moduleKey === 'production' || moduleKey === 'logistics') {
                return t.applies_to === 'both' || t.applies_to === moduleKey;
              }
              return t.applies_to === 'both' || t.applies_to === targetType;
            })
            .map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {!targetType ? (
          <p className="text-[10px] text-gray-400 mt-1">Chọn module trước</p>
        ) : !form.default_company_id ? (
          <p className="text-[10px] text-gray-400 mt-1">Chọn công ty để load phân loại</p>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3">
      <div className="col-span-2">
        <label className="text-xs text-gray-600 mb-1 block">
          {moduleKey === 'production'
            ? 'Cột hiển thị mặc định (pipeline sản xuất theo phân loại)'
            : moduleKey === 'logistics'
              ? 'Giai đoạn mặc định (pipeline deal cho lắp đặt)'
              : `Giai đoạn mặc định (pipeline ${targetType === 'deal' ? 'deal' : 'lead'} của công ty)`}
        </label>
        <select
          value={form.default_stage_id}
          onChange={(e) => setForm({ ...form, default_stage_id: e.target.value })}
          disabled={!targetType || !form.default_company_id || stagesLoading}
          className="w-full px-3 py-2 text-sm border rounded cursor-pointer disabled:opacity-60"
        >
          <option value="">{stagesLoading ? 'Đang tải…' : '-- Tự động (Mới) --'}</option>
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.icon ? `${s.icon} ` : ''}
              {s.name}
            </option>
          ))}
        </select>
        {!targetType ? (
          <p className="text-[10px] text-gray-400 mt-1">Chọn module trước</p>
        ) : !form.default_company_id && (
          <p className="text-[10px] text-gray-400 mt-1">Chọn công ty để xem giai đoạn {targetType === 'deal' ? 'deal' : 'lead'} đúng pipeline</p>
        )}
        {form.default_company_id && !stagesLoading && stages.length === 0 && (
          <p className="text-[10px] text-amber-600 mt-1">Công ty này chưa có pipeline / giai đoạn {targetType === 'deal' ? 'deal' : 'lead'}. Kiểm tra Cài đặt pipeline CRM.</p>
        )}
      </div>
      <div className="col-span-2">
        <label className="text-xs text-gray-600 mb-1 block">👤 Người chịu trách nhiệm {targetType === 'deal' ? 'Deal' : 'Lead'} mặc định</label>
        <select value={form.default_lead_owner_id} onChange={e => setForm({...form, default_lead_owner_id: e.target.value})}
          className="w-full px-3 py-2 text-sm border rounded cursor-pointer">
          <option value="">-- Người tạo Page (mặc định) --</option>
          {users.map(u => <option key={u.id} value={u.id}>{u.full_name || u.email} {(u.role === 'admin' || u.role === 'sales_admin') ? '(Admin)' : ''}</option>)}
        </select>
        <p className="text-[10px] text-gray-400 mt-1">Khi có {targetType === 'deal' ? 'deal' : 'lead'} mới từ Facebook, người này sẽ được gán làm chủ + người phụ trách</p>
      </div>
      </div>
    </div>
  );

  return (
    <div className="p-6 overflow-y-auto h-full max-w-4xl">
      <h2 className="text-lg font-bold mb-4">⚙ Cài đặt Facebook</h2>
      <FacebookPageTokenReminderBanner pages={pages} />
      <div className="bg-white border border-amber-200 rounded-xl p-4 mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-amber-900 text-sm">Dọn SĐT nghi từ link</p>
          <p className="text-xs text-amber-800 mt-0.5 max-w-xl">
            Quét theo khoảng ngày, xem lại danh sách, rồi xóa SĐT + chặn tái tạo lead (số không xuất hiện trong tin inbound sau khi loại URL).
          </p>
        </div>
        <Link
          to="/crm/facebook/link-phone-cleanup"
          className="shrink-0 text-sm font-medium px-4 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700"
        >
          Mở tool
        </Link>
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
        <h3 className="font-bold text-blue-800 mb-2">📋 Hướng dẫn</h3>
        <ol className="text-sm text-blue-700 space-y-1 list-decimal list-inside">
          <li>Vào <a href="https://developers.facebook.com" target="_blank" rel="noreferrer" className="underline font-medium">developers.facebook.com</a> → Tạo App Business</li>
          <li>Thêm Messenger + Webhooks → Kết nối Page → Lấy Token</li>
          <li>Cài Webhook URL bên dưới → Subscribe <code>messages</code></li>
          <li>Nhập Page ID + Token vào form</li>
        </ol>
      </div>
      <div className="bg-gray-50 border rounded-lg p-3 mb-6 flex items-center gap-3">
        <span className="text-sm font-medium text-gray-600 shrink-0">Webhook:</span>
        <code className="text-xs bg-white px-2 py-1 rounded border flex-1 break-all">{webhookUrl}</code>
        <button onClick={() => navigator.clipboard.writeText(webhookUrl)} className="text-xs bg-gray-200 px-2 py-1 rounded hover:bg-gray-300 cursor-pointer flex items-center gap-1"><Copy size={12} /> Copy</button>
      </div>

      <div className="space-y-4 mb-6">
        {pages.map(p => (
          <div key={p.id} className="bg-white border rounded-xl p-5 shadow-sm">
            {editingId === p.id ? (
              <div className="space-y-3">
                <h3 className="font-bold text-sm">✏️ Sửa Page</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-gray-600 mb-1 block">Page ID</label><input value={form.page_id} onChange={e => setForm({...form, page_id: e.target.value})} className="w-full px-3 py-2 text-sm border rounded" /></div>
                  <div><label className="text-xs text-gray-600 mb-1 block">Tên Page</label><input value={form.page_name} onChange={e => setForm({...form, page_name: e.target.value})} className="w-full px-3 py-2 text-sm border rounded" /></div>
                </div>
                <div><label className="text-xs text-gray-600 mb-1 block">Token mới (bỏ trống = giữ cũ)</label><textarea value={form.access_token} onChange={e => setForm({...form, access_token: e.target.value})} rows={2} className="w-full px-3 py-2 text-sm border rounded font-mono" placeholder="Paste token..." /></div>
                <div><label className="text-xs text-gray-600 mb-1 block">Tin nhắn tự động</label><input value={form.auto_reply_message} onChange={e => setForm({...form, auto_reply_message: e.target.value})} className="w-full px-3 py-2 text-sm border rounded" /></div>
                <CompanyStageSelectors />
                <div className="flex items-center gap-2 pt-1"><input type="checkbox" checked={form.auto_create_lead} onChange={e => setForm({...form, auto_create_lead: e.target.checked})} id={`acl-${p.id}`} className="cursor-pointer" /><label htmlFor={`acl-${p.id}`} className="text-sm">Tự động tạo {targetType === 'deal' ? 'Deal' : 'Lead'}</label></div>
                <div className="flex gap-2 pt-2">
                  <button onClick={() => saveEdit(p.id)} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 cursor-pointer flex items-center gap-1"><Save size={14} /> Lưu</button>
                  <button onClick={() => setEditingId(null)} className="text-gray-500 text-sm cursor-pointer px-4 py-2">Hủy</button>
                </div>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-lg flex items-center justify-center text-white font-bold shadow-sm">f</div>
                    <div><h3 className="font-bold text-gray-800">{p.page_name || p.page_id}</h3><p className="text-xs text-gray-500">ID: {p.page_id}</p></div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => startEdit(p)} className="text-xs text-gray-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-gray-100 cursor-pointer flex items-center gap-1"><Edit3 size={12} /> Sửa</button>
                    <button
                      type="button"
                      onClick={() => setPageDeleteTarget({
                        id: p.id,
                        name: p.page_name || p.page_id,
                        page_id: p.page_id,
                      })}
                      className="text-xs text-gray-500 hover:text-red-600 px-2 py-1 rounded hover:bg-gray-100 cursor-pointer flex items-center gap-1"
                    >
                      <Trash2 size={12} /> Xóa
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="text-xs px-3 py-1.5 rounded-lg bg-slate-50 text-slate-700 border border-slate-200">
                    🧩 {String(p.default_module_key || '').toLowerCase() === 'production'
                      ? 'Module Sản xuất'
                      : String(p.default_module_key || '').toLowerCase() === 'logistics'
                        ? 'Module Lắp đặt'
                        : 'Module CRM'}
                  </span>
                  <span className="text-xs px-3 py-1.5 rounded-lg bg-slate-100 text-slate-700 border border-slate-200">
                    {String(p.default_target_type || 'lead').toLowerCase() === 'deal' ? '🎯 Tạo Deal' : '📘 Tạo Lead'}
                  </span>
                  <button onClick={() => updatePage(p.id, { is_active: !p.is_active })}
                    className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition ${p.is_active ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-600 border border-red-200'}`}>
                    {p.is_active ? <ToggleRight size={14} /> : <ToggleLeft size={14} />} {p.is_active ? 'Active' : 'Tắt'}
                  </button>
                  <button onClick={() => updatePage(p.id, { auto_create_lead: !p.auto_create_lead })}
                    className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-1.5 cursor-pointer transition ${p.auto_create_lead ? 'bg-blue-50 text-blue-700 border border-blue-200' : 'bg-gray-100 text-gray-500 border border-gray-200'}`}>
                    <UserPlus size={14} /> {p.auto_create_lead
                      ? `Auto ${String(p.default_target_type || 'lead').toLowerCase() === 'deal' ? 'Deal' : 'Lead'}: BẬT`
                      : `Auto ${String(p.default_target_type || 'lead').toLowerCase() === 'deal' ? 'Deal' : 'Lead'}: TẮT`}
                  </button>
                  {p.auto_reply_message && <span className="text-xs px-3 py-1.5 rounded-lg bg-purple-50 text-purple-600 border border-purple-200">💬 "{p.auto_reply_message.substring(0, 25)}..."</span>}
                  {p.default_company_id
                    ? <span className="text-xs px-3 py-1.5 rounded-lg bg-orange-50 text-orange-700 border border-orange-200">🏢 {companies.find(c => c.id === p.default_company_id)?.short_name || companies.find(c => c.id === p.default_company_id)?.name || 'Công ty'}</span>
                    : <span className="text-xs px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 border border-amber-300" title="Page chưa gán công ty (default_company_id) → KHÔNG thuộc vòng auto của công ty nào. Hãy gán công ty để chạy auto theo công ty.">⚠️ Chưa gán công ty</span>}
                  {p.default_region_id && (() => {
                    const key = `${p.default_company_id || ''}::${String(p.default_module_key || '').trim().toLowerCase() || 'crm'}`;
                    const list = regionsByCompanyId[key] || [];
                    const reg = list.find((x) => String(x.id) === String(p.default_region_id));
                    return (
                      <span className="text-xs px-3 py-1.5 rounded-lg bg-teal-50 text-teal-800 border border-teal-200" title="Khu vực CRM gán cho lead từ Page">
                        📍 {reg?.name || 'Khu vực'}
                      </span>
                    );
                  })()}
                  {p.default_lead_type_id && (
                    <span className="text-xs px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">
                      🏷️ {String(p.default_module_key || '').toLowerCase() === 'crm' ? 'Phân loại CRM' : 'Phân loại xưởng'}
                    </span>
                  )}
                  {p.default_lead_owner_id && <span className="text-xs px-3 py-1.5 rounded-lg bg-indigo-50 text-indigo-700 border border-indigo-200">👤 {users.find(u => u.id === p.default_lead_owner_id)?.full_name || 'Người phụ trách'}</span>}
                </div>
                <FacebookPageTokenReminderRow page={p} onEdit={() => startEdit(p)} />
              </div>
            )}
          </div>
        ))}
      </div>

      {!showAdd ? (
        <button onClick={() => { setShowAdd(true); setForm({ ...emptyForm }); }}
          className="flex items-center gap-2 text-sm bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 cursor-pointer"><Plus size={16} /> Thêm Page</button>
      ) : (
        <div className="bg-white border rounded-xl p-5 shadow-sm space-y-3">
          <h3 className="font-bold text-sm">➕ Thêm Facebook Page</h3>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs text-gray-600 mb-1 block">Page ID *</label><input value={form.page_id} onChange={e => setForm({...form, page_id: e.target.value})} placeholder="479307381939218" className="w-full px-3 py-2 text-sm border rounded" /></div>
            <div><label className="text-xs text-gray-600 mb-1 block">Tên Page</label><input value={form.page_name} onChange={e => setForm({...form, page_name: e.target.value})} placeholder="Supermarket 3K1D" className="w-full px-3 py-2 text-sm border rounded" /></div>
          </div>
          <div><label className="text-xs text-gray-600 mb-1 block">Token *</label><textarea value={form.access_token} onChange={e => setForm({...form, access_token: e.target.value})} rows={2} className="w-full px-3 py-2 text-sm border rounded font-mono" placeholder="Paste token..." /></div>
          <div><label className="text-xs text-gray-600 mb-1 block">Tin nhắn tự động</label><input value={form.auto_reply_message} onChange={e => setForm({...form, auto_reply_message: e.target.value})} className="w-full px-3 py-2 text-sm border rounded" /></div>
          <CompanyStageSelectors />
          <div className="flex items-center gap-2 pt-1"><input type="checkbox" checked={form.auto_create_lead} onChange={e => setForm({...form, auto_create_lead: e.target.checked})} id="acl-new" className="cursor-pointer" /><label htmlFor="acl-new" className="text-sm">Tự động tạo {targetType === 'deal' ? 'Deal' : 'Lead'}</label></div>
          <div className="flex gap-2 pt-2">
            <button onClick={addPage} className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 cursor-pointer">Lưu</button>
            <button onClick={() => setShowAdd(false)} className="text-gray-500 text-sm cursor-pointer px-4 py-2">Hủy</button>
          </div>
        </div>
      )}

      {showImageSetsAdmin && <FacebookImageSetsSettings />}

      {pageDeleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !pageDeleteBusy && setPageDeleteTarget(null)}
        >
          <div
            className="bg-white rounded-xl shadow-2xl w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-5 border-b">
              <h3 className="text-lg font-bold text-red-700">Xóa Facebook Page?</h3>
              <p className="text-xs text-gray-500 mt-1">Hành động không thể hoàn tác</p>
            </div>
            <div className="p-5 space-y-3">
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-900">
                <p>
                  Bạn có chắc muốn xóa Page <strong>«{pageDeleteTarget.name}»</strong>
                  {pageDeleteTarget.page_id ? <> (ID: {pageDeleteTarget.page_id})</> : null}?
                </p>
                <ul className="mt-2 text-xs text-red-800 space-y-1 list-disc list-inside">
                  <li>Webhook và nhận tin mới từ Page này sẽ dừng</li>
                  <li>Cấu hình auto Lead/Deal của Page sẽ bị xóa</li>
                  <li>Danh bạ và tin nhắn cũ trên hệ thống vẫn giữ nguyên</li>
                </ul>
              </div>
            </div>
            <div className="p-5 border-t flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPageDeleteTarget(null)}
                disabled={pageDeleteBusy}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg cursor-pointer disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={confirmDeletePage}
                disabled={pageDeleteBusy}
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
              >
                <Trash2 size={14} />
                {pageDeleteBusy ? 'Đang xóa…' : 'Xóa Page'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
