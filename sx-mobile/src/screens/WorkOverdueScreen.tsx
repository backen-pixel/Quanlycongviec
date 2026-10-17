import Ionicons from '@expo/vector-icons/Ionicons';
import { useFocusEffect, useRoute } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ProjectCommentModal from '../components/ProjectCommentModal';
import SpinningLoader from '../components/SpinningLoader';
import TapHighlight from '../components/TapHighlight';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  cardDaysOverdue,
  fetchOverdueCards,
  fetchProjectCardChildren,
  groupCardsByProject,
  isCardOverdue,
  type CardChild,
  type OverdueCard,
} from '../lib/overdueCardsApi';
import { fetchProjectUnreadComments, type UnreadComments } from '../lib/projectCommentCounts';
import { isQueryAbortError } from '../lib/queryCache';
import { isSystemAdmin } from '../lib/roles';
import { formatTaskDeadline } from '../lib/workTasksApi';
import { useRootNavigation } from '../navigation/useRootNavigation';
import { Radii, Spacing, colorWithAlpha, type AppColors } from '../theme';
import type { ProductionProject } from '../types';

/**
 * Tab «Công việc» của QUẢN LÝ: các NHIỆM VỤ QUÁ HẠN và đến hạn HÔM NAY, gom theo đơn — cùng nguồn và cùng cách chia nhóm
 * với Kanban/Hạn của trang web «Quản lý nhiệm vụ Sản xuất» (xem overdueCardsApi).
 *
 * Phạm vi xưởng do MÁY CHỦ khoá: admin hệ thống thấy mọi xưởng (có chip chọn xưởng), vai trò còn lại (admin xưởng,
 * quản lý…) chỉ nhận dữ liệu xưởng của mình. Chỉ đọc.
 */

type Row =
  | { kind: 'card'; key: string; card: OverdueCard }
  | { kind: 'child'; key: string; child: CardChild }
  | { kind: 'note'; key: string; text: string; loading?: boolean };

/** Trạng thái tải việc con của một đơn (khoá = projectId). */
type KidsState = 'loading' | 'error' | 'done';

const ALL = '';
/** Khoá chip cho thẻ không có công ty. */
const NO_COMPANY = '__none__';
/** Màu icon xưởng trên chip, xoay vòng theo thứ tự. */
const CHIP_PALETTE = ['#EF4444', '#64748B', '#8B5CF6', '#0EA5E9', '#10B981'];

/** Bỏ dấu + hạ chữ thường để tìm kiếm tiếng Việt không phân biệt dấu. */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'd').toLowerCase();
}

/** Màu nhấn của một thẻ: quá hạn luôn ĐỎ (không chia mức cam / vàng nữa); hôm nay màu XANH LÁ. */
function accentOf(card: OverdueCard, colors: AppColors): string {
  return card.kind === 'today' ? colors.success : colors.danger;
}

export default function WorkOverdueScreen() {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { openProjectDetail } = useRootNavigation();
  const sysAdmin = isSystemAdmin(user);

  const [cards, setCards] = useState<OverdueCard[]>([]);
  const [picked, setPicked] = useState(ALL);
  /** Bảng bình luận đang mở (dự án + nhãn = tên nhiệm vụ, hiện cố định phía trên ô nhập); null = đóng. */
  const [commentFor, setCommentFor] = useState<{ project: ProductionProject; label: string } | null>(null);
  /** Bình luận MỚI chưa xem của luồng deal theo `projectId` — huy hiệu «N mới» trên icon bình luận (đã xem thì không có). */
  const [commentUnread, setCommentUnread] = useState<Record<string, UnreadComments>>({});
  const myId = String(user?.id || (user as { userId?: string } | null)?.userId || '');
  // Từ Tổng quan (banner / «Tất cả» của danh sách quá hạn) sang đây: chọn đúng xưởng đang lọc ở Tổng quan. Chỉ admin hệ thống
  // có chip xưởng; vai trò khác máy chủ đã khoá một xưởng nên không cần. `at` đổi mỗi lần điều hướng → áp lại cả khi cùng công ty.
  const route = useRoute();
  const navParams = route.params as { companyId?: string; at?: number } | undefined;
  const navCompany = navParams?.companyId;
  const navAt = navParams?.at;
  const scrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    if (sysAdmin && navCompany) setPicked(navCompany);
    // Mỗi lần được chuyển sang từ Tổng quan: về đầu danh sách (không giữ vị trí cuộn của lần xem trước).
    if (navAt) scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [sysAdmin, navCompany, navAt]);
  const [query, setQuery] = useState('');
  /** Nhiệm vụ đang mở để xem việc con — khoá = `OverdueCard.id`. Mặc định đóng. */
  const [expandedCards, setExpandedCards] = useState<Record<string, boolean>>({});
  /** Việc con đã tải, theo `OverdueCard.id`. */
  const [kids, setKids] = useState<Record<string, CardChild[]>>({});
  const [kidsState, setKidsState] = useState<Record<string, KidsState>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seqRef = useRef(0);

  /** Nạp việc con của MỌI nhiệm vụ trong một đơn (một lần gọi / đơn); mở thêm nhiệm vụ khác của đơn đó không gọi lại. */
  const loadKids = useCallback(async (projectId: string, force = false) => {
    if (!projectId) return;
    setKidsState((p) => ({ ...p, [projectId]: 'loading' }));
    try {
      const m = await fetchProjectCardChildren(projectId, { force });
      setKids((p) => {
        const next = { ...p };
        m.forEach((v, k) => { next[k] = v; });
        return next;
      });
      setKidsState((p) => ({ ...p, [projectId]: 'done' }));
    } catch (e) {
      if (isQueryAbortError(e)) return;
      setKidsState((p) => ({ ...p, [projectId]: 'error' }));
    }
  }, []);

  const toggleCard = useCallback((card: OverdueCard) => {
    const opening = !expandedCards[card.id];
    setExpandedCards((p) => ({ ...p, [card.id]: opening }));
    // Chỉ nạp khi mở lần đầu hoặc lần trước lỗi; đang nạp / đã nạp thì dùng lại.
    if (opening && card.projectId && (kidsState[card.projectId] === undefined || kidsState[card.projectId] === 'error')) {
      void loadKids(card.projectId);
    }
  }, [expandedCards, kidsState, loadKids]);

  const load = useCallback(async (force = false, quiet = false) => {
    const seq = ++seqRef.current;
    if (!quiet) setLoading(true);
    try {
      const res = await fetchOverdueCards({ force });
      if (seq !== seqRef.current) return;
      setCards(res.cards);
      setError(null);
      // Bình luận mới cho huy hiệu: nạp ngầm (không chặn danh sách), lỗi thì thôi không hiện. Thay hẳn (không gộp) để luồng đã xem biến mất.
      void fetchProjectUnreadComments(res.cards.map((c) => c.projectId), myId)
        .then((m) => { if (seq === seqRef.current) setCommentUnread(m); })
        .catch(() => {});
    } catch (e) {
      if (isQueryAbortError(e) || seq !== seqRef.current) return;
      setError('Không tải được danh sách. Kéo xuống để thử lại.');
    } finally {
      if (seq === seqRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, []);

  // Mỗi lần vào / quay lại tab đều nạp lại (cache ngắn nên không tốn); lần đầu hiện vòng xoay, các lần sau nạp ngầm.
  const firstRef = useRef(true);
  useFocusEffect(useCallback(() => {
    void load(false, !firstRef.current);
    firstRef.current = false;
  }, [load]));

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void load(true, true);
    // Việc con của các nhiệm vụ đang mở cũng nạp lại.
    const pids = new Set(cards.filter((c) => expandedCards[c.id] && c.projectId).map((c) => c.projectId));
    pids.forEach((pid) => { void loadKids(pid, true); });
  }, [load, loadKids, cards, expandedCards]);

  /** Chip xưởng (chỉ admin hệ thống): lấy từ chính dữ liệu, kèm số nhiệm vụ. */
  const companyChips = useMemo(() => {
    if (!sysAdmin) return [];
    const by = new Map<string, { id: string; name: string; n: number }>();
    for (const c of cards) {
      const id = c.companyId || NO_COMPANY;
      const cur = by.get(id) || { id, name: (c.companyName || 'Khác').trim(), n: 0 };
      cur.n += 1;
      by.set(id, cur);
    }
    return [...by.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'vi'));
  }, [cards, sysAdmin]);

  const needle = useMemo(() => fold(query.trim()), [query]);
  const shown = useMemo(() => {
    const byCompany = picked === ALL ? cards : cards.filter((c) => (c.companyId || NO_COMPANY) === picked);
    if (!needle) return byCompany;
    return byCompany.filter((c) => fold(
      `${c.title} ${c.projectCode} ${c.projectName} ${c.assigneeName || ''} ${c.companyName || ''}`,
    ).includes(needle));
  }, [cards, picked, needle]);

  // Danh sách phẳng các nhiệm vụ (không còn dòng tên đơn): vẫn xếp theo thứ tự gom đơn nên nhiệm vụ cùng đơn đứng liền nhau.
  const flatCards = useMemo(() => groupCardsByProject(shown).flatMap((s) => s.cards), [shown]);
  const rows = useMemo(() => {
    const out: Row[] = [];
    for (const c of flatCards) {
      out.push({ kind: 'card', key: `c-${c.id}`, card: c });
      if (!expandedCards[c.id]) continue;
      const list = kids[c.id];
      const st = kidsState[c.projectId];
      if (list && list.length > 0) {
        for (const k of list) out.push({ kind: 'child', key: `k-${c.id}-${k.id}`, child: k });
      } else if (list) {
        out.push({ kind: 'note', key: `n-${c.id}`, text: 'Nhiệm vụ này chưa có việc con.' });
      } else if (st === 'error') {
        out.push({ kind: 'note', key: `n-${c.id}`, text: 'Không tải được việc con. Chạm nhiệm vụ để mở lại và thử lại.' });
      } else if (st === 'done') {
        out.push({ kind: 'note', key: `n-${c.id}`, text: 'Máy chủ chưa hỗ trợ xem việc con — cần cập nhật máy chủ.' });
      } else {
        out.push({ kind: 'note', key: `n-${c.id}`, text: 'Đang tải việc con…', loading: true });
      }
    }
    return out;
  }, [flatCards, expandedCards, kids, kidsState]);

  const subtitle = sysAdmin
    ? (picked === ALL ? 'Tất cả công việc cần theo dõi' : `${companyChips.find((c) => c.id === picked)?.name || 'Xưởng đã chọn'} · cần theo dõi`)
    : `${(cards[0]?.companyName || 'Xưởng của bạn').trim()} · cần theo dõi`;

  const renderRow = ({ item }: { item: Row }) => {
    if (item.kind === 'note') {
      return (
        <View style={[styles.noteRow]}>
          {item.loading ? <SpinningLoader size="small" color={colors.primary} /> : null}
          <Text style={styles.noteText}>{item.text}</Text>
        </View>
      );
    }
    if (item.kind === 'child') {
      const k = item.child;
      const late = !k.done && isCardOverdue(k.deadline);
      return (
        <View style={styles.childRow}>
          <Ionicons
            name={k.done ? 'checkmark-circle' : 'ellipse-outline'}
            size={18}
            color={k.done ? colors.success : colors.textMuted}
            style={styles.childIcon}
          />
          <View style={styles.childBody}>
            <Text style={[styles.childTitle, k.done ? styles.childTitleDone : null]} numberOfLines={2}>{k.title}</Text>
            <Text style={[styles.childMeta, late ? { color: colors.danger } : null]} numberOfLines={1}>
              {k.done ? 'Đã xong' : (k.deadline ? `Hạn ${formatTaskDeadline(k.deadline)}${late ? ' · quá hạn' : ''}` : 'Chưa có hạn')}
              {` · ${k.assigneeName || 'Chưa giao'}`}
            </Text>
          </View>
        </View>
      );
    }
    const c = item.card;
    const accent = accentOf(c, colors);
    const isToday = c.kind === 'today';
    const d = cardDaysOverdue(c.deadline);
    const isOpen = !!expandedCards[c.id];
    return (
      // Nhiệm vụ của đơn: hàng phẳng nền xám; bấm để mở / đóng danh sách việc con bên trong.
      <TapHighlight
        style={styles.taskRow}
        onPress={() => toggleCard(c)}
      >
        <View style={[styles.taskDot, { backgroundColor: accent }]} />
        <View style={styles.taskBodyFlat}>
          {/* Không còn dòng tên đơn nên mỗi nhiệm vụ tự ghi mã đơn (và xưởng với admin hệ thống) để biết thuộc đơn nào. */}
          {c.projectCode ? (
            <Text style={[styles.taskCode, { color: accent }]} numberOfLines={1}>
              {c.projectCode}
              {sysAdmin && c.companyName ? ` · ${c.companyName.trim()}` : ''}
            </Text>
          ) : null}
          <View style={styles.taskTop}>
            <Text style={styles.taskTitleFlat} numberOfLines={2}>{c.title}</Text>
            <Text style={[styles.taskTagFlat, { color: accent }]} numberOfLines={1}>
              {isToday ? 'Hôm nay' : (d > 0 ? `Quá hạn ${d} ngày` : 'Quá hạn')}
            </Text>
          </View>
          {/* Hai dòng riêng (không dồn một dòng rồi bị cắt «14/30 chưa …» khi có mũi tên mở / đóng bên phải). */}
          <Text style={styles.taskMetaFlat} numberOfLines={2}>
            {`Hạn ${formatTaskDeadline(c.deadline)} · ${c.assigneeName || 'Chưa giao'}`}
          </Text>
          {c.childTotal > 0 ? (
            <Text style={styles.taskMetaFlat} numberOfLines={1}>{`${c.childCompleted}/${c.childTotal} việc đã xong`}</Text>
          ) : null}
        </View>
        {c.projectId ? (
          <Pressable
            onPress={() => openProjectDetail(c.projectId)}
            hitSlop={10}
            accessibilityLabel="Mở chi tiết dự án"
            style={styles.openBtn}
          >
            <Ionicons name="open-outline" size={18} color={colors.primary} />
          </Pressable>
        ) : null}
        <Ionicons
          name={isOpen ? 'chevron-down' : 'chevron-forward'}
          size={18}
          color={colors.textMuted}
          style={styles.taskChevron}
        />
        {/* Bình luận: góc dưới bên phải, mở NGAY bảng bình luận của dự án (không rời màn hình), ô nhập điền sẵn tên nhiệm vụ. */}
        {c.projectId ? (
          <Pressable
            onPress={() => setCommentFor({
              project: { id: c.projectId, code: c.projectCode, name: c.projectName },
              label: c.title,
            })}
            hitSlop={10}
            accessibilityLabel={`Bình luận dự án ${c.projectCode}`}
            style={styles.commentBtn}
          >
            <Ionicons name="chatbubble-ellipses-outline" size={21} color={colors.primary} />
            {/* Chỉ hiện khi có bình luận MỚI chưa xem («2+», xem rồi thì biến mất); đè lên góc icon cho gọn, dễ nhìn. */}
            {commentUnread[c.projectId] ? (() => {
              const label = `${commentUnread[c.projectId].count}+`;
              return (
                <View style={[styles.commentBadge, { width: Math.max(19, 9 + label.length * 7) }]}>
                  <Text style={styles.commentBadgeTxt} numberOfLines={1}>{label}</Text>
                </View>
              );
            })() : null}
          </Pressable>
        ) : null}
      </TapHighlight>
    );
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#2F7BFF', '#1E55D6']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.banner, { paddingTop: insets.top + 14 }]}
      >
        <View style={styles.bannerIcon}>
          <Ionicons name="clipboard-outline" size={30} color="#FFFFFF" />
          <View style={styles.bannerTick}>
            <Ionicons name="checkmark" size={13} color="#1E55D6" />
          </View>
        </View>
        <View style={styles.bannerText}>
          <Text style={styles.bannerTitle} numberOfLines={1}>Quá hạn & Hôm nay</Text>
          <Text style={styles.bannerSub} numberOfLines={1}>{subtitle}</Text>
        </View>
      </LinearGradient>

      {/* Khung nội dung nền trắng, bo cong hai góc trên và đè lên banner xanh (như tab Tổng quan). */}
      <View style={styles.panel}>
      {sysAdmin && companyChips.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipScroll}
          contentContainerStyle={styles.chipRow}
        >
          {[{ id: ALL, name: 'Tất cả', n: cards.length }, ...companyChips].map((c, i) => {
            const active = picked === c.id;
            const tint = CHIP_PALETTE[(i - 1 + CHIP_PALETTE.length) % CHIP_PALETTE.length];
            return (
              <Pressable key={c.id || 'all'} onPress={() => setPicked(c.id)} style={[styles.chip, active ? styles.chipActive : null]}>
                {c.id === ALL ? (
                  <Ionicons name="time-outline" size={20} color={active ? '#FFFFFF' : colors.primary} />
                ) : (
                  <View style={[styles.chipIcon, { backgroundColor: tint }]}>
                    <Ionicons name="business" size={13} color="#FFFFFF" />
                  </View>
                )}
                <Text style={[styles.chipText, active ? styles.chipTextActive : null]} numberOfLines={1}>
                  {c.name}
                  <Text style={[styles.chipCount, active ? styles.chipTextActive : null]}>{`  ·  ${c.n}`}</Text>
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <View style={styles.searchBox}>
        <Ionicons name="search" size={20} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Tìm kiếm công việc, đơn hàng..."
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
          returnKeyType="search"
          autoCorrect={false}
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={10}>
            <Ionicons name="close-circle" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>

      {loading ? (
        <View style={styles.center}>
          <SpinningLoader size="large" color={colors.primary} />
        </View>
      ) : (
        // ScrollView vẽ TOÀN BỘ dòng (danh sách quá hạn ngắn) thay vì FlatList: FlatList tính sai vị trí khi thu gọn / mở một đơn
        // giữa danh sách đã đo (dòng chồng nhau, vùng bấm lệch → bấm tiêu đề đơn không ăn).
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={styles.listContent}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}
        >
          {rows.length === 0 ? (
            <View style={styles.center}>
              <Ionicons
                name={error ? 'cloud-offline-outline' : (needle ? 'search-outline' : 'checkmark-circle-outline')}
                size={40}
                color={error || needle ? colors.textMuted : colors.success}
              />
              <Text style={styles.emptyText}>
                {error || (needle ? 'Không tìm thấy kết quả phù hợp' : 'Không có nhiệm vụ quá hạn hoặc đến hạn hôm nay')}
              </Text>
            </View>
          ) : rows.map((row) => (
            <React.Fragment key={row.key}>{renderRow({ item: row })}</React.Fragment>
          ))}
        </ScrollView>
      )}
      </View>

      <ProjectCommentModal
        visible={!!commentFor}
        project={commentFor?.project ?? null}
        taskLabel={commentFor?.label}
        onClose={() => {
          const pid = commentFor?.project.id;
          setCommentFor(null);
          // Đã xem xong: tính lại huy hiệu của dự án này (đã ghi nhận «đã xem» khi mở bảng) → «mới» tắt.
          if (pid) {
            void fetchProjectUnreadComments([pid], myId)
              .then((m) => setCommentUnread((prev) => {
                const next = { ...prev };
                if (m[pid]) next[pid] = m[pid];
                else delete next[pid];
                return next;
              }))
              .catch(() => {});
          }
        }}
        onPosted={() => { /* huy hiệu chỉ đếm bình luận MỚI của người khác nên không đổi khi gửi */ }}
      />
    </View>
  );
}

function createStyles(colors: AppColors) {
  const shadow = {
    shadowColor: '#0B1F4A',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  } as const;
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    banner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: Spacing.lg,
      paddingBottom: 46,
    },
    panel: {
      flex: 1,
      marginTop: -28,
      paddingTop: 14,
      backgroundColor: colors.bgElevated,
      borderTopLeftRadius: 28,
      borderTopRightRadius: 28,
    },
    bannerIcon: {
      width: 56,
      height: 56,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(255,255,255,0.22)',
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.35)',
    },
    bannerTick: {
      position: 'absolute',
      right: 11,
      bottom: 12,
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#FFFFFF',
    },
    bannerText: { flex: 1, minWidth: 0 },
    bannerTitle: { color: '#FFFFFF', fontSize: 25, fontWeight: '800', letterSpacing: -0.4 },
    bannerSub: { color: 'rgba(255,255,255,0.88)', fontSize: 14, fontWeight: '500', marginTop: 2 },
    chipScroll: { flexGrow: 0, flexShrink: 0, height: 62 },
    chipRow: { paddingHorizontal: Spacing.lg, gap: 10, alignItems: 'center' },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      height: 46,
      paddingHorizontal: 14,
      borderRadius: Radii.full,
      backgroundColor: colors.card,
      maxWidth: 240,
      ...shadow,
    },
    chipActive: { backgroundColor: colors.primary },
    chipIcon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
    chipText: { color: colors.text, fontSize: 15, fontWeight: '700', flexShrink: 1 },
    chipTextActive: { color: '#FFFFFF' },
    chipCount: { color: colors.textMuted, fontWeight: '600' },
    searchBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      height: 50,
      marginHorizontal: Spacing.lg,
      marginBottom: 12,
      paddingHorizontal: 14,
      borderRadius: Radii.xl,
      backgroundColor: colors.card,
      ...shadow,
    },
    collapseAll: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-end',
      gap: 4,
      marginRight: Spacing.lg,
      marginTop: -2,
      marginBottom: 8,
    },
    collapseAllText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
    searchInput: { flex: 1, color: colors.text, fontSize: 15, paddingVertical: 0 },
    listContent: { paddingHorizontal: Spacing.lg, paddingBottom: 150, gap: 12 },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingLeft: 18,
      paddingRight: 14,
      paddingVertical: 14,
      borderRadius: 20,
      backgroundColor: colors.card,
      overflow: 'hidden',
      ...shadow,
    },
    headCard: { marginTop: 2 },
    openBtn: { padding: 4 },
    taskRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      paddingVertical: 11,
      paddingHorizontal: 12,
      borderRadius: 14,
      // Nền xám nhạt (ngả theo màu chữ phụ nên đúng cả giao diện sáng / tối) để nổi lên trên khung trắng.
      backgroundColor: colorWithAlpha(colors.textMuted, 0.13),
    },
    taskDot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
    taskChevron: { marginTop: 3 },
    commentBtn: { position: 'absolute', right: 14, bottom: 9, padding: 2 },
    commentBadge: {
      position: 'absolute',
      top: -9,
      right: -8,
      height: 19,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.danger,
      borderWidth: 1.5,
      borderColor: colorWithAlpha(colors.textMuted, 0.13),
    },
    commentBadgeTxt: { color: '#FFFFFF', fontSize: 11, fontWeight: '800' },
    // Việc con bên trong nhiệm vụ: thụt vào thêm một bậc, nền nhạt hơn dòng nhiệm vụ.
    childRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      marginLeft: 34,
      marginTop: -6,
      paddingVertical: 8,
      paddingHorizontal: 10,
      borderRadius: 12,
      backgroundColor: colorWithAlpha(colors.textMuted, 0.06),
    },
    childIcon: { marginTop: 1 },
    childBody: { flex: 1, minWidth: 0, gap: 1 },
    childTitle: { color: colors.text, fontSize: 13.5, fontWeight: '600' },
    childTitleDone: { color: colors.textMuted, textDecorationLine: 'line-through' },
    childMeta: { color: colors.textMuted, fontSize: 11.5, fontWeight: '500' },
    noteRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginLeft: 34,
      marginTop: -6,
      paddingVertical: 8,
      paddingHorizontal: 10,
    },
    noteText: { flex: 1, color: colors.textMuted, fontSize: 12.5, fontWeight: '500', fontStyle: 'italic' },
    taskBodyFlat: { flex: 1, minWidth: 0, gap: 2 },
    taskTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
    taskTitleFlat: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600' },
    taskCode: { color: colors.primary, fontSize: 11.5, fontWeight: '800', letterSpacing: 0.2 },
    taskTagFlat: { fontSize: 12, fontWeight: '700', marginTop: 1 },
    taskMetaFlat: { color: colors.textMuted, fontSize: 12, fontWeight: '500' },
    accent: { position: 'absolute', left: 0, top: 0, bottom: 0, width: 6 },
    iconCircle: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
    body: { flex: 1, minWidth: 0, gap: 4 },
    headTitle: { color: colors.text, fontSize: 15.5, fontWeight: '800' },
    taskTitle: { color: colors.text, fontSize: 15.5, fontWeight: '700' },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    meta: { flex: 1, color: colors.textMuted, fontSize: 12.5, fontWeight: '600' },
    pillRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2, flexWrap: 'wrap' },
    pill: {
      fontSize: 12,
      fontWeight: '800',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: Radii.full,
      overflow: 'hidden',
      maxWidth: 200,
    },
    center: { alignItems: 'center', justifyContent: 'center', gap: 10, paddingVertical: 60, paddingHorizontal: Spacing.xl },
    emptyText: { color: colors.textMuted, fontSize: 14, fontWeight: '600', textAlign: 'center' },
  });
}
