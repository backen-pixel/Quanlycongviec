import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  AppState,
  type AppStateStatus,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  DeviceEventEmitter,
  NativeModules,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isChatNotification, useNotifications } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { navigationRef } from '../navigation/navigationRef';
import type { MoreStackParamList } from '../navigation/types';
import {
  CRM_MOBILE_PREFS_CHANGED,
  loadCrmMobilePrefs,
  saveCrmMobilePrefs,
  type CrmMobilePrefs,
} from '../lib/crmMobilePrefs';
import {
  FLOATING_BUBBLE_CLEAR_HIDDEN_EVENT,
  FLOATING_BUBBLE_HIDDEN_KEY,
  loadFloatingBubblePosition,
  saveFloatingBubblePosition,
  setFloatingBubbleHiddenByDrop,
} from '../lib/floatingChatBubbleStorage';
import type { AppNotification } from '../types/notifications';
import { getMessengerBubbleTarget } from '../lib/messengerBubbleTarget';

/** Viền xanh đặc trưng Zalo (flat, hiện đại) */
const ZALO_BLUE = '#0068FF';
const ZALO_BLUE_SOFT = '#E8F4FF';

const EDGE = 10;
/**
 * Kích thước bong bóng (dp) — match Messenger ChatHeads (~60dp) cho dễ thấy.
 * Compact dùng khi user thích nhỏ gọn (vẫn lớn hơn 48dp cũ).
 */
const BUBBLE_SIZE_DEFAULT = 60;
const BUBBLE_SIZE_COMPACT = 52;
/** Đường kính vùng thả (hình tròn giữa đáy màn hình) */
const DROP_TARGET_DIAM = 56;
const DROP_MARGIN_ABOVE_HOME = 10;
const PAN_MOVE_THRESHOLD = 8;
/** Giữ lâu giống Zalo/Messenger — mở menu lối tắt */
const LONG_PRESS_MS = 420;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function snapX(x: number, w: number, bubble: number) {
  const mid = w / 2;
  return x < mid ? EDGE : w - bubble - EDGE;
}

function displayName(u: { full_name?: string | null; fullName?: string | null; email?: string | null } | null) {
  if (!u) return 'Người dùng';
  const n = u.full_name || u.fullName || u.email || 'Người dùng';
  return String(n);
}

function UserAvatarRing({
  size,
  uri,
  name,
  compact,
}: {
  size: number;
  uri?: string | null;
  name: string;
  compact?: boolean;
}) {
  const inner = size - (compact ? 5 : 6);
  const initial = (name.trim()[0] || '?').toUpperCase();
  return (
    <View
      style={[
        styles.avatarRing,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: compact ? 2.5 : 3,
          overflow: 'hidden',
          alignItems: 'center',
          justifyContent: 'center',
        },
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{
            width: inner,
            height: inner,
            borderRadius: inner / 2,
          }}
          resizeMode="cover"
        />
      ) : (
        <View
          style={[
            styles.avatarFallback,
            { width: inner, height: inner, borderRadius: inner / 2 },
          ]}
        >
          <Text style={[styles.avatarInitial, { fontSize: size * 0.38 }]}>{initial}</Text>
        </View>
      )}
    </View>
  );
}

export default function FloatingChatBubble() {
  const { user } = useAuth();
  const { chatUnreadCount, toast, dismissToast, refreshUnread } = useNotifications();
  const insets = useSafeAreaInsets();
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [prefs, setPrefs] = useState<CrmMobilePrefs | null>(null);
  const [dropHidden, setDropHidden] = useState(false);
  const [dragging, setDragging] = useState(false);
  /** Android: có overlay hệ thống + đã cấp quyền → chỉ hiện bubble native, ẩn RN (tránh trùng hai bong bóng). */
  const [nativeOverlayActive, setNativeOverlayActive] = useState(false);
  const { width, height } = Dimensions.get('window');
  const compact = prefs?.floatingChatBubbleCompact ?? false;
  const bubbleSize = compact ? BUBBLE_SIZE_COMPACT : BUBBLE_SIZE_DEFAULT;
  const badge = Math.max(0, Number(chatUnreadCount) || 0);

  const xy = useRef(
    new Animated.ValueXY({ x: width - BUBBLE_SIZE_DEFAULT - EDGE, y: height * 0.62 }),
  ).current;
  const drag = useRef({ x: width - BUBBLE_SIZE_DEFAULT - EDGE, y: height * 0.62 }).current;
  /** Tránh onPress sau khi giữ lâu (một số máy vẫn fire press khi nhả tay) */
  const suppressTapAfterLongPressRef = useRef(false);
  const pressScale = useRef(new Animated.Value(1)).current;
  const badgePulse = useRef(new Animated.Value(1)).current;
  const dropRingPulse = useRef(new Animated.Value(1)).current;
  const peekOpacity = useRef(new Animated.Value(0)).current;
  const peekTranslateX = useRef(new Animated.Value(40)).current;
  const [peekToast, setPeekToast] = useState<{ title: string; message: string } | null>(null);

  const avatarUrl =
    user && typeof (user as { avatar_url?: string }).avatar_url === 'string'
      ? (user as { avatar_url?: string }).avatar_url
      : null;
  const name = displayName(user);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const h = await AsyncStorage.getItem(FLOATING_BUBBLE_HIDDEN_KEY);
      if (!cancelled && h === '1') setDropHidden(true);
      const p = await loadCrmMobilePrefs();
      if (!cancelled) setPrefs(p);
      if (cancelled || h === '1') return;
      const pos = await loadFloatingBubblePosition();
      if (!cancelled && pos) {
        const { width: w, height: hgt } = Dimensions.get('window');
        const bs = (p?.floatingChatBubbleCompact ?? false) ? BUBBLE_SIZE_COMPACT : BUBBLE_SIZE_DEFAULT;
        const nx = clamp(pos.x, EDGE, w - bs - EDGE);
        const ny = clamp(pos.y, EDGE + 60, hgt - bs - EDGE - 40);
        drag.x = nx;
        drag.y = ny;
        xy.setValue({ x: nx, y: ny });
      }
    })();
    const subPrefs = DeviceEventEmitter.addListener(CRM_MOBILE_PREFS_CHANGED, (p: CrmMobilePrefs) =>
      setPrefs(p),
    );
    const subClear = DeviceEventEmitter.addListener(FLOATING_BUBBLE_CLEAR_HIDDEN_EVENT, () =>
      setDropHidden(false),
    );
    return () => {
      cancelled = true;
      subPrefs.remove();
      subClear.remove();
    };
  }, []);

  const syncNativeOverlayFlag = () => {
    if (Platform.OS !== 'android' || !prefs?.floatingChatBubbleSystemOverlay) {
      setNativeOverlayActive(false);
      return;
    }
    const m = NativeModules.FloatingBubbleOverlay as { canDrawOverlays?: () => Promise<boolean> } | undefined;
    void m?.canDrawOverlays?.()?.then((ok) => setNativeOverlayActive(ok === true)).catch(() => setNativeOverlayActive(false));
  };

  useEffect(() => {
    syncNativeOverlayFlag();
  }, [prefs]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      if (s !== 'active') return;
      void refreshUnread();
      syncNativeOverlayFlag();
    });
    return () => sub.remove();
  }, [refreshUnread, prefs]);

  useEffect(() => {
    if (badge <= 0) {
      badgePulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(badgePulse, {
          toValue: 1.14,
          duration: 520,
          useNativeDriver: true,
        }),
        Animated.timing(badgePulse, {
          toValue: 1,
          duration: 520,
          useNativeDriver: true,
        }),
        Animated.delay(2400),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [badge, badgePulse]);

  useEffect(() => {
    if (!dragging) {
      dropRingPulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dropRingPulse, {
          toValue: 1.1,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(dropRingPulse, {
          toValue: 1,
          duration: 650,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [dragging, dropRingPulse]);

  // Peek: hiện sender + message khi có chat notification và bubble đang hiển thị
  useEffect(() => {
    if (toast && isChatNotification(toast)) {
      const meta = toast.metadata && typeof toast.metadata === 'object'
        ? (toast.metadata as Record<string, unknown>)
        : {};
      const sender = typeof meta.sender_name === 'string'
        ? meta.sender_name
        : (typeof meta.sender === 'string' ? meta.sender : toast.title);
      setPeekToast({ title: sender, message: toast.message ?? '' });
      peekTranslateX.setValue(40);
      Animated.parallel([
        Animated.timing(peekOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(peekTranslateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(peekOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(peekTranslateX, { toValue: 32, duration: 180, useNativeDriver: true }),
      ]).start(() => setPeekToast(null));
    }
  }, [toast?.id, toast?.type, peekOpacity, peekTranslateX]);

  useEffect(() => {
    if (!quickMenuOpen) suppressTapAfterLongPressRef.current = false;
  }, [quickMenuOpen]);

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      const nx = clamp(drag.x, EDGE, window.width - bubbleSize - EDGE);
      const ny = clamp(drag.y, EDGE + 60, window.height - bubbleSize - EDGE - 40);
      drag.x = nx;
      drag.y = ny;
      xy.setValue({ x: nx, y: ny });
    });
    return () => sub?.remove?.();
  }, [drag, xy, bubbleSize]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        // Cho phép tap vào TouchableOpacity mở Modal; chỉ bắt cử chỉ khi đã kéo đủ xa
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, g) =>
          Math.abs(g.dx) + Math.abs(g.dy) > PAN_MOVE_THRESHOLD,
        onPanResponderGrant: () => {
          setDragging(true);
          xy.setOffset({ x: drag.x, y: drag.y });
          xy.setValue({ x: 0, y: 0 });
        },
        onPanResponderMove: Animated.event([null, { dx: xy.x, dy: xy.y }], { useNativeDriver: false }),
        onPanResponderRelease: (_e, g) => {
          setDragging(false);
          xy.flattenOffset();
          const nxRaw = drag.x + g.dx;
          const nyRaw = drag.y + g.dy;
          const nx = snapX(clamp(nxRaw, EDGE, width - bubbleSize - EDGE), width, bubbleSize);
          const ny = clamp(nyRaw, EDGE + 60, height - bubbleSize - EDGE - 40);

          const bubbleCx = nx + bubbleSize / 2;
          const bubbleCy = ny + bubbleSize / 2;
          const targetCx = width / 2;
          const targetCy =
            height - insets.bottom - DROP_MARGIN_ABOVE_HOME - DROP_TARGET_DIAM / 2;
          const hideReach = DROP_TARGET_DIAM / 2 + bubbleSize / 2 + 8;
          const dist = Math.hypot(bubbleCx - targetCx, bubbleCy - targetCy);
          if (dist <= hideReach) {
            void setFloatingBubbleHiddenByDrop();
            setDropHidden(true);
            drag.x = nx;
            drag.y = ny;
            Animated.spring(xy, { toValue: { x: nx, y: ny }, useNativeDriver: false, friction: 8 }).start();
            return;
          }

          drag.x = nx;
          drag.y = ny;
          void saveFloatingBubblePosition(nx, ny);
          Animated.spring(xy, { toValue: { x: nx, y: ny }, useNativeDriver: false, friction: 8 }).start();
        },
      }),
    [drag, xy, width, height, bubbleSize, insets.bottom],
  );

  const bubbleEnabled = prefs?.floatingChatBubbleEnabled ?? true;
  const onlyWhenUnread = prefs?.floatingChatBubbleOnlyWhenUnread ?? false;
  const hideRnBecauseNativeOverlay =
    Platform.OS === 'android' && !!prefs?.floatingChatBubbleSystemOverlay && nativeOverlayActive;
  const showBubble =
    !!user &&
    bubbleEnabled &&
    !dropHidden &&
    !(onlyWhenUnread && badge === 0) &&
    !hideRnBecauseNativeOverlay;

  const avatarDiameter = Math.max(30, bubbleSize - 12);

  if (!showBubble) return null;

  function navigateMoreTab<S extends keyof MoreStackParamList>(
    screen: S,
    params?: MoreStackParamList[S],
  ) {
    setQuickMenuOpen(false);
    if (!navigationRef.isReady()) return;
    if (params !== undefined) {
      navigationRef.navigate('Main', {
        screen: 'MoreTab',
        params: { screen, params } as never,
      });
    } else {
      navigationRef.navigate('Main', {
        screen: 'MoreTab',
        params: { screen } as never,
      });
    }
  }

  function openLeadChatFromToast(n: AppNotification & { entity_id: string }) {
    setQuickMenuOpen(false);
    dismissToast();
    if (!navigationRef.isReady()) return;
    navigationRef.navigate('Main', {
      screen: 'CrmTab',
      params: { screen: 'LeadDetail', params: { id: n.entity_id, openLeadChat: true } },
    });
  }

  const toastMessengerShortcut =
    toast?.type === 'messenger_chat' &&
    toast.entity_type === 'messenger_group' &&
    toast.entity_id;

  const toastLeadShortcut =
    toast?.type === 'lead_chat' &&
    toast.entity_id &&
    (toast.entity_type === 'lead' || toast.entity_type === 'crm_lead');

  function openMessengerFromToast() {
    setQuickMenuOpen(false);
    dismissToast();
    if (!navigationRef.isReady() || !toast?.entity_id) return;
    const meta = toast.metadata && typeof toast.metadata === 'object' ? toast.metadata : {};
    const gn = typeof (meta as { group_name?: unknown }).group_name === 'string' ? (meta as { group_name: string }).group_name : undefined;
    navigationRef.navigate('Main', {
      screen: 'MoreTab',
      params: {
        screen: 'MessengerGroupChat',
        params: { groupId: toast.entity_id!, title: gn },
      },
    });
  }

  const dropAnchorBottom = DROP_MARGIN_ABOVE_HOME + insets.bottom;
  const menuMaxH = Math.min(Math.round(height * 0.5), 460);

  function hideBubbleLikeZalo() {
    setQuickMenuOpen(false);
    void setFloatingBubbleHiddenByDrop();
    setDropHidden(true);
  }

  return (
    <>
      {dragging ? (
        <>
          <View pointerEvents="none" style={[styles.dragStrip, { height: 72 + insets.bottom }]} />
          <View pointerEvents="none" style={[styles.dropAnchor, { bottom: dropAnchorBottom }]}>
            <Text style={styles.dropHintTiny}>Thả vào đây để ẩn</Text>
            <Text style={styles.dropSubTiny}>Giống Zalo — ẩn tạm · Hiện lại: Tài khoản → Hiện lại bong bóng chat</Text>
            <Animated.View style={{ transform: [{ scale: dropRingPulse }] }}>
              <View style={[styles.dropCircle, { width: DROP_TARGET_DIAM, height: DROP_TARGET_DIAM }]}>
                <Ionicons name="close-circle-outline" size={26} color={CrmColors.red700} />
              </View>
            </Animated.View>
          </View>
        </>
      ) : null}

      {/* Peek: hiện sender + message gần bong bóng khi có tin nhắn mới */}
      {peekToast ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.peekWrap,
            {
              opacity: peekOpacity,
              transform: [
                ...xy.getTranslateTransform(),
                { translateX: peekTranslateX },
              ],
            },
          ]}
        >
          <View style={styles.peekCard}>
            <Text style={styles.peekSender} numberOfLines={1}>{peekToast.title}</Text>
            <Text style={styles.peekMsg} numberOfLines={2}>{peekToast.message}</Text>
          </View>
        </Animated.View>
      ) : null}

      <Animated.View
        {...responder.panHandlers}
        style={[
          styles.wrap,
          styles.bubbleElev,
          {
            transform: xy.getTranslateTransform(),
          },
        ]}
      >
        <Animated.View style={{ transform: [{ scale: pressScale }] }}>
          <TouchableOpacity
            activeOpacity={1}
            delayLongPress={LONG_PRESS_MS}
            onPressIn={() => {
              Animated.spring(pressScale, {
                toValue: 0.92,
                friction: 7,
                useNativeDriver: true,
              }).start();
            }}
            onPressOut={() => {
              Animated.spring(pressScale, {
                toValue: 1,
                friction: 6,
                useNativeDriver: true,
              }).start();
            }}
            onPress={() => {
              if (suppressTapAfterLongPressRef.current) {
                suppressTapAfterLongPressRef.current = false;
                return;
              }
              void (async () => {
                const t = await getMessengerBubbleTarget();
                if (!navigationRef.isReady()) return;
                if (t?.groupId) {
                  navigationRef.navigate('Main', {
                    screen: 'MoreTab',
                    params: {
                      screen: 'MessengerGroupChat',
                      params: { groupId: t.groupId, title: t.title },
                    },
                  });
                } else {
                  navigateMoreTab('MessengerGroupList');
                }
              })();
            }}
            onLongPress={() => {
              suppressTapAfterLongPressRef.current = true;
              setQuickMenuOpen(true);
            }}
            accessibilityLabel="Messenger CRM — chạm mở tin nhắn, giữ để menu (như Zalo)"
          >
            <View style={[styles.bubbleOuter, { width: bubbleSize, height: bubbleSize, borderRadius: bubbleSize / 2 }]}>
              <UserAvatarRing size={avatarDiameter} uri={avatarUrl} name={name} compact />
              {badge > 0 ? (
                <Animated.View
                  pointerEvents="none"
                  style={[styles.badgeWrap, { transform: [{ scale: badgePulse }] }]}
                >
                  <View style={styles.badge}>
                    <Text style={styles.badgeTxt}>{badge > 99 ? '99+' : String(badge)}</Text>
                  </View>
                </Animated.View>
              ) : null}
            </View>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>

      <Modal
        visible={quickMenuOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setQuickMenuOpen(false)}
      >
        <View style={styles.menuRoot}>
          <Pressable style={styles.menuBackdropFill} onPress={() => setQuickMenuOpen(false)} />
          <View style={[styles.menuSheet, { paddingBottom: Math.max(insets.bottom, 14), maxHeight: menuMaxH }]}>
            <View style={styles.menuGrab} />
            <Text style={styles.menuTitle}>Messenger CRM</Text>
            <Text style={styles.menuSub}>
              {badge > 0 ? `${badge} tin chưa đọc · ` : ''}
              Chạm = danh sách chat · Giữ = menu · Kéo = dính mép / ẩn đáy (giống Zalo)
            </Text>

            {toastMessengerShortcut ? (
              <TouchableOpacity style={styles.menuRow} onPress={() => openMessengerFromToast()}>
                <Ionicons name="chatbubbles-outline" size={22} color={ZALO_BLUE} />
                <View style={styles.menuRowBody}>
                  <Text style={styles.menuRowTxt}>Messenger — tin mới</Text>
                  <Text style={styles.menuRowHint} numberOfLines={2}>
                    {toast.title}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={CrmColors.gray400} />
              </TouchableOpacity>
            ) : null}

            {toastLeadShortcut ? (
              <TouchableOpacity
                style={styles.menuRow}
                onPress={() => openLeadChatFromToast(toast as AppNotification & { entity_id: string })}
              >
                <Ionicons name="chatbubble-ellipses-outline" size={22} color={ZALO_BLUE} />
                <View style={styles.menuRowBody}>
                  <Text style={styles.menuRowTxt}>Tin trong Lead</Text>
                  <Text style={styles.menuRowHint} numberOfLines={2}>
                    {toast.title}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={CrmColors.gray400} />
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity style={styles.menuRow} onPress={() => navigateMoreTab('MessengerGroupList')}>
              <Ionicons name="chatbubbles-outline" size={22} color={ZALO_BLUE} />
              <Text style={styles.menuRowTxt}>Danh sách nhóm & tin nhắn</Text>
              <Ionicons name="chevron-forward" size={18} color={CrmColors.gray400} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => navigateMoreTab('MessengerCompose', { mode: 'direct' })}
            >
              <Ionicons name="person-outline" size={22} color={ZALO_BLUE} />
              <Text style={styles.menuRowTxt}>Chat 1–1</Text>
              <Ionicons name="chevron-forward" size={18} color={CrmColors.gray400} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => navigateMoreTab('MessengerCompose', { mode: 'group' })}
            >
              <Ionicons name="people-outline" size={22} color={ZALO_BLUE} />
              <Text style={styles.menuRowTxt}>Tạo nhóm</Text>
              <Ionicons name="chevron-forward" size={18} color={CrmColors.gray400} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => {
                if (!prefs) return;
                void saveCrmMobilePrefs({
                  ...prefs,
                  floatingChatBubbleCompact: !prefs.floatingChatBubbleCompact,
                });
                setQuickMenuOpen(false);
              }}
            >
              <Ionicons
                name={compact ? 'expand-outline' : 'contract-outline'}
                size={22}
                color={ZALO_BLUE}
              />
              <View style={styles.menuRowBody}>
                <Text style={styles.menuRowTxt}>
                  {compact ? 'Bong bóng lớn (56dp)' : 'Chế độ thu gọn (48dp)'}
                </Text>
                <Text style={styles.menuRowHint}>
                  {compact ? 'Trở về kích thước chuẩn Messenger/Zalo' : 'Thu nhỏ bong bóng như Zalo'}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={CrmColors.gray400} />
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuRowDanger} onPress={() => hideBubbleLikeZalo()}>
              <Ionicons name="eye-off-outline" size={22} color={CrmColors.red700} />
              <View style={styles.menuRowBody}>
                <Text style={styles.menuRowTxtDanger}>Đóng bong bóng này</Text>
                <Text style={styles.menuRowHint}>Tương đương kéo xuống vùng đỏ đáy màn hình</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuCancelBtn} onPress={() => setQuickMenuOpen(false)}>
              <Text style={styles.menuCancelTxt}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  dropAnchor: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9998,
  },
  dropCircle: {
    borderRadius: 999,
    backgroundColor: 'rgba(239,68,68,0.14)',
    borderWidth: 2,
    borderColor: 'rgba(239,68,68,0.42)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  dropHintTiny: { marginBottom: 4, fontSize: 11, fontWeight: '800', color: CrmColors.red700 },
  dropSubTiny: {
    fontSize: 9,
    color: CrmColors.gray600,
    marginBottom: 8,
    textAlign: 'center',
    paddingHorizontal: 12,
  },
  /** Vùng đỏ nhạt đáy khi kéo — gợi ý «thả để đóng» như Zalo */
  dragStrip: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(239,68,68,0.11)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(239,68,68,0.25)',
    zIndex: 9997,
  },
  wrap: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 9999,
  },
  bubbleElev: {
    shadowColor: '#0068FF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 10,
  },
  bubbleOuter: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CrmColors.white,
    borderRadius: 999,
    padding: 3,
  },
  avatarRing: {
    borderColor: ZALO_BLUE,
    borderStyle: 'solid',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: CrmColors.white,
  },
  avatarFallback: {
    backgroundColor: ZALO_BLUE_SOFT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontWeight: '800',
    color: ZALO_BLUE,
  },
  badgeWrap: {
    position: 'absolute',
    right: -2,
    top: -2,
  },
  badge: {
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 999,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: CrmColors.white,
  },
  badgeTxt: { color: CrmColors.white, fontSize: 9, fontWeight: '900' },
  menuRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'transparent',
  },
  menuBackdropFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(15,23,42,0.45)',
  },
  menuSheet: {
    backgroundColor: CrmColors.white,
    borderTopLeftRadius: CrmRadii.lg + 6,
    borderTopRightRadius: CrmRadii.lg + 6,
    paddingHorizontal: 8,
    paddingTop: 6,
    ...CrmShadow.card,
  },
  menuGrab: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: CrmColors.gray200,
    marginBottom: 12,
  },
  menuTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: CrmColors.gray900,
    paddingHorizontal: 10,
  },
  menuSub: {
    fontSize: 12,
    color: CrmColors.gray500,
    marginTop: 4,
    marginBottom: 12,
    paddingHorizontal: 10,
    lineHeight: 17,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.gray50,
    marginBottom: 8,
  },
  menuRowBody: { flex: 1, minWidth: 0 },
  menuRowTxt: { fontSize: 15, fontWeight: '700', color: CrmColors.gray900 },
  menuRowHint: { fontSize: 12, color: CrmColors.gray500, marginTop: 2 },
  menuRowDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: CrmRadii.md,
    backgroundColor: 'rgba(239,68,68,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.25)',
    marginBottom: 8,
  },
  menuRowTxtDanger: { fontSize: 15, fontWeight: '800', color: CrmColors.red700 },
  menuCancelBtn: {
    alignItems: 'center',
    paddingVertical: 14,
    marginTop: 4,
    marginBottom: 4,
  },
  menuCancelTxt: { fontSize: 16, fontWeight: '700', color: CrmColors.gray600 },
  peekWrap: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 9998,
    transform: [{ translateX: -180 }, { translateY: -8 }],
  },
  peekCard: {
    backgroundColor: 'rgba(0,104,255,0.92)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    maxWidth: 180,
    marginRight: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 8,
  },
  peekSender: { color: CrmColors.white, fontSize: 12, fontWeight: '800', marginBottom: 2 },
  peekMsg: { color: 'rgba(255,255,255,0.9)', fontSize: 11, lineHeight: 15 },
});
