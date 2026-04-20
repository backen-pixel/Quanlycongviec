import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  DeviceEventEmitter,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Ionicons from '@expo/vector-icons/Ionicons';
import { isChatNotification, useNotifications } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { navigationRef } from '../navigation/navigationRef';
import {
  CRM_MOBILE_PREFS_CHANGED,
  loadCrmMobilePrefs,
  type CrmMobilePrefs,
} from '../lib/crmMobilePrefs';
import {
  FLOATING_BUBBLE_CLEAR_HIDDEN_EVENT,
  FLOATING_BUBBLE_HIDDEN_KEY,
  setFloatingBubbleHiddenByDrop,
} from '../lib/floatingChatBubbleStorage';

/** Viền xanh đặc trưng Zalo (flat, hiện đại) */
const ZALO_BLUE = '#0068FF';
const ZALO_BLUE_SOFT = '#E8F4FF';
const ZALO_BLUE_MUTED = '#B8DCFF';

const EDGE = 10;
const DROP_ZONE_H = 92;

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
  const { chatUnreadCount, toast, dismissToast } = useNotifications();
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState<CrmMobilePrefs | null>(null);
  const [dropHidden, setDropHidden] = useState(false);
  const [dragging, setDragging] = useState(false);

  const { width, height } = Dimensions.get('window');
  const sheetH = Math.round(height * 0.7);
  const compact = prefs?.floatingChatBubbleCompact ?? false;
  const bubbleSize = compact ? 48 : 58;

  const xy = useRef(
    new Animated.ValueXY({ x: width - 58 - EDGE, y: height * 0.62 }),
  ).current;
  const drag = useRef({ x: width - 58 - EDGE, y: height * 0.62 }).current;

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
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) + Math.abs(g.dy) > 2,
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

          const zoneTop = height - DROP_ZONE_H;
          const cx = nx + bubbleSize / 2;
          const cy = ny + bubbleSize / 2;
          if (cy >= zoneTop && cx >= width * 0.12 && cx <= width * 0.88) {
            void setFloatingBubbleHiddenByDrop();
            setDropHidden(true);
            drag.x = nx;
            drag.y = ny;
            Animated.spring(xy, { toValue: { x: nx, y: ny }, useNativeDriver: false, friction: 8 }).start();
            return;
          }

          drag.x = nx;
          drag.y = ny;
          Animated.spring(xy, { toValue: { x: nx, y: ny }, useNativeDriver: false, friction: 8 }).start();
        },
      }),
    [drag, xy, width, height, bubbleSize],
  );

  const badge = Math.max(0, Number(chatUnreadCount) || 0);

  const bubbleEnabled = prefs?.floatingChatBubbleEnabled ?? true;
  const onlyWhenUnread = prefs?.floatingChatBubbleOnlyWhenUnread ?? false;
  const showBubble = !!user && bubbleEnabled && !dropHidden && !(onlyWhenUnread && badge === 0);

  if (!showBubble) return null;

  const go = (screen: string, params?: Record<string, unknown>) => {
    setOpen(false);
    // @ts-expect-error navigationRef type narrowing
    navigationRef.current?.navigate(screen, params);
  };

  const goInputBar = () => go('MessengerGroupList');

  return (
    <>
      {dragging ? (
        <View pointerEvents="none" style={[styles.dropZone, { height: DROP_ZONE_H }]}>
          <Text style={styles.dropTxt}>Thả vào đây để ẩn bong bóng</Text>
          <Text style={styles.dropSub}>Mở Tài khoản → «Hiện lại bong bóng chat»</Text>
        </View>
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
        <TouchableOpacity
          activeOpacity={0.92}
          onPress={() => setOpen(true)}
          accessibilityLabel="Chat nhanh CRM"
        >
          <View style={[styles.bubbleOuter, { width: bubbleSize, height: bubbleSize }]}>
            <UserAvatarRing size={Math.max(36, bubbleSize - 8)} uri={avatarUrl} name={name} compact />
            {badge > 0 ? (
              <View style={styles.badge}>
                <Text style={styles.badgeTxt}>{badge > 99 ? '99+' : String(badge)}</Text>
              </View>
            ) : null}
          </View>
        </TouchableOpacity>
      </Animated.View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View style={[styles.sheet, { height: sheetH }]} onStartShouldSetResponder={() => true}>
            {/* Header */}
            <View style={styles.headerRow}>
              <View style={styles.headerLeft}>
                <UserAvatarRing size={40} uri={avatarUrl} name={name} />
                <View style={styles.headerTextCol}>
                  <Text style={styles.headerName} numberOfLines={1}>
                    {name}
                  </Text>
                  <Text style={styles.headerSub}>
                    {badge > 0 ? `${badge} tin chat chưa đọc · ` : ''}Messenger nội bộ
                  </Text>
                </View>
                {badge > 0 ? (
                  <View style={styles.headerBadge}>
                    <Text style={styles.headerBadgeTxt}>{badge > 99 ? '99+' : String(badge)}</Text>
                  </View>
                ) : null}
              </View>
              <TouchableOpacity
                style={styles.minBtn}
                onPress={() => setOpen(false)}
                accessibilityLabel="Thu nhỏ"
              >
                <Ionicons name="chevron-down-circle" size={28} color={ZALO_BLUE} />
              </TouchableOpacity>
            </View>

            {/* Khung chat dạng bong bóng */}
            <ScrollView
              style={styles.chatScroll}
              contentContainerStyle={styles.chatContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              nestedScrollEnabled
            >
              <View style={[styles.bubbleLeft, styles.bubbleBase]}>
                <Text style={styles.bubbleLeftTxt}>
                  Chọn kênh bên dưới để mở chat đầy đủ. Bong bóng chỉ là lối tắt — soạn tin trên màn hình chat.
                </Text>
              </View>
              {toast && isChatNotification(toast) ? (
                <View style={[styles.bubbleLeft, styles.bubbleBase, styles.bubbleToast]}>
                  <Text style={styles.toastTag}>Tin chat</Text>
                  <Text style={styles.bubbleLeftTxt}>
                    <Text style={styles.toastTitle}>{toast.title}</Text>
                    {'\n'}
                    {toast.message}
                  </Text>
                  <TouchableOpacity onPress={() => dismissToast()}>
                    <Text style={styles.dismissLink}>Ẩn</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
              <View style={[styles.bubbleRight, styles.bubbleBase]}>
                <Text style={styles.bubbleRightTxt}>Sẵn sàng trả lời khách trên CRM 👍</Text>
              </View>
            </ScrollView>

            {/* Thanh nhập + icon (mở chat đầy đủ — tránh bàn phím che trong overlay) */}
            <View style={styles.inputBar}>
              <TouchableOpacity style={styles.iconBtn} onPress={() => go('MessengerGroupList')} accessibilityLabel="Sticker">
                <Ionicons name="happy-outline" size={24} color={ZALO_BLUE} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.iconBtn} onPress={() => go('MessengerGroupList')} accessibilityLabel="Hình ảnh">
                <Ionicons name="image-outline" size={24} color={ZALO_BLUE} />
              </TouchableOpacity>
              <Pressable style={styles.fakeInput} onPress={goInputBar}>
                <Text style={styles.fakeInputPh}>Nhập tin nhắn…</Text>
              </Pressable>
            </View>

            <View style={styles.quickRow}>
              <TouchableOpacity style={styles.quickChip} onPress={() => go('MessengerGroupList')}>
                <Ionicons name="chatbubbles-outline" size={18} color={ZALO_BLUE} />
                <Text style={styles.quickChipTxt}>Danh sách nhóm</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickChip} onPress={() => go('MessengerCompose', { mode: 'direct' })}>
                <Ionicons name="person-outline" size={18} color={ZALO_BLUE} />
                <Text style={styles.quickChipTxt}>Chat 1–1</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.quickChip} onPress={() => go('MessengerCompose', { mode: 'group' })}>
                <Ionicons name="people-outline" size={18} color={ZALO_BLUE} />
                <Text style={styles.quickChipTxt}>Tạo nhóm</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  dropZone: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(239,68,68,0.12)',
    borderTopWidth: 2,
    borderTopColor: 'rgba(239,68,68,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 9998,
    paddingHorizontal: 16,
  },
  dropTxt: { fontSize: 14, fontWeight: '800', color: CrmColors.red700 },
  dropSub: { fontSize: 11, color: CrmColors.gray600, marginTop: 4, textAlign: 'center' },
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
  badge: {
    position: 'absolute',
    right: -2,
    top: -2,
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
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.4)',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  sheet: {
    width: '100%',
    alignSelf: 'center',
    flexDirection: 'column',
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg + 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: CrmColors.gray100,
    ...CrmShadow.card,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: CrmColors.gray100,
    backgroundColor: CrmColors.white,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 },
  headerTextCol: { marginLeft: 10, flex: 1, minWidth: 0 },
  headerName: { fontSize: 16, fontWeight: '800', color: CrmColors.gray900 },
  headerSub: { fontSize: 11, color: CrmColors.gray500, marginTop: 2 },
  headerBadge: {
    marginLeft: 6,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 6,
    borderRadius: 11,
    backgroundColor: '#FF3B30',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadgeTxt: { color: CrmColors.white, fontSize: 11, fontWeight: '900' },
  minBtn: { padding: 4 },
  chatScroll: { flex: 1, minHeight: 80 },
  chatContent: { paddingHorizontal: 14, paddingVertical: 12, gap: 10, flexGrow: 1 },
  bubbleBase: {
    maxWidth: '88%',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 16,
  },
  bubbleLeft: {
    alignSelf: 'flex-start',
    backgroundColor: CrmColors.gray100,
    borderBottomLeftRadius: 4,
  },
  bubbleLeftTxt: { fontSize: 14, color: CrmColors.gray800, lineHeight: 20 },
  bubbleToast: { backgroundColor: ZALO_BLUE_SOFT, borderWidth: 1, borderColor: ZALO_BLUE_MUTED },
  toastTag: {
    fontSize: 10,
    fontWeight: '800',
    color: ZALO_BLUE,
    marginBottom: 4,
  },
  toastTitle: { fontWeight: '800', color: CrmColors.gray900 },
  dismissLink: { marginTop: 8, fontSize: 12, color: ZALO_BLUE, fontWeight: '700' },
  bubbleRight: {
    alignSelf: 'flex-end',
    backgroundColor: ZALO_BLUE_SOFT,
    borderBottomRightRadius: 4,
    borderWidth: 1,
    borderColor: ZALO_BLUE_MUTED,
  },
  bubbleRightTxt: { fontSize: 14, color: CrmColors.gray900, lineHeight: 20 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: CrmColors.gray100,
    backgroundColor: CrmColors.gray50,
    gap: 6,
  },
  iconBtn: { padding: 6 },
  fakeInput: {
    flex: 1,
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.full,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    paddingVertical: 10,
    paddingHorizontal: 14,
    minHeight: 40,
    justifyContent: 'center',
  },
  fakeInputPh: { fontSize: 14, color: CrmColors.gray400 },
  quickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 14,
    paddingTop: 4,
    backgroundColor: CrmColors.white,
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.gray50,
    borderWidth: 1,
    borderColor: CrmColors.gray100,
  },
  quickChipTxt: { fontSize: 13, fontWeight: '700', color: CrmColors.gray800 },
});
