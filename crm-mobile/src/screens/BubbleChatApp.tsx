/**
 * BubbleChatApp — root JS cho [BubbleChatActivity]
 *
 * Mục tiêu UX (giống Messenger Chat Heads):
 *  - Cửa sổ chat NỔI (không cover toàn màn)
 *  - Hở viền trên + dưới → thấy launcher phía sau (Activity dùng theme trong suốt
 *    + windowCloseOnTouchOutside=true)
 *  - Hàng avatar nhỏ phía trên: các conversation đang trong stack overlay,
 *    tap để chuyển nhanh giữa các cuộc trò chuyện
 *  - Tap vào nền mờ → đóng cửa sổ (do system tự bắn touch-outside)
 *  - Vuốt nút Back hoặc nhấn "×" → đóng + để bubble tiếp tục nổi
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  DeviceEventEmitter,
  Image,
  NativeModules,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { NotificationProvider } from '../context/NotificationContext';
import MessengerGroupChatScreen from './MessengerGroupChatScreen';
import { parseBubbleStorageKey } from '../lib/bubbleNativeEvents';
import { CrmColors } from '../theme/crmTheme';

const Stack = createNativeStackNavigator();

type BubbleStackEntry = {
  key: string;
  title: string;
  letter: string;
  avatarUrl: string;
};

type FloatingModule = {
  consumePendingGroup?: () => Promise<string | null>;
  getBubbleStack?: () => Promise<BubbleStackEntry[]>;
  finishCurrentActivity?: () => void;
  removeBubble?: (key: string) => void;
};

const Overlay: FloatingModule | undefined = NativeModules.FloatingBubbleOverlay;

function MiniBubbleAvatar({
  entry,
  active,
  onPress,
}: {
  entry: BubbleStackEntry;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.85} style={styles.miniBubbleWrap}>
      <View
        style={[
          styles.miniBubble,
          active && styles.miniBubbleActive,
        ]}
      >
        {entry.avatarUrl ? (
          <Image source={{ uri: entry.avatarUrl }} style={styles.miniBubbleImg} />
        ) : (
          <Text style={styles.miniBubbleLetter}>{entry.letter || '?'}</Text>
        )}
      </View>
      <Text numberOfLines={1} style={styles.miniBubbleLabel}>
        {entry.title}
      </Text>
    </TouchableOpacity>
  );
}

function BubbleChatInner() {
  const { token, loading } = useAuth();
  const insets = useSafeAreaInsets();
  const [groupId, setGroupId] = useState<string>('');
  const [bubbleKey, setBubbleKey] = useState<string>('');
  const [stack, setStack] = useState<BubbleStackEntry[]>([]);
  const [ready, setReady] = useState(false);

  const refreshStack = useCallback(async () => {
    try {
      const list = (await Overlay?.getBubbleStack?.()) ?? [];
      setStack(Array.isArray(list) ? list : []);
    } catch {
      setStack([]);
    }
  }, []);

  const applyKey = useCallback((rawKey: string) => {
    if (!rawKey) return;
    const parsed = parseBubbleStorageKey(rawKey);
    if (parsed.kind === 'messenger') {
      setBubbleKey(rawKey);
      setGroupId(parsed.entityId);
    }
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'android') {
      setReady(true);
      return;
    }
    Overlay?.consumePendingGroup?.()
      .then((gid) => {
        if (gid) applyKey(gid);
      })
      .catch(() => {})
      .finally(() => {
        void refreshStack();
        setReady(true);
      });

    const subSwitch = DeviceEventEmitter.addListener('BubbleChatSwitchGroup', (k: string) => {
      applyKey(k);
      void refreshStack();
    });
    return () => subSwitch.remove();
  }, [applyKey, refreshStack]);

  const closeWindow = useCallback(() => {
    Overlay?.finishCurrentActivity?.();
  }, []);

  const switchTo = useCallback(
    (entry: BubbleStackEntry) => {
      applyKey(entry.key);
      void refreshStack();
    },
    [applyKey, refreshStack],
  );

  const dismissBubble = useCallback(
    (entry: BubbleStackEntry) => {
      Overlay?.removeBubble?.(entry.key);
      const next = stack.filter((x) => x.key !== entry.key);
      setStack(next);
      if (entry.key === bubbleKey) {
        const fallback = next[0];
        if (fallback) {
          applyKey(fallback.key);
        } else {
          closeWindow();
        }
      }
    },
    [stack, bubbleKey, applyKey, closeWindow],
  );

  const headerPad = useMemo(() => Math.max(insets.top, 16), [insets.top]);
  const bottomPad = useMemo(() => Math.max(insets.bottom, 12), [insets.bottom]);

  if (!ready || loading) {
    return (
      <View style={styles.loader}>
        <ActivityIndicator size="large" color={CrmColors.blue600} />
      </View>
    );
  }

  if (!token || !groupId) {
    return (
      <Pressable style={styles.scrim} onPress={closeWindow}>
        <View style={[styles.card, { marginTop: headerPad + 60, marginBottom: bottomPad + 40 }]}>
          <View style={styles.loader}>
            <ActivityIndicator size="large" color={CrmColors.blue600} />
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <View style={styles.scrim}>
      {/* Top: hàng bubble nhỏ + nút đóng */}
      <Pressable style={{ height: headerPad }} onPress={closeWindow} />
      <View style={styles.topBar}>
        <View style={styles.miniRow}>
          {stack.map((e) => (
            <MiniBubbleAvatar
              key={e.key}
              entry={e}
              active={e.key === bubbleKey}
              onPress={() => switchTo(e)}
            />
          ))}
        </View>
        <TouchableOpacity
          style={styles.closeBtn}
          activeOpacity={0.85}
          onPress={closeWindow}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="close" size={20} color="#fff" />
        </TouchableOpacity>
      </View>

      {/* Card chat (bo góc, không cover toàn màn) */}
      <View style={[styles.card, { marginBottom: bottomPad + 16 }]}>
        <NavigationContainer>
          <Stack.Navigator screenOptions={{ headerShown: false, animation: 'none' }}>
            <Stack.Screen name="BubbleChatMain">
              {() => (
                <MessengerGroupChatScreen
                  key={groupId}
                  overrideGroupId={groupId}
                  overrideFromBubble
                />
              )}
            </Stack.Screen>
          </Stack.Navigator>
        </NavigationContainer>
      </View>

      {/* Đáy: vùng tap để đóng (để lộ launcher) */}
      <Pressable
        style={{ height: bottomPad + 4 }}
        onPress={closeWindow}
      />

      {/* Nút xóa nhanh bubble đang xem */}
      {bubbleKey ? (
        <TouchableOpacity
          style={[styles.kickBtn, { bottom: bottomPad + 24 }]}
          onPress={() => {
            const cur = stack.find((x) => x.key === bubbleKey);
            if (cur) dismissBubble(cur);
          }}
          activeOpacity={0.85}
        >
          <Ionicons name="trash-outline" size={16} color="#fff" />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export default function BubbleChatApp() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <NotificationProvider>
          <BubbleChatInner />
        </NotificationProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  topBar: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  miniRow: {
    flexDirection: 'row',
    flex: 1,
    flexWrap: 'wrap',
  },
  miniBubbleWrap: {
    width: 56,
    alignItems: 'center',
    marginRight: 6,
  },
  miniBubble: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#0068FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.85)',
    overflow: 'hidden',
  },
  miniBubbleActive: {
    borderColor: '#FFD400',
    borderWidth: 3,
  },
  miniBubbleImg: {
    width: '100%',
    height: '100%',
  },
  miniBubbleLetter: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 18,
  },
  miniBubbleLabel: {
    color: '#fff',
    fontSize: 10,
    marginTop: 2,
    maxWidth: 56,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  card: {
    flex: 1,
    marginHorizontal: 8,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: CrmColors.pageBg,
    elevation: 16,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
  },
  loader: {
    flex: 1,
    backgroundColor: CrmColors.pageBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  kickBtn: {
    position: 'absolute',
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(220,38,38,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
  },
});
