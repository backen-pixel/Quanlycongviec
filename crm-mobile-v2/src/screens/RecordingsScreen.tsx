import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Audio } from 'expo-av';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import FilterGridPanel from '../components/FilterGridPanel';
import RecordingsFilterSheet from '../components/RecordingsFilterSheet';
import RecordingsSearchFieldBar from '../components/RecordingsSearchFieldBar';
import VoiceRecorderToolbar from '../components/VoiceRecorderToolbar';
import { formatApiError } from '../api/client';
import {
  bootstrapCrmFromRecording,
  deleteRecording,
  fetchRecordings,
  relinkRecording,
  relinkUnassigned,
  type RecordingItem,
} from '../api/recordings';
import { currentUserId, useAuth } from '../context/AuthContext';
import {
  countRecordingFilters,
  DEFAULT_RECORDING_FILTERS,
  filterRecordingItems,
  linkFilterLabel,
  recordingFilterCounts,
  recordingSearchPlaceholder,
  type RecordingFilters,
  type RecordingLinkFilter,
} from '../lib/recordingsFilters';
import type { RootStackParamList } from '../navigation/types';
import { PAGE_HPAD, Radii, Spacing, useColors, type ThemeColors } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;

function fmt(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function PlayerBar({ rec }: { rec: RecordingItem }) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
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
        <Ionicons name={playing ? 'pause' : 'play'} size={15} color={Colors.blue} />
      </Pressable>
      <View style={styles.track}>
        <Animated.View style={[styles.trackFill, { width }]} />
      </View>
      <Text style={styles.time}>
        {fmt(posMs / 1000)} / {fmt(totalSec)}
      </Text>
    </View>
  );
}

type RecCardProps = {
  rec: RecordingItem;
  myId: string;
  busyId: string | null;
  onRelink: (rec: RecordingItem) => void;
  onDelete: (rec: RecordingItem) => void;
  onBootstrap: (rec: RecordingItem) => void;
};

const RecCard = React.memo(function RecCard({
  rec,
  myId,
  busyId,
  onRelink,
  onDelete,
  onBootstrap,
}: RecCardProps) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const canDelete = !!(myId && rec.userId && rec.userId === myId);
  const canBootstrap = true;
  const canRelink = !!rec.phoneNumber && (!rec.leadId || !rec.customerId);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle} numberOfLines={2}>{rec.title}</Text>
      <Text style={styles.cardMeta}>{rec.timeLabel} · {rec.dateLabel} · {rec.ownerName}</Text>
      {rec.phone !== '—' ? <Text style={styles.cardMeta}>{rec.phone}</Text> : null}
      <Text style={[styles.statusTxt, !rec.linked && styles.statusTxtMuted]} numberOfLines={2}>
        {rec.linked
          ? `Đã ghép · ${rec.customerName || 'KH'}${rec.leadCode ? ` · ${rec.leadCode}` : ''}`
          : 'Chưa ghép CRM'}
      </Text>
      {rec.notes ? <Text style={styles.notes} numberOfLines={2}>{rec.notes}</Text> : null}
      <PlayerBar rec={rec} />
      <View style={styles.actions}>
        {canRelink ? (
          <ActionBtn
            icon="scan-outline"
            label={busyId === rec.id ? '…' : 'Quét gắn'}
            onPress={() => onRelink(rec)}
            disabled={busyId === rec.id}
          />
        ) : null}
        {canBootstrap ? (
          <ActionBtn
            icon="add-circle-outline"
            label={rec.leadId ? 'Thêm Lead' : rec.customerId ? 'Tạo Lead' : 'Tạo KH'}
            onPress={() => onBootstrap(rec)}
            disabled={busyId === rec.id}
          />
        ) : null}
        {canDelete ? (
          <ActionBtn
            icon="trash-outline"
            label={busyId === rec.id ? '…' : 'Xóa'}
            danger
            onPress={() => onDelete(rec)}
            disabled={busyId === rec.id}
          />
        ) : null}
      </View>
    </View>
  );
});

function ActionBtn({
  icon,
  label,
  danger,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  danger?: boolean;
  onPress?: () => void;
  disabled?: boolean;
}) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  return (
    <Pressable
      style={[
        styles.actionBtn,
        danger && styles.actionBtnDanger,
        disabled && { opacity: 0.5 },
      ]}
      onPress={onPress}
      disabled={disabled}
    >
      <Ionicons name={icon} size={14} color={danger ? Colors.red : Colors.textMuted} />
      <Text style={[styles.actionTxt, danger && { color: Colors.red }]}>{label}</Text>
    </Pressable>
  );
}

export default function RecordingsScreen() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const myId = currentUserId(user);

  const [list, setList] = useState<RecordingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState<RecordingFilters>(DEFAULT_RECORDING_FILTERS);
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [filterOpen, setFilterOpen] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [bootstrapRec, setBootstrapRec] = useState<RecordingItem | null>(null);
  const [bootstrapName, setBootstrapName] = useState('');
  const [bootstrapPhone, setBootstrapPhone] = useState('');
  const [bootstrapType, setBootstrapType] = useState<'lead' | 'deal'>('lead');
  const [bootstrapBusy, setBootstrapBusy] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchDraft.trim()), 350);
    return () => clearTimeout(t);
  }, [searchDraft]);

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

  const counts = useMemo(() => recordingFilterCounts(list), [list]);
  const shown = useMemo(() => filterRecordingItems(list, filters, search), [list, filters, search]);
  const filterBadge = countRecordingFilters(filters, search);
  const filterActive = filterBadge > 0 || !!search;

  const handleBatchRelink = async () => {
    setBatchBusy(true);
    try {
      const { scanned, updated } = await relinkUnassigned(false);
      Alert.alert('Quét hàng loạt', `Đã quét ${scanned} bản ghi, cập nhật ${updated}.`);
      await load(true);
    } catch (e) {
      Alert.alert('Quét hàng loạt', formatApiError(e));
    } finally {
      setBatchBusy(false);
    }
  };

  const handleRelink = async (rec: RecordingItem) => {
    setBusyId(rec.id);
    try {
      await relinkRecording(rec.id);
      await load(true);
    } catch (e) {
      Alert.alert('Quét gắn Lead', formatApiError(e));
    } finally {
      setBusyId(null);
    }
  };

  const handleDelete = (rec: RecordingItem) => {
    Alert.alert('Xóa bản ghi?', 'Xóa trên server; không lấy lại được.', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setBusyId(rec.id);
            try {
              await deleteRecording(rec.id);
              setList((prev) => prev.filter((x) => x.id !== rec.id));
            } catch (e) {
              Alert.alert('Xóa', formatApiError(e));
            } finally {
              setBusyId(null);
            }
          })();
        },
      },
    ]);
  };

  const openBootstrap = (rec: RecordingItem) => {
    setBootstrapRec(rec);
    setBootstrapName(rec.customerName || (rec.phone !== '—' ? `Khách ${rec.phone}` : ''));
    setBootstrapPhone(rec.phone !== '—' ? rec.phone : '');
    setBootstrapType('lead');
  };

  const submitBootstrap = async () => {
    if (!bootstrapRec) return;
    const hasCustomer = !!bootstrapRec.customerId;
    const name = bootstrapName.trim();
    const phone = bootstrapPhone.replace(/\s+/g, '').trim();
    if (!hasCustomer && !name) {
      Alert.alert('Tạo Lead/Deal', 'Nhập tên khách hàng.');
      return;
    }
    if (!hasCustomer && !phone) {
      Alert.alert('Tạo Lead/Deal', 'Nhập số điện thoại.');
      return;
    }
    if (bootstrapType === 'deal' && !user?.company_id) {
      Alert.alert('Tạo Deal', 'Cần company_id — đăng nhập lại hoặc chọn công ty trên web.');
      return;
    }
    setBootstrapBusy(true);
    try {
      const titleLabel = phone || name || bootstrapRec.customerName || 'Ghi âm';
      await bootstrapCrmFromRecording(bootstrapRec.id, {
        full_name: name || undefined,
        title: `${bootstrapType === 'deal' ? 'Deal' : 'Lead'} — ${titleLabel}`,
        type: bootstrapType,
        company_id: bootstrapType === 'deal' ? user?.company_id || undefined : undefined,
        phone_number: !bootstrapRec.phoneNumber && phone ? phone : undefined,
        force_new: true,
      });
      setBootstrapRec(null);
      setBootstrapName('');
      setBootstrapPhone('');
      await load(true);
      Alert.alert('Tạo Lead/Deal', 'Đã tạo và gắn vào bản ghi.');
    } catch (e) {
      Alert.alert('Tạo Lead/Deal', formatApiError(e));
    } finally {
      setBootstrapBusy(false);
    }
  };

  const setLinkFilter = (link: RecordingLinkFilter) => {
    setFilters((p) => ({ ...p, link }));
  };

  const clearFilters = () => {
    setSearchDraft('');
    setSearch('');
    setFilters(DEFAULT_RECORDING_FILTERS);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.fixedTop}>
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.h1}>Lịch ghi âm</Text>
            <View style={styles.syncRow}>
              <View style={styles.syncDot} />
              <Text style={styles.syncTxt}>{list.length} bản ghi · hiển thị {shown.length}</Text>
            </View>
          </View>
          <Pressable style={styles.iconBtn} onPress={() => navigation.navigate('VoiceLocalRecordings')} hitSlop={8}>
            <Ionicons name="phone-portrait-outline" size={20} color={Colors.text} />
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={() => void load(true)} hitSlop={8}>
            <Ionicons name="refresh-outline" size={20} color={Colors.text} />
          </Pressable>
        </View>

        <VoiceRecorderToolbar onUploaded={() => void load(true)} disabled={loading} />

        <View style={styles.searchRow}>
          <View style={styles.searchBox}>
            <Ionicons name="search-outline" size={17} color={Colors.textFaint} />
            <TextInput
              value={searchDraft}
              onChangeText={setSearchDraft}
              placeholder={recordingSearchPlaceholder(filters.searchField)}
              placeholderTextColor={Colors.textFaint}
              style={styles.searchInput}
              returnKeyType="search"
              keyboardType={filters.searchField === 'phone' ? 'phone-pad' : 'default'}
            />
            {searchDraft ? (
              <Pressable onPress={() => setSearchDraft('')} hitSlop={8}>
                <Ionicons name="close-circle" size={17} color={Colors.textFaint} />
              </Pressable>
            ) : null}
          </View>
          <Pressable
            style={[styles.filterBtn, filterBadge > 0 && styles.filterBtnActive]}
            onPress={() => setFilterOpen(true)}
            hitSlop={4}
          >
            <Ionicons name="options-outline" size={20} color={filterBadge > 0 ? Colors.blue : Colors.text} />
            {filterBadge > 0 ? (
              <View style={styles.filterBadge}>
                <Text style={styles.filterBadgeTxt}>{filterBadge}</Text>
              </View>
            ) : null}
          </Pressable>
        </View>

        <RecordingsSearchFieldBar
          value={filters.searchField}
          onChange={(searchField) => setFilters((p) => ({ ...p, searchField }))}
        />

        <FilterGridPanel
          value={filters.link}
          onChange={setLinkFilter}
          pagePadding={PAGE_HPAD}
          cells={[
            { type: 'filter', id: 'all', label: 'Tất cả', icon: 'albums-outline', count: counts.all },
            { type: 'filter', id: 'unlinked', label: 'Chưa gắn', icon: 'alert-circle-outline', count: counts.unlinked },
            { type: 'filter', id: 'linked', label: 'Đã gắn', icon: 'link-outline', count: counts.linked },
            {
              type: 'action',
              label: batchBusy ? 'Đang quét…' : 'Quét hàng loạt',
              icon: 'layers-outline',
              onPress: () => void handleBatchRelink(),
              disabled: batchBusy,
            },
          ]}
        />

        <View style={styles.metaRow}>
          <Text style={styles.metaTxt}>
            {counts.all} bản ghi · {shown.length} đang hiển thị
          </Text>
          <Text style={styles.metaHint}>{linkFilterLabel(filters.link)}</Text>
        </View>

        {filterActive ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.activeChipScroll}
            contentContainerStyle={styles.activeChipContent}
            nestedScrollEnabled
          >
            {filters.link !== 'all' ? (
              <Pressable style={styles.activeChip} onPress={() => setLinkFilter('all')}>
                <Text style={styles.activeChipTxt}>{linkFilterLabel(filters.link)}</Text>
                <Ionicons name="close" size={13} color={Colors.textMuted} />
              </Pressable>
            ) : null}
            {search ? (
              <Pressable style={styles.activeChip} onPress={() => { setSearchDraft(''); setSearch(''); }}>
                <Text style={styles.activeChipTxt}>«{search}»</Text>
                <Ionicons name="close" size={13} color={Colors.textMuted} />
              </Pressable>
            ) : null}
            <Pressable style={styles.activeChipClear} onPress={clearFilters}>
              <Text style={styles.activeChipClearTxt}>Xóa lọc</Text>
            </Pressable>
          </ScrollView>
        ) : null}

        {error ? (
          <View style={styles.stateBox}>
            <Ionicons name="cloud-offline-outline" size={28} color={Colors.textFaint} />
            <Text style={styles.stateTxt}>{error}</Text>
            <Pressable style={styles.retryBtn} onPress={() => void load()}>
              <Text style={styles.retryTxt}>Thử lại</Text>
            </Pressable>
          </View>
        ) : loading ? (
          <ActivityIndicator color={Colors.blue} style={{ marginVertical: 20 }} />
        ) : null}
      </View>

      <FlatList
        style={styles.listFlex}
        data={shown}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <RecCard
            rec={item}
            myId={myId}
            busyId={busyId}
            onRelink={handleRelink}
            onDelete={handleDelete}
            onBootstrap={openBootstrap}
          />
        )}
        ListEmptyComponent={
          !error && !loading ? (
            <View style={styles.emptyBox}>
              <Ionicons name="mic-outline" size={38} color={Colors.textFaint} />
              <Text style={styles.emptyTxt}>
                {filterActive ? 'Không có bản ghi phù hợp bộ lọc.' : 'Chưa có bản ghi nào.'}
              </Text>
            </View>
          ) : null
        }
        contentContainerStyle={[styles.listContent, { paddingBottom: 100 + insets.bottom }]}
        ItemSeparatorComponent={() => <View style={{ height: Spacing.sm }} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={Colors.blue} />
        }
        removeClippedSubviews
        maxToRenderPerBatch={8}
        windowSize={8}
        initialNumToRender={8}
        showsVerticalScrollIndicator={false}
      />

      <RecordingsFilterSheet
        visible={filterOpen}
        filters={filters}
        counts={counts}
        onApply={setFilters}
        onClose={() => setFilterOpen(false)}
      />

      <Modal visible={!!bootstrapRec} transparent animationType="fade" onRequestClose={() => setBootstrapRec(null)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setBootstrapRec(null)}>
          <Pressable style={styles.modalCard} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.modalTitle}>
              {bootstrapRec?.customerId ? 'Tạo Lead/Deal' : 'Tạo KH + Lead/Deal'}
            </Text>
            {bootstrapRec?.customerName ? (
              <Text style={styles.modalSub}>KH: {bootstrapRec.customerName}</Text>
            ) : null}
            {bootstrapRec?.phone !== '—' ? (
              <Text style={styles.modalSub}>SĐT: {bootstrapRec?.phone}</Text>
            ) : null}
            {!bootstrapRec?.customerId ? (
              <>
                <TextInput
                  style={styles.modalInput}
                  placeholder="Tên khách hàng"
                  placeholderTextColor={Colors.textFaint}
                  value={bootstrapName}
                  onChangeText={setBootstrapName}
                  autoFocus
                />
                {!bootstrapRec?.phoneNumber ? (
                  <TextInput
                    style={styles.modalInput}
                    placeholder="Số điện thoại"
                    placeholderTextColor={Colors.textFaint}
                    value={bootstrapPhone}
                    onChangeText={setBootstrapPhone}
                    keyboardType="phone-pad"
                  />
                ) : null}
              </>
            ) : null}
            <View style={styles.typeRow}>
              <Pressable
                style={[styles.typeBtn, bootstrapType === 'lead' && styles.typeBtnActive]}
                onPress={() => setBootstrapType('lead')}
              >
                <Text style={[styles.typeBtnTxt, bootstrapType === 'lead' && styles.typeBtnTxtActive]}>Lead</Text>
              </Pressable>
              <Pressable
                style={[styles.typeBtn, bootstrapType === 'deal' && styles.typeBtnActive]}
                onPress={() => setBootstrapType('deal')}
              >
                <Text style={[styles.typeBtnTxt, bootstrapType === 'deal' && styles.typeBtnTxtActive]}>Deal</Text>
              </Pressable>
            </View>
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setBootstrapRec(null)} disabled={bootstrapBusy}>
                <Text style={styles.modalCancelTxt}>Hủy</Text>
              </Pressable>
              <Pressable
                style={[styles.modalOk, bootstrapBusy && { opacity: 0.6 }]}
                onPress={() => void submitBootstrap()}
                disabled={bootstrapBusy}
              >
                <Text style={styles.modalOkTxt}>{bootstrapBusy ? '…' : 'Tạo'}</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  fixedTop: { paddingHorizontal: PAGE_HPAD, gap: Spacing.sm, paddingBottom: Spacing.sm },
  listFlex: { flex: 1 },
  listContent: { paddingHorizontal: PAGE_HPAD, paddingTop: 4 },
  header: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.sm, marginTop: Spacing.sm },
  h1: { color: Colors.text, fontSize: 22, fontWeight: '900' },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  syncDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: Colors.green },
  syncTxt: { color: Colors.textFaint, fontSize: 12 },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  searchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    height: 46,
    paddingHorizontal: 12,
    backgroundColor: Colors.card,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchInput: { flex: 1, color: Colors.text, fontSize: 14, paddingVertical: 0 },
  filterBtn: {
    width: 46,
    height: 46,
    borderRadius: Radii.md,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBtnActive: { borderColor: Colors.blue, backgroundColor: Colors.blueSoft },
  filterBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    backgroundColor: Colors.blue,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeTxt: { color: Colors.white, fontSize: 10, fontWeight: '900' },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.sm,
  },
  metaTxt: { flex: 1, color: Colors.textFaint, fontSize: 11, fontWeight: '600' },
  metaHint: { color: Colors.blue, fontSize: 11, fontWeight: '800' },
  activeChipScroll: { maxHeight: 34 },
  activeChipContent: { alignItems: 'center', paddingRight: 4 },
  activeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    height: 30,
    borderRadius: Radii.pill,
    backgroundColor: Colors.surfaceSoft,
    borderWidth: 1,
    borderColor: Colors.border,
    marginRight: 8,
  },
  activeChipTxt: { color: Colors.textMuted, fontSize: 12, fontWeight: '700', maxWidth: 140 },
  activeChipClear: {
    paddingHorizontal: 10,
    height: 30,
    borderRadius: Radii.pill,
    backgroundColor: Colors.redSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeChipClearTxt: { color: Colors.red, fontSize: 12, fontWeight: '800' },
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
  },
  cardTitle: { color: Colors.text, fontSize: 15, fontWeight: '800' },
  cardMeta: { color: Colors.textMuted, fontSize: 12, marginTop: 4 },
  notes: { color: Colors.textFaint, fontSize: 12, marginTop: 6, lineHeight: 16 },
  statusTxt: { color: Colors.textMuted, fontSize: 12, fontWeight: '600', marginTop: 6 },
  statusTxtMuted: { color: Colors.textFaint },
  player: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  playBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: Colors.surfaceSoft,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  track: {
    flex: 1,
    height: 4,
    borderRadius: 2,
    backgroundColor: Colors.surfaceSoft,
    overflow: 'hidden',
  },
  trackFill: { height: 4, borderRadius: 2, backgroundColor: Colors.blue },
  time: { color: Colors.textFaint, fontSize: 11, fontWeight: '700', minWidth: 58, textAlign: 'right' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginTop: 10 },
  actionBtn: {
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 36,
    paddingHorizontal: 10,
    backgroundColor: Colors.surfaceSoft,
    borderRadius: Radii.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  actionBtnDanger: { backgroundColor: Colors.redSoft, borderColor: 'rgba(239,68,68,0.35)' },
  actionTxt: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
  stateBox: { alignItems: 'center', paddingVertical: 16, gap: 10 },
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
  emptyBox: { alignItems: 'center', paddingTop: 40, gap: 10 },
  emptyTxt: { color: Colors.textFaint, fontSize: 14, textAlign: 'center' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  modalCard: {
    backgroundColor: Colors.card,
    borderRadius: Radii.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 18,
  },
  modalTitle: { color: Colors.text, fontSize: 17, fontWeight: '900' },
  modalSub: { color: Colors.textMuted, fontSize: 13, marginTop: 6 },
  modalInput: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.md,
    padding: 12,
    color: Colors.text,
    fontSize: 15,
    backgroundColor: Colors.surfaceSoft,
  },
  typeRow: { flexDirection: 'row', gap: Spacing.sm, marginTop: 12 },
  typeBtn: {
    flex: 1,
    height: 38,
    borderRadius: Radii.sm,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceSoft,
  },
  typeBtnActive: { backgroundColor: Colors.blue, borderColor: Colors.blue },
  typeBtnTxt: { color: Colors.textMuted, fontWeight: '800', fontSize: 13 },
  typeBtnTxtActive: { color: Colors.white },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  modalCancel: {
    flex: 1,
    height: 42,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surfaceSoft,
  },
  modalCancelTxt: { color: Colors.textMuted, fontWeight: '800' },
  modalOk: {
    flex: 1,
    height: 42,
    borderRadius: Radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.blue,
  },
  modalOkTxt: { color: Colors.white, fontWeight: '800' },
});
