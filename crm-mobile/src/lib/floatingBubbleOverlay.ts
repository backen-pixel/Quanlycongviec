import { Alert, Linking, NativeModules, Platform } from 'react-native';

/**
 * Helper gói NativeModules.FloatingBubbleOverlay — chỉ những method "lõi"
 * dùng cho luồng "Thu nhỏ thành bong bóng" + cấp quyền. Module native
 * (Kotlin) còn nhiều stub khác (xem `SystemBubbleSync.tsx`) nhưng chỉ
 * 1 cửa chính được expose ra ngoài qua file này.
 */
type Overlay = {
  canDrawOverlays?: () => Promise<boolean>;
  openOverlaySettings?: () => void;
  showConvBubble?: (groupId: string, title: string, letter: string) => void;
  showConvBubbleWithAvatar?: (
    groupId: string,
    title: string,
    letter: string,
    avatarUrl: string,
  ) => void;
  hideConvBubble?: (groupId: string) => void;
  stopOverlay?: () => Promise<boolean>;
  setBadgeCount?: (n: number) => void;
  minimizeApp?: () => void;
};

const NM = NativeModules.FloatingBubbleOverlay as Overlay | undefined;

export function isBubbleOverlaySupported(): boolean {
  return Platform.OS === 'android' && !!NM;
}

export async function canDrawOverlays(): Promise<boolean> {
  if (!isBubbleOverlaySupported() || !NM?.canDrawOverlays) return false;
  try {
    return !!(await NM.canDrawOverlays());
  } catch {
    return false;
  }
}

export function openOverlaySettings(): void {
  if (Platform.OS !== 'android') return;
  try {
    if (NM?.openOverlaySettings) {
      NM.openOverlaySettings();
      return;
    }
  } catch {
    /* fallthrough */
  }
  void Linking.openSettings();
}

/**
 * Bảo đảm có quyền vẽ overlay; nếu chưa → hỏi user mở Cài đặt.
 * Trả về true nếu đã có quyền, false nếu user huỷ hoặc cần thao tác sau.
 */
export async function ensureOverlayPermissionInteractive(opts?: {
  title?: string;
  message?: string;
}): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (await canDrawOverlays()) return true;
  return await new Promise<boolean>((resolve) => {
    Alert.alert(
      opts?.title ?? 'Cấp quyền hiện bong bóng',
      opts?.message ??
        'TuBep CRM cần quyền "Hiển thị trên các ứng dụng khác" để hiện bong bóng chat nổi trên màn hình. Mở Cài đặt để bật ngay?',
      [
        { text: 'Để sau', style: 'cancel', onPress: () => resolve(false) },
        {
          text: 'Mở Cài đặt',
          onPress: () => {
            openOverlaySettings();
            resolve(false);
          },
        },
      ],
    );
  });
}

export function showBubbleForConversation(args: {
  groupId: string;
  title: string;
  letter?: string;
  avatarUrl?: string | null;
}): void {
  if (!isBubbleOverlaySupported()) return;
  const letter = (args.letter || args.title || '?').trim().slice(0, 1).toUpperCase();
  try {
    if (args.avatarUrl && NM?.showConvBubbleWithAvatar) {
      NM.showConvBubbleWithAvatar(args.groupId, args.title, letter, args.avatarUrl);
    } else {
      NM?.showConvBubble?.(args.groupId, args.title, letter);
    }
  } catch {
    /* ignore */
  }
}

export function hideBubbleForConversation(groupId: string): void {
  if (!isBubbleOverlaySupported()) return;
  try { NM?.hideConvBubble?.(groupId); } catch { /* ignore */ }
}

export function stopBubble(): void {
  if (!isBubbleOverlaySupported()) return;
  try { void NM?.stopOverlay?.(); } catch { /* ignore */ }
}

export function setBubbleBadge(n: number): void {
  if (!isBubbleOverlaySupported()) return;
  try { NM?.setBadgeCount?.(Math.max(0, Math.floor(n))); } catch { /* ignore */ }
}

export function minimizeApp(): void {
  if (!isBubbleOverlaySupported()) return;
  try { NM?.minimizeApp?.(); } catch { /* ignore */ }
}
