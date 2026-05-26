import { Link } from 'react-router-dom';
import { Megaphone, Share2, Calendar, MessageSquare, Trash2 } from 'lucide-react';
import { useUnreadBadges } from '../context/UnreadBadgesContext';

/**
 * Thanh nút truy cập nhanh các chức năng chung (Bảng tin, Có gì mới, Sự kiện,
 * Tin nhắn, Thùng rác) — dùng ở header dashboard SX/VC.
 *
 * Props:
 * - trashTab: 'sx' | 'vc' | 'crm' — quyết định link Thùng rác mở đúng tab.
 * - showTrash: ẩn/hiện nút Thùng rác (mặc định true).
 * - className: class thêm cho wrapper.
 */
export default function ModuleQuickActions({
  trashTab = 'crm',
  showTrash = true,
  showLabels = false,
  className = '',
}) {
  const badges = useUnreadBadges();

  const ITEMS = [
    {
      to: '/social',
      icon: Share2,
      label: 'Bảng tin',
      title: 'Bảng tin nội bộ',
      badge: badges.social,
      color: 'text-sky-700',
      hover: 'hover:bg-sky-50 border-sky-200',
    },
    {
      to: '/updates',
      icon: Megaphone,
      label: 'Có gì mới',
      title: 'Có gì mới?',
      badge: badges.updates,
      color: 'text-emerald-700',
      hover: 'hover:bg-emerald-50 border-emerald-200',
    },
    {
      to: '/crm/events',
      icon: Calendar,
      label: 'Sự kiện',
      title: 'Sự kiện công ty',
      color: 'text-amber-700',
      hover: 'hover:bg-amber-50 border-amber-200',
    },
    {
      to: '/messenger-hub',
      icon: MessageSquare,
      label: 'Tin nhắn',
      title: 'Tin nhắn / Hội nhóm',
      color: 'text-violet-700',
      hover: 'hover:bg-violet-50 border-violet-200',
    },
  ];

  return (
    <div className={`flex items-center gap-1.5 flex-wrap ${className}`} aria-label="Chức năng chung">
      {ITEMS.map((it) => {
        const Icon = it.icon;
        const badge = Number(it.badge || 0);
        return (
          <Link
            key={it.to}
            to={it.to}
            title={it.title}
            className={`relative h-9 px-2.5 inline-flex items-center gap-1.5 rounded-lg border bg-white text-sm font-medium border-gray-200 text-gray-700 ${it.hover} transition-colors`}
          >
            <Icon className={`h-4 w-4 ${it.color}`} />
            {showLabels && <span className="hidden lg:inline">{it.label}</span>}
            {badge > 0 && (
              <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center shadow ring-2 ring-white">
                {badge > 99 ? '99+' : badge}
              </span>
            )}
          </Link>
        );
      })}
      {showTrash && (
        <Link
          to={{ pathname: '/admin/trash', search: trashTab && trashTab !== 'crm' ? `?tab=${trashTab}` : '' }}
          title="Thùng rác"
          className="h-9 px-2.5 inline-flex items-center gap-1.5 rounded-lg border bg-white text-sm font-medium border-rose-200 text-rose-700 hover:bg-rose-50 transition-colors"
        >
          <Trash2 className="h-4 w-4" />
          {showLabels && <span className="hidden lg:inline">Thùng rác</span>}
        </Link>
      )}
    </div>
  );
}
