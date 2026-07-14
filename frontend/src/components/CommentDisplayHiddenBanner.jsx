import { useEffect, useState } from 'react';
import { Bell, MessageSquareOff } from 'lucide-react';
import {
  isCommentShowOnScreenEnabled,
  subscribeNotificationPrefsChanged,
} from '../lib/notificationPrefsCache';

/** Hook: theo dõi comment_show_on_screen (re-render khi Cài đặt thông báo đổi). */
export function useCommentShowOnScreenEnabled() {
  const [enabled, setEnabled] = useState(() => isCommentShowOnScreenEnabled());
  useEffect(() => {
    setEnabled(isCommentShowOnScreenEnabled());
    return subscribeNotificationPrefsChanged(() => {
      setEnabled(isCommentShowOnScreenEnabled());
    });
  }, []);
  return enabled;
}

/**
 * Banner khi user tắt «Hiện bình luận trên màn hình».
 * Bình luận vẫn tồn tại và vẫn vào chuông thông báo (nếu kênh comment_added bật).
 */
export default function CommentDisplayHiddenBanner({ className = '' }) {
  return (
    <div
      className={`rounded-xl border border-amber-200 bg-amber-50 px-4 py-6 text-center ${className}`}
      role="status"
    >
      <MessageSquareOff className="h-8 w-8 text-amber-500 mx-auto mb-2" />
      <p className="text-sm font-semibold text-amber-900">
        Không hiện bình luận trên màn hình
      </p>
      <p className="text-xs text-amber-800/90 mt-1.5 max-w-md mx-auto leading-relaxed">
        Bình luận vẫn lưu và vẫn vào chuông Thông báo (nếu bật «Nhận thông báo bình luận»).
        Admin bật lại trong Cài đặt thông báo → mục đầu trang «Ai được hiện bình luận trên màn hình?».
      </p>
      <p className="text-[11px] text-amber-700/80 mt-3 inline-flex items-center gap-1 justify-center">
        <Bell className="h-3.5 w-3.5" />
        Mở chuông thông báo để xem nội dung bình luận
      </p>
    </div>
  );
}

/** Nếu tắt pref → render banner; nếu bật → render children. */
export function CommentDisplayGate({ children, className = '' }) {
  const show = useCommentShowOnScreenEnabled();
  if (!show) return <CommentDisplayHiddenBanner className={className} />;
  return children;
}
