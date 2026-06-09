import { Alert, Linking, NativeModules, Platform } from 'react-native';

type Overlay = {
  canDrawOverlays?: () => Promise<boolean>;
  openOverlaySettings?: () => void;
  startOverlay?: () => Promise<boolean>;
  stopOverlay?: () => Promise<boolean>;
  setBadgeCount?: (n: number) => void;
  showConvBubble?: (groupId: string, title: string, letter: string) => void;
  showConvBubbleWithAvatar?: (groupId: string, title: string, letter: string, avatarUrl: string) => void;
  showPeek?: (sender: string, message: string, bubbleKey: string | null) => void;
  pushIncomingMessage?: (
    bubbleKey: string,
    title: string,
    avatarLetter: string,
    avatarUrl: string,
    senderName: string,
    message: string,
  ) => void;
  consumePendingGroup?: () => Promise<string | null>;
  consumePendingChat?: () => Promise<{ groupId: string; title: string } | null>;
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

export async function ensureOverlayPermissionInteractive(opts?: {
  title?: string;
  message?: string;
}): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  if (await canDrawOverlays()) return true;
  return await new Promise<boolean>((resolve) => {
    Alert.alert(
      opts?.title ?? 'Cấp quyền bong bóng chat',
      opts?.message ??
        'App cần quyền "Hiển thị trên các ứng dụng khác" để hiện bong bóng chat khi bạn dùng app khác. Mở Cài đặt để bật?',
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

export async function startSystemBubbleOverlay(): Promise<boolean> {
  if (!isBubbleOverlaySupported() || !NM?.startOverlay) return false;
  try {
    return !!(await NM.startOverlay());
  } catch {
    return false;
  }
}

export async function stopSystemBubbleOverlay(): Promise<void> {
  if (!isBubbleOverlaySupported()) return;
  try {
    await NM?.stopOverlay?.();
  } catch {
    /* ignore */
  }
}

export function setBubbleBadge(n: number): void {
  if (!isBubbleOverlaySupported()) return;
  try {
    NM?.setBadgeCount?.(Math.max(0, Math.floor(n)));
  } catch {
    /* ignore */
  }
}

export function pushOverlayIncomingMessage(args: {
  groupId: string;
  title: string;
  letter?: string;
  senderName: string;
  message: string;
  avatarUrl?: string | null;
}): void {
  if (!isBubbleOverlaySupported()) return;
  const letter = (args.letter || args.title || '?').trim().slice(0, 1).toUpperCase();
  try {
    if (NM?.pushIncomingMessage) {
      NM.pushIncomingMessage(
        args.groupId,
        args.title,
        letter,
        args.avatarUrl || '',
        args.senderName,
        args.message,
      );
      return;
    }
    NM?.showConvBubble?.(args.groupId, args.title, letter);
    NM?.showPeek?.(args.senderName, args.message, args.groupId);
  } catch {
    /* ignore */
  }
}

export async function consumePendingBubbleGroup(): Promise<string | null> {
  if (!isBubbleOverlaySupported() || !NM?.consumePendingGroup) return null;
  try {
    const gid = await NM.consumePendingGroup();
    return gid && String(gid).trim() ? String(gid) : null;
  } catch {
    return null;
  }
}

export async function consumePendingBubbleChat(): Promise<{ groupId: string; title: string } | null> {
  if (!isBubbleOverlaySupported()) return null;
  try {
    if (NM?.consumePendingChat) {
      const row = await NM.consumePendingChat();
      if (row?.groupId) return { groupId: String(row.groupId), title: String(row.title || 'Tin nhắn') };
    }
    const gid = await consumePendingBubbleGroup();
    return gid ? { groupId: gid, title: 'Tin nhắn' } : null;
  } catch {
    return null;
  }
}
