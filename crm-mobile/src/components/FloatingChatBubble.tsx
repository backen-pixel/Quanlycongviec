import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNotifications } from '../context/NotificationContext';
import { useAuth } from '../context/AuthContext';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { navigationRef } from '../navigation/navigationRef';

const BUBBLE = 56;
const EDGE = 10;

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function snapX(x: number, w: number) {
  const mid = w / 2;
  return x < mid ? EDGE : w - BUBBLE - EDGE;
}

export default function FloatingChatBubble() {
  const { user } = useAuth();
  const { unreadCount } = useNotifications();
  const [open, setOpen] = useState(false);

  const { width, height } = Dimensions.get('window');
  const xy = useRef(new Animated.ValueXY({ x: width - BUBBLE - EDGE, y: height * 0.62 })).current;
  const drag = useRef({ x: width - BUBBLE - EDGE, y: height * 0.62 }).current;

  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ window }) => {
      const nx = clamp(drag.x, EDGE, window.width - BUBBLE - EDGE);
      const ny = clamp(drag.y, EDGE + 60, window.height - BUBBLE - EDGE - 40);
      drag.x = nx;
      drag.y = ny;
      xy.setValue({ x: nx, y: ny });
    });
    // @ts-expect-error RN compatibility
    return () => sub?.remove?.();
  }, [drag, xy]);

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) + Math.abs(g.dy) > 2,
        onPanResponderGrant: () => {
          xy.setOffset({ x: drag.x, y: drag.y });
          xy.setValue({ x: 0, y: 0 });
        },
        onPanResponderMove: Animated.event([null, { dx: xy.x, dy: xy.y }], { useNativeDriver: false }),
        onPanResponderRelease: (_e, g) => {
          xy.flattenOffset();
          const nxRaw = drag.x + g.dx;
          const nyRaw = drag.y + g.dy;
          const nx = snapX(clamp(nxRaw, EDGE, width - BUBBLE - EDGE), width);
          const ny = clamp(nyRaw, EDGE + 60, height - BUBBLE - EDGE - 40);
          drag.x = nx;
          drag.y = ny;
          Animated.spring(xy, { toValue: { x: nx, y: ny }, useNativeDriver: false, friction: 8 }).start();
        },
      }),
    [drag, xy, width, height],
  );

  const badge = Math.max(0, Number(unreadCount) || 0);

  // Không hiện khi chưa đăng nhập (tránh đè màn hình Login)
  if (!user) return null;

  const go = (name: string, params?: any) => {
    setOpen(false);
    // @ts-expect-error navigationRef type narrowing
    navigationRef.current?.navigate(name, params);
  };

  return (
    <>
      <Animated.View
        {...responder.panHandlers}
        style={[
          styles.wrap,
          CrmShadow.card,
          {
            transform: xy.getTranslateTransform(),
          },
        ]}
      >
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={() => setOpen(true)}
          style={styles.bubble}
          accessibilityLabel="Chat nhanh"
        >
          <Text style={styles.icon}>💬</Text>
          {badge > 0 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeTxt}>{badge > 99 ? '99+' : String(badge)}</Text>
            </View>
          ) : null}
        </TouchableOpacity>
      </Animated.View>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={[styles.sheet, CrmShadow.card]} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Chat nhanh</Text>
            <Text style={styles.sheetSub}>Mở nhanh nhóm chat nội bộ (Messenger)</Text>

            <TouchableOpacity style={styles.action} onPress={() => go('MessengerGroupList')}>
              <Text style={styles.actionTxt}>📋 Danh sách chat nhóm</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.action} onPress={() => go('MessengerCompose', { mode: 'direct' })}>
              <Text style={styles.actionTxt}>👤 Chat 1–1</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.action} onPress={() => go('MessengerCompose', { mode: 'group' })}>
              <Text style={styles.actionTxt}>👥 Tạo nhóm chat</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.close} onPress={() => setOpen(false)}>
              <Text style={styles.closeTxt}>Đóng</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    top: 0,
    zIndex: 9999,
  },
  bubble: {
    width: BUBBLE,
    height: BUBBLE,
    borderRadius: BUBBLE / 2,
    backgroundColor: CrmColors.blue600,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  icon: { fontSize: 22, color: 'white' },
  badge: {
    position: 'absolute',
    right: -4,
    top: -4,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 5,
    borderRadius: 999,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: CrmColors.white,
  },
  badgeTxt: { color: 'white', fontSize: 10, fontWeight: '900' },
  backdrop: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'center', padding: 18 },
  sheet: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.card,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 14,
  },
  sheetTitle: { fontSize: 16, fontWeight: '900', color: CrmColors.gray900 },
  sheetSub: { marginTop: 4, fontSize: 12, color: CrmColors.gray500, marginBottom: 12, lineHeight: 16 },
  action: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.gray50,
    borderWidth: 1,
    borderColor: CrmColors.gray100,
    marginBottom: 10,
  },
  actionTxt: { fontSize: 14, fontWeight: '800', color: CrmColors.gray800 },
  close: {
    marginTop: 2,
    paddingVertical: 12,
    borderRadius: CrmRadii.md,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    backgroundColor: CrmColors.white,
  },
  closeTxt: { fontSize: 14, fontWeight: '800', color: CrmColors.gray700 },
});

