import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useMessenger } from '../context/MessengerContext';
import { useNotifications } from '../context/NotificationContext';
import { useTheme } from '../context/ThemeContext';
import {
  FLOATING_BUBBLE_CLEAR_HIDDEN_EVENT,
  FLOATING_BUBBLE_HIDDEN_KEY,
  loadFloatingBubblePosition,
  saveFloatingBubblePosition,
  setFloatingBubbleHiddenByDrop,
} from '../lib/floatingChatBubbleStorage';
import { avatarColorFromName, initialsFromName } from '../lib/messengerTheme';
import { canDrawOverlays, isBubbleOverlaySupported } from '../lib/floatingBubbleOverlay';
import {
  navigationRef,
  openChatFromBubble,
  openMessagesFromBubble,
} from '../navigation/navigationRef';

const ACCENT = '#6C5CE7';
const EDGE = 10;
const BUBBLE_SIZE = 58;
const DROP_TARGET_DIAM = 56;
const DROP_MARGIN_ABOVE_HOME = 10;
const PAN_MOVE_THRESHOLD = 8;
const LONG_PRESS_MS = 420;

const HIDE_ON_ROUTES = new Set(['ChatDetail', 'Messages']);

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function snapX(x: number, w: number, bubble: number) {
  const mid = w / 2;
  return x < mid ? EDGE : w - bubble - EDGE;
}

function getCurrentRouteName(): string | undefined {
  try {
    return navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined;
  } catch {
    return undefined;
  }
}

export default function FloatingChatBubble() {
  const { user, token } = useAuth();
  const { colors } = useTheme();
  const { threads } = useMessenger();
  const { messengerToast, dismissMessengerToast } = useNotifications();
  const insets = useSafeAreaInsets();
  const [dropHidden, setDropHidden] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [quickMenuOpen, setQuickMenuOpen] = useState(false);
  const [currentRoute, setCurrentRoute] = useState<string | undefined>(getCurrentRouteName);
  const [nativeOverlayActive, setNativeOverlayActive] = useState(false);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const { width, height } = Dimensions.get('window');

  const xy = useRef(new Animated.ValueXY({ x: width - BUBBLE_SIZE - EDGE, y: height * 0.62 })).current;
  const drag = useRef({ x: width - BUBBLE_SIZE - EDGE, y: height * 0.62 }).current;
  const suppressTapRef = useRef(false);
  const pressScale = useRef(new Animated.Value(1)).current;
  const dropRingPulse = useRef(new Animated.Value(1)).current;
  const peekOpacity = useRef(new Animated.Value(0)).current;
  const peekTranslateX = useRef(new Animated.Value(40)).current;

  const toastThread = messengerToast
    ? threads.find((t) => t.id === messengerToast.groupId)
    : undefined;
  const bubbleIsGroup = messengerToast?.isGroup ?? toastThread?.isGroup;
  const bubbleDisplayName = bubbleIsGroup
    ? (messengerToast?.title || toastThread?.name || 'Nhóm')
    : (messengerToast?.senderName || toastThread?.name || 'Chat');
  const bubbleAvatarUrl = messengerToast?.avatarUrl || toastThread?.avatarUrl || null;
  const avatarColor = avatarColorFromName(bubbleDisplayName);
  const bubbleOnRight = drag.x + BUBBLE_SIZE / 2 >= width / 2;

  useEffect(() => {
    const syncNative = () => {
      if (!isBubbleOverlaySupported()) {
        setNativeOverlayActive(false);
        return;
      }
      void canDrawOverlays().then((ok) => setNativeOverlayActive(ok));
    };
    syncNative();
    const sub = AppState.addEventListener('change', (s: AppStateStatus) => {
      setAppActive(s === 'active');
      if (s === 'active') syncNative();
    });
    return () => sub.remove();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const h = await AsyncStorage.getItem(FLOATING_BUBBLE_HIDDEN_KEY);
      if (!cancelled && h === '1') setDropHidden(true);
      if (cancelled || h === '1') return;
      const pos = await loadFloatingBubblePosition();
      if (!cancelled && pos) {
        const { width: w, height: hgt } = Dimensions.get('window');
        const nx = clamp(pos.x, EDGE, w - BUBBLE_SIZE - EDGE);
        const ny = clamp(pos.y, EDGE + 60, hgt - BUBBLE_SIZE - EDGE - 40);
        drag.x = nx;
        drag.y = ny;
        xy.setValue({ x: nx, y: ny });
      }
    })();
    const sub = DeviceEventEmitter.addListener(FLOATING_BUBBLE_CLEAR_HIDDEN_EVENT, () => setDropHidden(false));
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [xy]);

  useEffect(() => {
    if (!navigationRef.isReady()) return undefined;
    const update = () => setCurrentRoute(getCurrentRouteName());
    update();
    const unsub = navigationRef.addListener('state', update);
    return () => {
      try {
        unsub();
      } catch {
        /* ignore */
      }
    };
  }, []);

  useEffect(() => {
    if (!dragging) {
      dropRingPulse.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(dropRingPulse, { toValue: 1.08, duration: 650, useNativeDriver: true }),
        Animated.timing(dropRingPulse, { toValue: 1, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [dragging, dropRingPulse]);

  useEffect(() => {
    if (messengerToast) {
      peekTranslateX.setValue(40);
      Animated.parallel([
        Animated.timing(peekOpacity, { toValue: 1, duration: 220, useNativeDriver: true }),
        Animated.spring(peekTranslateX, { toValue: 0, useNativeDriver: true, friction: 8 }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(peekOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
        Animated.timing(peekTranslateX, { toValue: 32, duration: 180, useNativeDriver: true }),
      ]).start();
    }
  }, [messengerToast?.groupId, messengerToast?.message, peekOpacity, peekTranslateX]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => false,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) + Math.abs(g.dy) > PAN_MOVE_THRESHOLD,
        onMoveShouldSetPanResponderCapture: (_e, g) => Math.abs(g.dx) + Math.abs(g.dy) > PAN_MOVE_THRESHOLD,
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
          const bubbleCyRaw = nyRaw + BUBBLE_SIZE / 2;
          const dropStripTop = height - (96 + insets.bottom);
          const droppedInStrip = bubbleCyRaw >= dropStripTop;
          const targetCx = width / 2;
          const targetCy = height - insets.bottom - DROP_MARGIN_ABOVE_HOME - DROP_TARGET_DIAM / 2;
          const hideReach = DROP_TARGET_DIAM / 2 + BUBBLE_SIZE / 2 + 32;
          const distToCircle = Math.hypot(nxRaw + BUBBLE_SIZE / 2 - targetCx, bubbleCyRaw - targetCy);
          const shouldHide = droppedInStrip || distToCircle <= hideReach;

          const nx = snapX(clamp(nxRaw, EDGE, width - BUBBLE_SIZE - EDGE), width, BUBBLE_SIZE);
          const ny = clamp(nyRaw, EDGE + 60, height - BUBBLE_SIZE - EDGE - 40);

          if (shouldHide) {
            void setFloatingBubbleHiddenByDrop();
            dismissMessengerToast();
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
    [drag, xy, width, height, insets.bottom, dismissMessengerToast],
  );

  const onChatScreen = !!currentRoute && HIDE_ON_ROUTES.has(currentRoute);
  const hideRnBecauseNativeOverlay =
    Platform.OS === 'android' && nativeOverlayActive && !appActive;
  const showBubble =
    !!token && !!user && !!messengerToast && !dropHidden && !onChatScreen && !hideRnBecauseNativeOverlay;

  if (!showBubble) return null;

  function openLatestChat() {
    if (!messengerToast?.groupId) return;
    dismissMessengerToast();
    openChatFromBubble(messengerToast.groupId, messengerToast.title);
  }

  return (
    <>
      {dragging ? (
        <>
          <View pointerEvents="none" style={[styles.dragStrip, { height: 72 + insets.bottom }]} />
          <View pointerEvents="none" style={[styles.dropAnchor, { bottom: DROP_MARGIN_ABOVE_HOME + insets.bottom }]}>
            <Text style={styles.dropHint}>Thả vào đây để ẩn</Text>
            <Animated.View style={{ transform: [{ scale: dropRingPulse }] }}>
              <View style={[styles.dropCircle, { width: DROP_TARGET_DIAM, height: DROP_TARGET_DIAM }]}>
                <Ionicons name="close-circle-outline" size={26} color={colors.danger} />
              </View>
            </Animated.View>
          </View>
        </>
      ) : null}

      {messengerToast ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.peekWrap,
            bubbleOnRight ? styles.peekLeft : styles.peekRight,
            {
              opacity: peekOpacity,
              transform: [
                ...xy.getTranslateTransform(),
                { translateX: bubbleOnRight ? peekTranslateX : Animated.multiply(peekTranslateX, -1) },
              ],
            },
          ]}
        >
          <View style={styles.peekCard}>
            <Text style={styles.peekSender} numberOfLines={1}>
              {bubbleIsGroup ? `${messengerToast.senderName} · ${messengerToast.title}` : messengerToast.senderName}
            </Text>
            <Text style={styles.peekMsg} numberOfLines={2}>
              {messengerToast.message}
            </Text>
          </View>
        </Animated.View>
      ) : null}

      <Animated.View {...responder.panHandlers} style={[styles.wrap, { transform: xy.getTranslateTransform() }]}>
        <Animated.View style={{ transform: [{ scale: pressScale }] }}>
          <TouchableOpacity
            activeOpacity={1}
            delayLongPress={LONG_PRESS_MS}
            onPressIn={() => {
              Animated.spring(pressScale, { toValue: 0.92, friction: 7, useNativeDriver: true }).start();
            }}
            onPressOut={() => {
              Animated.spring(pressScale, { toValue: 1, friction: 6, useNativeDriver: true }).start();
            }}
            onPress={() => {
              if (suppressTapRef.current) {
                suppressTapRef.current = false;
                return;
              }
              openLatestChat();
            }}
            onLongPress={() => {
              suppressTapRef.current = true;
              setQuickMenuOpen(true);
            }}
            accessibilityLabel="Bong bóng chat — chạm mở tin nhắn, giữ để menu"
          >
            <View style={[styles.bubbleOuter, { width: BUBBLE_SIZE, height: BUBBLE_SIZE, borderRadius: BUBBLE_SIZE / 2 }]}>
              {bubbleAvatarUrl ? (
                <Image
                  source={{ uri: bubbleAvatarUrl }}
                  style={[styles.avatarImg, { width: BUBBLE_SIZE - 6, height: BUBBLE_SIZE - 6, borderRadius: (BUBBLE_SIZE - 6) / 2 }]}
                />
              ) : (
                <View style={[styles.avatar, { backgroundColor: avatarColor, width: BUBBLE_SIZE - 6, height: BUBBLE_SIZE - 6, borderRadius: (BUBBLE_SIZE - 6) / 2 }]}>
                  <Text style={styles.avatarText}>{initialsFromName(bubbleDisplayName)}</Text>
                </View>
              )}
            </View>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>

      <Modal visible={quickMenuOpen} transparent animationType="slide" onRequestClose={() => setQuickMenuOpen(false)}>
        <View style={styles.menuRoot}>
          <Pressable style={styles.menuBackdrop} onPress={() => setQuickMenuOpen(false)} />
          <View style={[styles.menuSheet, { paddingBottom: Math.max(insets.bottom, 14), backgroundColor: colors.card }]}>
            <View style={[styles.menuGrab, { backgroundColor: colors.border }]} />
            <Text style={[styles.menuTitle, { color: colors.text }]}>Tin nhắn</Text>
            <Text style={[styles.menuSub, { color: colors.textMuted }]}>
              Chạm bong bóng = mở hội thoại · Kéo xuống đáy để ẩn
            </Text>

            {messengerToast ? (
              <TouchableOpacity
                style={[styles.menuRow, { backgroundColor: colors.bgElevated }]}
                onPress={() => {
                  setQuickMenuOpen(false);
                  openChatFromBubble(messengerToast.groupId, messengerToast.title);
                  dismissMessengerToast();
                }}
              >
                <Ionicons name="chatbubbles-outline" size={22} color={ACCENT} />
                <View style={styles.menuRowBody}>
                  <Text style={[styles.menuRowTxt, { color: colors.text }]}>Tin mới</Text>
                  <Text style={[styles.menuRowHint, { color: colors.textMuted }]} numberOfLines={2}>
                    {messengerToast.senderName}: {messengerToast.message}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
              </TouchableOpacity>
            ) : null}

            <TouchableOpacity
              style={[styles.menuRow, { backgroundColor: colors.bgElevated }]}
              onPress={() => {
                setQuickMenuOpen(false);
                openMessagesFromBubble();
              }}
            >
              <Ionicons name="chatbubbles-outline" size={22} color={ACCENT} />
              <Text style={[styles.menuRowTxt, { color: colors.text, flex: 1 }]}>Danh sách tin nhắn</Text>
              <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.menuRowDanger, { backgroundColor: 'rgba(239,68,68,0.08)', borderColor: 'rgba(239,68,68,0.25)' }]}
              onPress={() => {
                setQuickMenuOpen(false);
                void setFloatingBubbleHiddenByDrop();
                setDropHidden(true);
              }}
            >
              <Ionicons name="eye-off-outline" size={22} color={colors.danger} />
              <Text style={[styles.menuRowTxtDanger, { color: colors.danger }]}>Ẩn bong bóng</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.menuCancelBtn} onPress={() => setQuickMenuOpen(false)}>
              <Text style={[styles.menuCancelTxt, { color: colors.textMuted }]}>Đóng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, top: 0, zIndex: 9999, elevation: 12 },
  bubbleOuter: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
    elevation: 10,
  },
  avatar: { alignItems: 'center', justifyContent: 'center' },
  avatarImg: { backgroundColor: '#E2E8F0' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 16 },
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
  dropAnchor: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 9998 },
  dropCircle: {
    borderRadius: 999,
    backgroundColor: 'rgba(239,68,68,0.14)',
    borderWidth: 2,
    borderColor: 'rgba(239,68,68,0.42)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropHint: { marginBottom: 8, fontSize: 11, fontWeight: '800', color: '#DC2626' },
  peekWrap: { position: 'absolute', left: 0, top: 0, zIndex: 9998 },
  peekLeft: { transform: [{ translateX: -188 }, { translateY: -6 }] },
  peekRight: { transform: [{ translateX: BUBBLE_SIZE + 8 }, { translateY: -6 }] },
  peekCard: {
    backgroundColor: 'rgba(108,92,231,0.94)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    maxWidth: 180,
    marginRight: 6,
    elevation: 8,
  },
  peekSender: { color: '#fff', fontSize: 12, fontWeight: '800', marginBottom: 2 },
  peekMsg: { color: 'rgba(255,255,255,0.92)', fontSize: 11, lineHeight: 15 },
  menuRoot: { flex: 1, justifyContent: 'flex-end' },
  menuBackdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(15,23,42,0.45)' },
  menuSheet: { borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingHorizontal: 8, paddingTop: 6 },
  menuGrab: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, marginBottom: 12 },
  menuTitle: { fontSize: 17, fontWeight: '800', paddingHorizontal: 10 },
  menuSub: { fontSize: 12, marginTop: 4, marginBottom: 12, paddingHorizontal: 10, lineHeight: 17 },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 8,
  },
  menuRowBody: { flex: 1, minWidth: 0 },
  menuRowTxt: { fontSize: 15, fontWeight: '700' },
  menuRowHint: { fontSize: 12, marginTop: 2 },
  menuRowDanger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  menuRowTxtDanger: { fontSize: 15, fontWeight: '800', flex: 1 },
  menuCancelBtn: { alignItems: 'center', paddingVertical: 14, marginBottom: 4 },
  menuCancelTxt: { fontSize: 16, fontWeight: '700' },
});
