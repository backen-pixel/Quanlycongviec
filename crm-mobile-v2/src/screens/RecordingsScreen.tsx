import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect } from '@react-navigation/native';
import { Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Chip from '../components/Chip';
import { formatApiError } from '../api/client';
import { fetchRecordings, type RecordingItem } from '../api/recordings';
import { Colors, Radii } from '../theme';

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function PlayerBar({ rec }: { rec: RecordingItem }) {
  const [playing, setPlaying] = useState(false);
  const [posMs, setPosMs] = useState(0);
  const [durMs, setDurMs] = useState(rec.durationSec * 1000);
  const anim = useRef(new Animated.Value(0)).current;
  const soundRef = useRef<Audio.Sound | null>(null);

  useEffect(() => {
    return () => {
      void soundRef.current?.unloadAsync();
      soundRef.current = null;
    };
  }, []);

  const toggle = async () => {
    if (!rec.playUrl) return;
    if (playing) {
      await soundRef.current?.pauseAsync();
      setPlaying(false);
      return;
    }
    try {
      if (!soundRef.current) {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        const { sound } = await Audio.Sound.createAsync({ uri: rec.playUrl });
        soundRef.current = sound;
        sound.setOnPlaybackStatusUpdate((st) => {
          if (!st.isLoaded) return;
          const d = st.durationMillis || rec.durationSec * 1000 || 1;
          setDurMs(d);
          setPosMs(st.positionMillis);
          const p = Math.min(1, st.positionMillis / d);
          Animated.timing(anim, { toValue: p, duration: 150, useNativeDriver: false }).start();
          if (st.didJustFinish) {
            setPlaying(false);
            anim.setValue(0);
            void sound.setPositionAsync(0);
          }
        });
      }
      await soundRef.current.playAsync();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  };

  const width = anim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  const totalSec = durMs ? durMs / 1000 : rec.durationSec;

  return (
    <View style={styles.player}>
      <Pressable style={[styles.playBtn, !rec.playUrl && { opacity: 0.4 }]} onPress={() => void toggle()}>
        <Ionicons name={playing ? 'pause' : 'play'} size={16} color="#fff" />
      </Pressable>
      <View style={styles.track}>
        <Animated.View style={[styles.trackFill, { width }]} />
      </View>
      <Text style={styles.time}>
        {fmt(posMs / 1000)} / {fmt(totalSec)}
      </Text>
      <Pressable style={styles.moreBtn}>
        <Ionicons name="ellipsis-vertical" size={16} color={Colors.textMuted} />
      </Pressable>
    </View>
  );
}

const RecCard = React.memo(function RecCard({ rec }: { rec: RecordingItem }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>{rec.title}</Text>
      <View style={styles.metaRow}>
        <Ionicons name="time-outline" size={12} color={Colors.textFaint} />
        <Text style={styles.metaTxt}>{rec.timeLabel} · {rec.dateLabel}</Text>
      </View>
      <View style={styles.metaRow}>
        <Ionicons name="person-outline" size={12} color={Colors.textFaint} />
        <Text style={styles.metaTxt}>{rec.ownerName}</Text>
        {rec.phone !== '—' ? (
          <>
            <Ionicons name="call-outline" size={12} color={Colors.blue} style={{ marginLeft: 8 }} />
            <Text style={[styles.metaTxt, { color: Colors.blue }]}>{rec.phone}</Text>
          </>
        ) : null}
        <Text style={styles.device}>· {rec.device}</Text>
      </View>

      {!rec.linked ? (
        <View style={styles.warn}>
          <Ionicons name="warning-outline" size={14} color={Colors.amber} />
          <Text style={styles.warnTxt}>Chưa ghép CRM — thử «Quét tự động» hoặc «Gắn KH / Lead»</Text>
        </View>
      ) : (
        <View style={styles.linked}>
          <Ionicons name="checkmark-circle" size={14} color={Colors.green} />
          <Text style={styles.linkedTxt}>Đã ghép: {rec.customerName}</Text>
        </View>
      )}

      <PlayerBar rec={rec} />

      <View style={styles.actions}>
        {rec.linked ? (
          <>
            <ActionBtn icon="person" label="Gắn KH" />
            <ActionBtn icon="swap-horizontal" label="Quét Lead" />
            <ActionBtn icon="trash-outline" label="Xóa" danger />
          </>
        ) : (
          <>
            <ActionBtn icon="person-add" label="Gắn KH / Lead" />
            <ActionBtn icon="scan" label="Quét gắn Lead" />
            <ActionBtn icon="add-circle" label="Tạo KH + Lead/Deal" wide />
            <ActionBtn icon="trash-outline" label="Xóa" danger />
          </>
        )}
      </View>
    </View>
  );
});

function ActionBtn({
  icon,
  label,
  danger,
  wide,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  danger?: boolean;
  wide?: boolean;
}) {
  return (
    <Pressable
      style={[
        styles.actionBtn,
        wide && { flexBasis: '100%' },
        danger && { backgroundColor: Colors.redSoft, borderColor: 'rgba(239,68,68,0.4)' },
      ]}
    >
      <Ionicons name={icon} size={14} color={danger ? Colors.red : Colors.text} />
      <Text style={[styles.actionTxt, danger && { color: Colors.red }]}>{label}</Text>
    </Pressable>
  );
}

export default function RecordingsScreen() {
  const insets = useSafeAreaInsets();
  const [list, setList] = useState<RecordingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'unlinked' | 'linked'>('all');

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      setList(await fetchRecordings());
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const shown = useMemo(() =>
    list.filter((r) =>
      filter === 'all' ? true : filter === 'linked' ? r.linked : !r.linked,
    ),
    [list, filter],
  );

  const ListHeader = (
    <View>
      <LinearGradient
        colors={['#6D28D9', '#7C3AED', '#4F46E5']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.hero, { paddingTop: insets.top + 14 }]}
      >
        <View style={styles.heroTop}>
          <View style={styles.heroTitleRow}>
            <Ionicons name="mic" size={20} color="#fff" />
            <Text style={styles.heroTitle}>Lịch ghi âm</Text>
          </View>
          <Pressable style={styles.expandBtn}>
            <Ionicons name="chevron-down" size={14} color="#fff" />
            <Text style={styles.expandTxt}>Mở rộng</Text>
          </Pressable>
        </View>
        <Text style={styles.heroSub}>{list.length} bản ghi đã đồng bộ</Text>
      </LinearGradient>

      <View style={{ paddingHorizontal: 14 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="Tất cả" icon="albums" active={filter === 'all'} accent={Colors.purple} onPress={() => setFilter('all')} />
          <Chip label="Chưa gắn" icon="alert-circle" active={filter === 'unlinked'} accent={Colors.amber} onPress={() => setFilter('unlinked')} />
          <Chip label="Đã gắn" icon="link" active={filter === 'linked'} accent={Colors.green} onPress={() => setFilter('linked')} />
        </ScrollView>

        <View style={styles.syncBar}>
          <View style={styles.syncLeft}>
            <Ionicons name="cloud-done" size={15} color={Colors.green} />
            <Text style={styles.syncTxt}>Đã đồng bộ {shown.length}/{list.length}</Text>
          </View>
          <Pressable style={styles.batchBtn}>
            <Ionicons name="layers-outline" size={14} color={Colors.blue} />
            <Text style={styles.batchTxt}>Quét hàng loạt</Text>
          </Pressable>
        </View>

        {error ? (
          <View style={styles.stateBox}>
            <Ionicons name="cloud-offline-outline" size={28} color={Colors.textFaint} />
            <Text style={styles.stateTxt}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={() => void load()}>
              <Text style={styles.retryTxt}>Thử lại</Text>
            </Pressable>
          </View>
        ) : loading ? (
          <ActivityIndicator color={Colors.purple} style={{ marginTop: 30 }} />
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={styles.root}>
      <FlatList
        data={shown}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <RecCard rec={item} />}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={
          !error && !loading ? <Text style={styles.emptyTxt}>Chưa có bản ghi nào.</Text> : null
        }
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={Colors.purple} />
        }
        removeClippedSubviews
        maxToRenderPerBatch={8}
        windowSize={8}
        initialNumToRender={8}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  listContent: { paddingHorizontal: 14, paddingBottom: 120 },
  hero: {
    paddingHorizontal: 18,
    paddingBottom: 18,
    borderBottomLeftRadius: 22,
    borderBottomRightRadius: 22,
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  heroTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroTitle: { color: '#fff', fontSize: 20, fontWeight: '900' },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.18)',
    paddingHorizontal: 12,
    height: 32,
    borderRadius: Radii.pill,
  },
  expandTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  heroSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 8, fontWeight: '600' },
  chips: { gap: 8, paddingTop: 14 },
  toolbar: { flexDirection: 'row', gap: 10, paddingHorizontal: 14, marginTop: 14 },
  toolItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    height: 40,
    paddingHorizontal: 12,
    backgroundColor: Colors.card,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  toolTxt: { color: Colors.textMuted, fontSize: 13, fontWeight: '600', flex: 1 },
  syncBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 14,
    marginBottom: 6,
  },
  syncLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  syncTxt: { color: Colors.text, fontSize: 13, fontWeight: '700' },
  batchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: Colors.blueSoft,
    paddingHorizontal: 12,
    height: 34,
    borderRadius: Radii.pill,
  },
  batchTxt: { color: Colors.blue, fontSize: 12, fontWeight: '800' },

  card: {
    backgroundColor: Colors.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
  },
  cardTitle: { color: Colors.text, fontSize: 15, fontWeight: '800' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  metaTxt: { color: Colors.textMuted, fontSize: 12 },
  device: { color: Colors.textFaint, fontSize: 12, marginLeft: 6 },
  warn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: Colors.amberSoft,
    borderRadius: Radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 10,
  },
  warnTxt: { color: '#FCD34D', fontSize: 11.5, flex: 1, fontWeight: '600' },
  linked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    backgroundColor: Colors.greenSoft,
    borderRadius: Radii.sm,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 10,
  },
  linkedTxt: { color: Colors.green, fontSize: 12, fontWeight: '700' },
  player: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
  },
  playBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: Colors.purple,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    flex: 1,
    height: 5,
    borderRadius: 3,
    backgroundColor: Colors.surfaceSoft,
    overflow: 'hidden',
  },
  trackFill: { height: 5, borderRadius: 3, backgroundColor: Colors.purple },
  time: { color: Colors.textFaint, fontSize: 11, fontWeight: '700', minWidth: 64, textAlign: 'right' },
  moreBtn: { padding: 4 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  actionBtn: {
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 38,
    paddingHorizontal: 10,
    backgroundColor: Colors.surfaceSoft,
    borderRadius: Radii.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionTxt: { color: Colors.text, fontSize: 12, fontWeight: '700' },
  stateBox: { alignItems: 'center', paddingHorizontal: 32, marginTop: 30, gap: 10 },
  stateTxt: { color: Colors.textMuted, fontSize: 13, textAlign: 'center' },
  retryBtn: {
    paddingHorizontal: 18,
    height: 38,
    borderRadius: Radii.pill,
    backgroundColor: Colors.blueSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryTxt: { color: Colors.blue, fontWeight: '800', fontSize: 13 },
  emptyTxt: { color: Colors.textFaint, fontSize: 14, textAlign: 'center', marginTop: 30 },
});
