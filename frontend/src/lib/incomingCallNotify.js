/**
 * Thông báo cuộc gọi đến — hiển thị ngoài tab (OS notification) + nhấp nháy tiêu đề.
 * Web không thể vẽ overlay lên app khác (Teams native); đây là cách chuẩn trên trình duyệt.
 */

let activeNotification = null;
let titleFlashTimer = null;
let savedDocumentTitle = '';

function stopTitleFlash() {
  if (titleFlashTimer) {
    clearInterval(titleFlashTimer);
    titleFlashTimer = null;
  }
  if (typeof document !== 'undefined' && savedDocumentTitle) {
    document.title = savedDocumentTitle;
  }
}

function startTitleFlash(label) {
  if (typeof document === 'undefined') return;
  stopTitleFlash();
  savedDocumentTitle = document.title;
  let on = true;
  titleFlashTimer = setInterval(() => {
    document.title = on ? `📞 ${label}` : savedDocumentTitle;
    on = !on;
  }, 900);
}

/** Đóng notification + dừng flash (khi accept/reject/end). */
export function dismissIncomingCallDesktopAlert() {
  stopTitleFlash();
  if (activeNotification) {
    try {
      activeNotification.close();
    } catch {
      /* ignore */
    }
    activeNotification = null;
  }
}

/**
 * Bật cảnh báo desktop khi có cuộc gọi đến.
 * Luôn gọi khi incoming — kể cả tab đang focus (user có thể đang xem trang khác trong SPA).
 */
export function showIncomingCallDesktopAlert({
  callId,
  fromName,
  kind = 'audio',
  isGroup = false,
  groupName = '',
}) {
  if (typeof window === 'undefined') return;

  dismissIncomingCallDesktopAlert();

  const isVideo = kind === 'video';
  const shortKind = isVideo ? ' video' : '';
  const title = isGroup ? `Cuộc gọi nhóm${shortKind}` : `Cuộc gọi${shortKind} đến`;
  const body = isGroup
    ? `${fromName || 'Ai đó'} đang gọi nhóm «${groupName || 'Messenger'}»`
    : `${fromName || 'Ai đó'} đang gọi bạn`;

  startTitleFlash(title);

  if (typeof Notification !== 'undefined') {
    const show = () => {
      try {
        const n = new Notification(title, {
          body: `${body}\n\nBấm để mở ứng dụng và trả lời.`,
          tag: callId ? `incoming-call-${callId}` : 'incoming-call',
          requireInteraction: true,
          silent: true,
        });
        n.onclick = () => {
          try {
            window.focus();
          } catch {
            /* ignore */
          }
          try {
            n.close();
          } catch {
            /* ignore */
          }
        };
        activeNotification = n;
      } catch {
        /* ignore */
      }
    };

    if (Notification.permission === 'granted') {
      show();
    } else if (Notification.permission === 'default') {
      void Notification.requestPermission().then((p) => {
        if (p === 'granted') show();
      });
    }
  }

  if (document.hidden) {
    try {
      window.focus();
    } catch {
      /* trình duyệt có thể chặn nếu user chưa tương tác */
    }
  }
}
