import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchCrmCompanies } from '../api/crm';
import { formatApiError } from '../api/client';
import {
  fetchProductCategories,
  fetchProducts,
  type ProductCategory,
  type ProductRow,
} from '../api/products';
import { useAuth } from '../context/AuthContext';
import type { RootStackParamList } from '../navigation/types';
import { Radii, Shadow, useColors, type ThemeColors } from '../theme';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type ViewMode = 'list' | 'grid';

const TOOL_ACTIONS = [
  { key: 'code', label: 'Cấu trúc mã', icon: 'settings-outline' as const, tone: 'purple' as const },
  { key: 'template', label: 'Mẫu Excel', icon: 'document-text-outline' as const, tone: 'muted' as const },
  { key: 'import', label: 'Import Excel', icon: 'cloud-upload-outline' as const, tone: 'green' as const },
  { key: 'export', label: 'Export Excel', icon: 'download-outline' as const, tone: 'blue' as const },
];

function isAdminLike(role?: string | null): boolean {
  const r = String(role || '').trim().toLowerCase();
  return r === 'admin' || r === 'sales_admin';
}

function isSystemAdmin(user: { role?: string | null; company_id?: string | null } | null): boolean {
  return String(user?.role || '').trim().toLowerCase() === 'admin' && !user?.company_id;
}

function showComingSoon(feature: string) {
  Alert.alert('Đang cập nhật', `Tính năng ${feature} đang được cập nhật. Vui lòng thử lại sau.`);
}

function formatPrice(value?: number | null): { text: string; isZero: boolean } {
  if (!value || value <= 0) return { text: '0đ', isZero: true };
  return { text: `${Math.round(value).toLocaleString('vi-VN')}đ`, isZero: false };
}

function dimLabel(value?: number | null): string {
  if (value == null || value === 0) return '—';
  return String(value);
}

export default function ProductsScreen() {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const { width: screenW } = useWindowDimensions();

  const [rows, setRows] = useState<ProductRow[]>([]);
  const [total, setTotal] = useState(0);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [companyFilter, setCompanyFilter] = useState('');
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const abortRef = useRef<AbortController | null>(null);

  const showCompanyPicker = isAdminLike(user?.role);
  const companyQuery = isSystemAdmin(user) && companyFilter ? companyFilter : undefined;

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchDraft.trim()), 350);
    return () => clearTimeout(t);
  }, [searchDraft]);

  useEffect(() => {
    if (!showCompanyPicker) return;
    void fetchCrmCompanies()
      .then((list) => setCompanies(list.map((c) => ({ id: c.id, name: c.shortName || c.name }))))
      .catch(() => setCompanies([]));
  }, [showCompanyPicker]);

  const load = useCallback(async (isRefresh = false) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');
    try {
      const [prodRes, catRes] = await Promise.all([
        fetchProducts({ search, category_id: categoryFilter || undefined, company_id: companyQuery, signal: ac.signal }),
        fetchProductCategories(companyQuery, ac.signal),
      ]);
      if (!ac.signal.aborted) {
        setRows(prodRes.products);
        setTotal(prodRes.total || prodRes.products.length);
        setCategories(catRes.filter((c) => c.is_active !== false));
      }
    } catch (e: unknown) {
      if (!ac.signal.aborted) {
        setError(formatApiError(e));
        setRows([]);
        setTotal(0);
      }
    } finally {
      if (!ac.signal.aborted) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [search, categoryFilter, companyQuery]);

  useFocusEffect(
    useCallback(() => {
      void load();
      return () => abortRef.current?.abort();
    }, [load]),
  );

  const companyLabel = useMemo(() => {
    if (!companyFilter) return 'Tất cả công ty';
    return companies.find((c) => c.id === companyFilter)?.name || 'Công ty';
  }, [companyFilter, companies]);

  const activeCategories = useMemo(
    () => [{ id: '', name: 'Tất cả' }, ...categories.map((c) => ({ id: c.id, name: c.name }))],
    [categories],
  );

  const gridCardW = (screenW - 16 * 2 - 10) / 2;

  const renderListCard = (p: ProductRow, index: number) => {
    const sell = formatPrice(p.selling_price);
    const base = formatPrice(p.base_price);
    const dims = p.dimensions || {};

    return (
      <View style={styles.listCard}>
        <View style={styles.listCardTop}>
          <Text style={styles.stt}>{index + 1}</Text>
          <Text style={styles.code}>{p.code || '—'}</Text>
          {p.unit ? (
            <View style={styles.unitBadge}>
              <Text style={styles.unitBadgeTxt}>{p.unit}</Text>
            </View>
          ) : null}
        </View>

        <Text style={styles.prodName} numberOfLines={2}>
          {p.name || '—'}
        </Text>

        {p.category?.name ? (
          <View style={styles.catRow}>
            <Ionicons name="pricetag-outline" size={13} color={Colors.purple} />
            <Text style={styles.catTxt} numberOfLines={1}>
              {p.category.name}
            </Text>
          </View>
        ) : null}

        <View style={styles.dimRow}>
          <View style={styles.dimChip}>
            <Text style={styles.dimChipLbl}>Ngang</Text>
            <Text style={styles.dimChipVal}>{dimLabel(dims.ngang)}</Text>
          </View>
          <View style={styles.dimChip}>
            <Text style={styles.dimChipLbl}>Cao</Text>
            <Text style={styles.dimChipVal}>{dimLabel(dims.cao)}</Text>
          </View>
          <View style={styles.dimChip}>
            <Text style={styles.dimChipLbl}>Sâu</Text>
            <Text style={styles.dimChipVal}>{dimLabel(dims.sau)}</Text>
          </View>
        </View>

        <View style={styles.priceBox}>
          <View style={styles.priceCol}>
            <Text style={styles.priceLbl}>Giá bán (VAT)</Text>
            <Text style={[styles.priceVat, sell.isZero && styles.priceZero]}>{sell.text}</Text>
          </View>
          <View style={styles.priceDivider} />
          <View style={styles.priceCol}>
            <Text style={styles.priceLbl}>Chưa VAT</Text>
            <Text style={[styles.priceBase, base.isZero && styles.priceZero]}>{base.text}</Text>
          </View>
        </View>

        <View style={styles.cardActions}>
          <Pressable style={styles.editBtn} onPress={() => showComingSoon('sửa sản phẩm')}>
            <Ionicons name="create-outline" size={18} color={Colors.blue} />
          </Pressable>
          <Pressable style={styles.delBtn} onPress={() => showComingSoon('xóa sản phẩm')}>
            <Ionicons name="trash-outline" size={18} color={Colors.red} />
          </Pressable>
        </View>
      </View>
    );
  };

  const renderGridCard = (p: ProductRow) => {
    const sell = formatPrice(p.selling_price);

    return (
      <View style={[styles.gridCard, { width: gridCardW }]}>
        <Text style={styles.gridCode} numberOfLines={1}>
          {p.code || '—'}
        </Text>
        <Text style={styles.gridName} numberOfLines={3}>
          {p.name || '—'}
        </Text>
        {p.category?.name ? (
          <Text style={styles.gridCat} numberOfLines={1}>
            {p.category.name}
          </Text>
        ) : null}
        <Text style={[styles.gridPrice, sell.isZero && styles.priceZero]}>{sell.text}</Text>
        {p.unit ? <Text style={styles.gridUnit}>{p.unit}</Text> : null}
      </View>
    );
  };

  const renderItem = ({ item, index }: { item: ProductRow; index: number }) =>
    viewMode === 'list' ? renderListCard(item, index) : renderGridCard(item);

  const listHeader = (
    <>
      <View style={styles.header}>
        <Pressable style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <View style={styles.headerBody}>
          <View style={styles.headerTitleRow}>
            <LinearGradient
              colors={['#2F6BFF', '#A855F7']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.headerIcon}
            >
              <Ionicons name="cube" size={22} color={Colors.white} />
            </LinearGradient>
            <View>
              <Text style={styles.headerTitle}>Sản phẩm</Text>
              <Text style={styles.headerSub}>{total} sản phẩm</Text>
            </View>
          </View>
        </View>
        <Pressable style={styles.addTopBtn} onPress={() => showComingSoon('thêm sản phẩm')}>
          <Ionicons name="add" size={16} color={Colors.text} />
          <Text style={styles.addTopTxt}>Thêm SP</Text>
        </Pressable>
      </View>

      <View style={styles.searchRow}>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={Colors.textFaint} />
          <TextInput
            style={styles.searchInput}
            placeholder="Tìm mã, tên sản phẩm..."
            placeholderTextColor={Colors.textFaint}
            value={searchDraft}
            onChangeText={setSearchDraft}
            returnKeyType="search"
          />
        </View>
      </View>

      {showCompanyPicker ? (
        <Pressable style={styles.companyPill} onPress={() => setCompanyPickerOpen(true)}>
          <Ionicons name="business-outline" size={16} color={Colors.blue} />
          <Text style={styles.companyPillTxt} numberOfLines={1}>
            {companyLabel}
          </Text>
          <Ionicons name="chevron-down" size={16} color={Colors.textMuted} />
        </Pressable>
      ) : null}

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.catScroll}
        style={styles.catScrollWrap}
      >
        {activeCategories.map((cat) => {
          const active = categoryFilter === cat.id;
          return (
            <Pressable
              key={cat.id || 'all'}
              style={[styles.catChip, active && styles.catChipActive]}
              onPress={() => setCategoryFilter(cat.id)}
            >
              <Text style={[styles.catChipTxt, active && styles.catChipTxtActive]} numberOfLines={1}>
                {cat.name}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.toolScroll}
        style={styles.toolScrollWrap}
      >
        {TOOL_ACTIONS.map((t) => (
          <Pressable
            key={t.key}
            style={[styles.toolBtn, toolBtnStyle(t.tone, styles)]}
            onPress={() => showComingSoon(t.label.toLowerCase())}
          >
            <Ionicons name={t.icon} size={15} color={toolIconColor(t.tone, Colors)} />
            <Text style={[styles.toolBtnTxt, { color: toolIconColor(t.tone, Colors) }]}>{t.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      <View style={styles.listMeta}>
        <Text style={styles.listMetaTxt}>
          Hiển thị <Text style={styles.listMetaStrong}>{rows.length}</Text> sản phẩm
        </Text>
        <View style={styles.viewToggle}>
          <Pressable
            style={[styles.viewBtn, viewMode === 'list' && styles.viewBtnActive]}
            onPress={() => setViewMode('list')}
          >
            <Ionicons name="list" size={18} color={viewMode === 'list' ? Colors.blue : Colors.textFaint} />
          </Pressable>
          <Pressable
            style={[styles.viewBtn, viewMode === 'grid' && styles.viewBtnActive]}
            onPress={() => setViewMode('grid')}
          >
            <Ionicons name="grid" size={18} color={viewMode === 'grid' ? Colors.blue : Colors.textFaint} />
          </Pressable>
        </View>
      </View>
    </>
  );

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      {loading && !rows.length ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.blue} size="large" />
        </View>
      ) : (
        <FlatList
          key={viewMode}
          data={rows}
          keyExtractor={(it) => it.id}
          renderItem={renderItem}
          numColumns={viewMode === 'grid' ? 2 : 1}
          columnWrapperStyle={viewMode === 'grid' ? styles.gridRow : undefined}
          ListHeaderComponent={listHeader}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 88 }}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={Colors.blue} />
          }
          ListEmptyComponent={
            <Text style={styles.empty}>{error || 'Không có sản phẩm phù hợp'}</Text>
          }
        />
      )}

      <Pressable
        style={[styles.fab, { bottom: Math.max(insets.bottom, 12) + 8 }]}
        onPress={() => showComingSoon('thêm sản phẩm')}
      >
        <Ionicons name="add" size={22} color={Colors.white} />
        <Text style={styles.fabTxt}>Thêm sản phẩm</Text>
      </Pressable>

      <Modal visible={companyPickerOpen} transparent animationType="fade" onRequestClose={() => setCompanyPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCompanyPickerOpen(false)}>
          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 16 }]}>
            <Text style={styles.modalTitle}>Chọn công ty</Text>
            <ScrollView style={{ maxHeight: 320 }}>
              {[{ id: '', name: 'Tất cả công ty' }, ...companies].map((c) => (
                <Pressable
                  key={c.id || 'all'}
                  style={[styles.modalItem, companyFilter === c.id && styles.modalItemActive]}
                  onPress={() => {
                    setCompanyFilter(c.id);
                    setCompanyPickerOpen(false);
                  }}
                >
                  <Text style={[styles.modalItemTxt, companyFilter === c.id && styles.modalItemTxtActive]}>
                    {c.name}
                  </Text>
                  {companyFilter === c.id ? (
                    <Ionicons name="checkmark" size={18} color={Colors.blue} />
                  ) : null}
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

function toolBtnStyle(tone: string, styles: ReturnType<typeof makeStyles>) {
  switch (tone) {
    case 'green':
      return styles.toolBtn_green;
    case 'blue':
      return styles.toolBtn_blue;
    case 'purple':
      return styles.toolBtn_purple;
    default:
      return styles.toolBtn_muted;
  }
}

function toolIconColor(tone: string, Colors: ThemeColors): string {
  switch (tone) {
    case 'green':
      return Colors.green;
    case 'blue':
      return Colors.blue;
    case 'purple':
      return Colors.purple;
    default:
      return Colors.textMuted;
  }
}

const makeStyles = (Colors: ThemeColors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: Colors.bg },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: 8,
      paddingTop: 4,
      paddingBottom: 12,
      marginHorizontal: -8,
    },
    backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginTop: 2 },
    headerBody: { flex: 1, paddingRight: 8 },
    headerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    headerIcon: {
      width: 44,
      height: 44,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTitle: { color: Colors.text, fontSize: 24, fontWeight: '900' },
    headerSub: { color: Colors.textMuted, fontSize: 13, marginTop: 2 },
    addTopBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 10,
      paddingVertical: 8,
      borderRadius: Radii.pill,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.card,
      marginTop: 4,
    },
    addTopTxt: { color: Colors.text, fontSize: 12, fontWeight: '800' },
    searchRow: { marginBottom: 10 },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: Colors.card,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: Colors.border,
      paddingHorizontal: 12,
      height: 46,
    },
    searchInput: { flex: 1, color: Colors.text, fontSize: 14, paddingVertical: 0 },
    companyPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      alignSelf: 'flex-start',
      paddingHorizontal: 14,
      paddingVertical: 10,
      borderRadius: Radii.pill,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.card,
      marginBottom: 10,
      maxWidth: '100%',
    },
    companyPillTxt: { color: Colors.text, fontSize: 13, fontWeight: '700', flexShrink: 1 },
    catScrollWrap: { marginHorizontal: -16, marginBottom: 10 },
    catScroll: { paddingHorizontal: 16, gap: 8 },
    catChip: {
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: Radii.pill,
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.card,
      maxWidth: 220,
    },
    catChipActive: { backgroundColor: Colors.blue, borderColor: Colors.blue },
    catChipTxt: { color: Colors.textMuted, fontSize: 12, fontWeight: '700' },
    catChipTxtActive: { color: Colors.white, fontWeight: '800' },
    toolScrollWrap: { marginHorizontal: -16, marginBottom: 10 },
    toolScroll: { paddingHorizontal: 16, gap: 8 },
    toolBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 9,
      borderRadius: Radii.md,
      borderWidth: 1,
    },
    toolBtn_green: { backgroundColor: Colors.greenSoft, borderColor: 'rgba(34,197,94,0.35)' },
    toolBtn_blue: { backgroundColor: Colors.blueSoft, borderColor: 'rgba(47,107,255,0.35)' },
    toolBtn_purple: { backgroundColor: 'rgba(168,85,247,0.14)', borderColor: 'rgba(168,85,247,0.35)' },
    toolBtn_muted: { backgroundColor: Colors.surfaceSoft, borderColor: Colors.border },
    toolBtnTxt: { fontSize: 11, fontWeight: '800' },
    listMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 10,
    },
    listMetaTxt: { color: Colors.textFaint, fontSize: 12, flex: 1 },
    listMetaStrong: { color: Colors.textMuted, fontWeight: '800' },
    viewToggle: { flexDirection: 'row', gap: 4 },
    viewBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: Colors.border,
      backgroundColor: Colors.card,
    },
    viewBtnActive: { backgroundColor: Colors.blueSoft, borderColor: Colors.blue },
    listCard: {
      backgroundColor: Colors.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      padding: 14,
      marginBottom: 12,
    },
    listCardTop: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    stt: { color: Colors.textFaint, fontSize: 12, fontWeight: '700', width: 20 },
    code: { color: Colors.blue, fontSize: 13, fontWeight: '900', flex: 1 },
    unitBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: Radii.pill,
      backgroundColor: Colors.surfaceSoft,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    unitBadgeTxt: { color: Colors.textMuted, fontSize: 10, fontWeight: '700' },
    prodName: { color: Colors.text, fontSize: 15, fontWeight: '800', lineHeight: 21, marginBottom: 6 },
    catRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 8 },
    catTxt: { color: Colors.purple, fontSize: 12, fontWeight: '700', flex: 1 },
    dimRow: { flexDirection: 'row', gap: 6, marginBottom: 10 },
    dimChip: {
      flex: 1,
      backgroundColor: Colors.surfaceSoft,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: Colors.borderSoft,
      paddingVertical: 6,
      paddingHorizontal: 6,
      alignItems: 'center',
    },
    dimChipLbl: { color: Colors.textFaint, fontSize: 9, fontWeight: '700', marginBottom: 2 },
    dimChipVal: { color: Colors.textMuted, fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
    priceBox: {
      flexDirection: 'row',
      backgroundColor: Colors.surfaceSoft,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: Colors.borderSoft,
      padding: 12,
      marginBottom: 10,
    },
    priceCol: { flex: 1 },
    priceDivider: { width: 1, backgroundColor: Colors.border, marginHorizontal: 10 },
    priceLbl: { color: Colors.textFaint, fontSize: 10, fontWeight: '700', marginBottom: 4 },
    priceVat: { color: Colors.blue, fontSize: 17, fontWeight: '900' },
    priceBase: { color: Colors.textMuted, fontSize: 14, fontWeight: '700' },
    priceZero: { color: Colors.textFaint },
    cardActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
    editBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: Colors.blueSoft,
      borderWidth: 1,
      borderColor: 'rgba(47,107,255,0.35)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    delBtn: {
      width: 36,
      height: 36,
      borderRadius: 10,
      backgroundColor: 'rgba(239,68,68,0.12)',
      borderWidth: 1,
      borderColor: 'rgba(239,68,68,0.35)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    gridRow: { gap: 10, marginBottom: 10 },
    gridCard: {
      backgroundColor: Colors.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: Colors.border,
      padding: 12,
      minHeight: 140,
    },
    gridCode: { color: Colors.blue, fontSize: 12, fontWeight: '900', marginBottom: 6 },
    gridName: { color: Colors.text, fontSize: 13, fontWeight: '800', lineHeight: 18, flex: 1 },
    gridCat: { color: Colors.purple, fontSize: 10, fontWeight: '700', marginTop: 4 },
    gridPrice: { color: Colors.blue, fontSize: 15, fontWeight: '900', marginTop: 8 },
    gridUnit: { color: Colors.textFaint, fontSize: 10, marginTop: 2 },
    empty: { textAlign: 'center', color: Colors.textFaint, marginTop: 48, fontSize: 14 },
    fab: {
      position: 'absolute',
      right: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 18,
      paddingVertical: 14,
      borderRadius: Radii.pill,
      backgroundColor: Colors.blue,
      ...Shadow.fab,
    },
    fabTxt: { color: Colors.white, fontSize: 14, fontWeight: '900' },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.55)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: Colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 16,
      paddingHorizontal: 16,
      borderWidth: 1,
      borderColor: Colors.border,
    },
    modalTitle: { color: Colors.text, fontSize: 16, fontWeight: '900', marginBottom: 12 },
    modalItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      borderBottomWidth: 1,
      borderBottomColor: Colors.borderSoft,
    },
    modalItemActive: {},
    modalItemTxt: { color: Colors.text, fontSize: 14, fontWeight: '600', flex: 1 },
    modalItemTxtActive: { color: Colors.blue, fontWeight: '800' },
  });
