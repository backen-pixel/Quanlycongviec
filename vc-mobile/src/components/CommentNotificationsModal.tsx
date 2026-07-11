import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../api/client';
import { useNotifications } from '../context/NotificationContext';
import { useTheme } from '../context/ThemeContext';
import {
  dismissAllReadCommentNotifications,
  fetchCommentNotifications,
  markAllCommentNotificationsRead,
  markNotificationReadForItem,
  mergeCommentNotificationLists,
  notificationDismissKey,
  notificationProjectId,
  notificationCategoryLabel,
  notificationIconName,
  notificationActionLabel,
  isWorkshopDealNotification,
  type SxCommentNotification,
} from '../lib/notificationApi';
import { ensureNotificationPermission } from '../lib/pushRegistration';
import { Radii, Spacing } from '../theme';
import TapHighlight from './TapHighlight';

type TabKey = 'all' | 'unread';

type Props = {
  visible: boolean;
  onClose: () => void;
  onOpenProject: (projectId: string) => void;
};

function dayLabel(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startThat = new Date(new Date(iso).getFullYear(), new Date(iso).getMonth(), new Date(iso).getDate()).getTime();
  const diffDays = Math.round((startToday - startThat) / 86400000);
  if (diffDays === 0) return 'HÔM NAY';
  if (diffDays === 1) return 'HÔM QUA';
  return new Date(iso).toLocaleDateString('vi-VN', { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase();
}

function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const ms = Date.now() - t;
  if (ms < 60_000) return 'Vừa xong';
  const min = Math.floor(ms / 60000);
  if (min < 60) return `${min} phút trước`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} giờ trước`;
  const d = new Date(iso);
  return d.toLocaleString('vi-VN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function groupNotifications(items: SxCommentNotification[]) {
  const groups: { label: string; items: SxCommentNotification[] }[] = [];
  const map = new Map<string, SxCommentNotification[]>();
  for (const item of items) {
    const label = dayLabel(item.created_at);
    if (!map.has(label)) map.set(label, []);
    map.get(label)!.push(item);
  }
  for (const [label, rows] of map.entries()) groups.push({ label, items: rows });
  return groups;
}

export default function CommentNotificationsModal({ visible, onClose, onOpenProject }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const {
    refreshUnread,
    subscribeComment,
    liveNotifications,
    markLiveNotificationsRead,
    adjustUnreadCount,
  } = useNotifications();
  const liveRef = useRef(liveNotifications);
  liveRef.current = liveNotifications;
  const [tab, setTab] = useState<TabKey>('all');
  const [items, setItems] = useState<SxCommentNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState('');

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: { flex: 1, backgroundColor: colors.bg },
        header: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: Spacing.lg,
          paddingTop: insets.top + 8,
          paddingBottom: 12,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          backgroundColor: colors.bgElevated,
        },
        title: { color: colors.text, fontSize: 22, fontWeight: '800' },
        headerActions: { flexDirection: 'row', gap: 8 },
        iconBtn: {
          width: 38,
          height: 38,
          borderRadius: Radii.md,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          alignItems: 'center',
          justifyContent: 'center',
        },
        tabs: {
          flexDirection: 'row',
          gap: 20,
          paddingHorizontal: Spacing.lg,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          backgroundColor: colors.bgElevated,
        },
        tabBtn: { paddingVertical: 12, borderBottomWidth: 2, borderBottomColor: 'transparent' },
        tabBtnActive: { borderBottomColor: colors.primary },
        tabText: { color: colors.textMuted, fontSize: 14, fontWeight: '700' },
        tabTextActive: { color: colors.primary },
        list: { flex: 1 },
        listContent: { paddingBottom: 24 },
        sectionLabel: {
          color: colors.textFaint,
          fontSize: 11,
          fontWeight: '800',
          letterSpacing: 0.6,
          paddingHorizontal: Spacing.lg,
          paddingTop: 16,
          paddingBottom: 8,
        },
        card: {
          marginHorizontal: Spacing.md,
          marginBottom: 10,
          padding: 14,
          borderRadius: Radii.lg,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
        },
        cardUnread: {
          borderColor: colors.primary,
          borderWidth: 1.5,
          backgroundColor: colors.primarySoft + '88',
          shadowColor: colors.primary,
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.18,
          shadowRadius: 6,
          elevation: 3,
        },
        cardRead: { opacity: 0.82 },
        cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
        iconWrap: {
          width: 42,
          height: 42,
          borderRadius: Radii.md,
          backgroundColor: colors.cardAlt,
          alignItems: 'center',
          justifyContent: 'center',
        },
        iconWrapUnread: { backgroundColor: colors.primarySoft },
        iconWrapDeal: { backgroundColor: '#E0F2FE' },
        cardBody: { flex: 1, minWidth: 0 },
        metaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
        catText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
        timeText: { color: colors.textFaint, fontSize: 11, fontWeight: '600' },
        notifTitle: { color: colors.text, fontSize: 14, fontWeight: '800', marginBottom: 4 },
        notifTitleUnread: { fontWeight: '900', color: colors.text },
        unreadBadge: {
          alignSelf: 'flex-start',
          marginBottom: 6,
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderRadius: Radii.full,
          backgroundColor: colors.primary,
        },
        unreadBadgeText: { color: colors.white, fontSize: 10, fontWeight: '800', letterSpacing: 0.3 },
        notifMsg: { color: colors.textMuted, fontSize: 13, lineHeight: 18 },
        previewBox: {
          marginTop: 8, paddingHorizontal: 10, paddingVertical: 8,
          borderRadius: Radii.md, borderLeftWidth: 3,
          borderLeftColor: colors.primary,
          backgroundColor: colors.cardAlt,
        },
        previewText: { color: colors.text, fontSize: 13, lineHeight: 18, fontStyle: 'italic' },
        unreadDot: {
          position: 'absolute',
          top: -2,
          right: -2,
          width: 10,
          height: 10,
          borderRadius: 5,
          backgroundColor: colors.danger,
          borderWidth: 2,
          borderColor: colors.card,
        },
        actionRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
        outlineBtn: {
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: Radii.full,
          borderWidth: 1,
          borderColor: colors.borderStrong,
        },
        outlineBtnText: { color: colors.text, fontSize: 12, fontWeight: '700' },
        primaryBtn: {
          paddingHorizontal: 14,
          paddingVertical: 8,
          borderRadius: Radii.full,
          backgroundColor: colors.primary,
        },
        primaryBtnText: { color: colors.white, fontSize: 12, fontWeight: '700' },
        emptyWrap: { alignItems: 'center', paddingVertical: 48, gap: 8 },
        emptyText: { color: colors.textMuted, fontSize: 14 },
        footer: {
          paddingHorizontal: Spacing.lg,
          paddingTop: 8,
          paddingBottom: Math.max(insets.bottom, 12),
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: colors.border,
          backgroundColor: colors.bgElevated,
          gap: 10,
        },
        footerHint: { color: colors.textFaint, fontSize: 11, textAlign: 'center' },
        footerBtn: {
          paddingVertical: 14,
          borderRadius: Radii.lg,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          alignItems: 'center',
        },
        footerBtnDanger: {
          paddingVertical: 14,
          borderRadius: Radii.lg,
          borderWidth: 1,
          borderColor: colors.danger + '55',
          backgroundColor: colors.dangerSoft,
          alignItems: 'center',
        },
        footerBtnDangerPressed: {
          borderColor: colors.danger,
          backgroundColor: colors.danger + '28',
          opacity: 1,
        },
        footerBtnDangerText: { color: colors.danger, fontSize: 14, fontWeight: '700' },
        footerBtnDangerTextPressed: { color: colors.danger, fontWeight: '800' },
        errBox: {
          margin: Spacing.md,
          padding: 10,
          borderRadius: Radii.md,
          backgroundColor: colors.dangerSoft,
          borderWidth: 1,
          borderColor: colors.danger,
        },
        errText: { color: colors.danger, fontSize: 12, fontWeight: '600' },
      }),
    [colors, insets.bottom, insets.top],
  );

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setErr('');
    try {
      const { notifications } = await fetchCommentNotifications(tab === 'unread');
      setItems((prev) => {
        const merged = mergeCommentNotificationLists(liveRef.current, notifications, prev);
        if (tab === 'unread') return merged.filter((x) => !x.is_read);
        return merged;
      });
    } catch (e) {
      setErr(formatApiError(e));
      setItems((prev) => {
        const merged = mergeCommentNotificationLists(liveRef.current, prev);
        if (tab === 'unread') return merged.filter((x) => !x.is_read);
        return merged;
      });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [tab]);

  useEffect(() => {
    if (!visible) return;
    setItems((prev) => {
      const merged = mergeCommentNotificationLists(liveNotifications, prev);
      if (tab === 'unread') return merged.filter((x) => !x.is_read);
      return merged;
    });
  }, [visible, liveNotifications, tab]);

  useEffect(() => {
    if (!visible) return undefined;
    return subscribeComment((incoming) => {
      setItems((prev) => {
        const merged = mergeCommentNotificationLists([incoming], prev);
        if (tab === 'unread') return merged.filter((x) => !x.is_read);
        return merged;
      });
    });
  }, [visible, subscribeComment, tab]);

  useEffect(() => {
    if (!visible) return;
    void load(false);
  }, [visible, load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load(true);
      refreshUnread();
    } finally {
      setRefreshing(false);
    }
  }, [load, refreshUnread]);

  const markAllRead = useCallback(async () => {
    const unreadBefore = items.filter((x) => !x.is_read).length;
    if (!unreadBefore) return;
    try {
      await markAllCommentNotificationsRead();
      markLiveNotificationsRead();
      setItems((prev) => prev.map((x) => ({ ...x, is_read: true })));
      adjustUnreadCount(-unreadBefore);
      if (tab === 'unread') setTab('all');
    } catch {
      /* ignore */
    }
  }, [items, markLiveNotificationsRead, adjustUnreadCount, tab]);

  const deleteAllRead = useCallback(async () => {
    const readItems = items.filter((x) => x.is_read);
    if (!readItems.length) return;
    try {
      await dismissAllReadCommentNotifications(items);
      const dismissed = new Set(readItems.map(notificationDismissKey));
      setItems((prev) => prev.filter((x) => !dismissed.has(notificationDismissKey(x))));
    } catch {
      /* ignore */
    }
  }, [items]);

  const openItem = useCallback(
    async (item: SxCommentNotification) => {
      const pid = notificationProjectId(item);
      if (!item.is_read) {
        try {
          await markNotificationReadForItem(item);
          setItems((prev) => prev.map((x) => (x.id === item.id ? { ...x, is_read: true } : x)));
          adjustUnreadCount(-1);
        } catch {
          /* ignore */
        }
      }
      onClose();
      if (pid) onOpenProject(pid);
    },
    [onClose, onOpenProject, adjustUnreadCount],
  );

  const requestPerm = useCallback(async () => {
    const ok = await ensureNotificationPermission();
    if (!ok) setErr('Chưa cấp quyền thông báo — vào Cài đặt hệ thống để bật.');
    else setErr('');
  }, []);

  const groups = useMemo(() => groupNotifications(items), [items]);
  const hasReadItems = items.some((x) => x.is_read);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.header}>
          <Text style={styles.title}>Thông báo</Text>
          <View style={styles.headerActions}>
            <TapHighlight
              style={styles.iconBtn}
              onPress={() => void markAllRead()}
              hitSlop={8}
              accessibilityLabel="Đánh dấu tất cả đã đọc"
            >
              <Ionicons name="checkmark-done-outline" size={18} color={colors.primary} />
            </TapHighlight>
            <TapHighlight style={styles.iconBtn} onPress={() => void requestPerm()} hitSlop={8}>
              <Ionicons name="settings-outline" size={18} color={colors.text} />
            </TapHighlight>
            <TapHighlight style={styles.iconBtn} onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={20} color={colors.text} />
            </TapHighlight>
          </View>
        </View>

        <View style={styles.tabs}>
          {(['all', 'unread'] as TabKey[]).map((key) => {
            const active = tab === key;
            return (
              <TapHighlight
                key={key}
                style={[styles.tabBtn, active && styles.tabBtnActive]}
                onPress={() => setTab(key)}
              >
                <Text style={[styles.tabText, active && styles.tabTextActive]}>
                  {key === 'all' ? 'Tất cả' : 'Chưa đọc'}
                </Text>
              </TapHighlight>
            );
          })}
        </View>

        {err ? (
          <View style={styles.errBox}>
            <Text style={styles.errText}>{err}</Text>
          </View>
        ) : null}

        {loading && !items.length ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 40 }} />
        ) : (
          <ScrollView
            style={styles.list}
            contentContainerStyle={styles.listContent}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.primary} />
            }
          >
            {!items.length ? (
              <View style={styles.emptyWrap}>
                <Ionicons name="notifications-off-outline" size={40} color={colors.textFaint} />
                <Text style={styles.emptyText}>Chưa có thông báo</Text>
              </View>
            ) : (
              groups.map((g) => (
                <View key={g.label}>
                  <Text style={styles.sectionLabel}>{g.label}</Text>
                  {g.items.map((item) => {
                    const code = item.metadata?.project_code;
                    const preview = item.metadata?.comment_preview;
                    const author = item.metadata?.author_name;
                    const dealTitle = item.metadata?.deal_title;
                    const isDeal = isWorkshopDealNotification(item);
                    const iconName = notificationIconName(item);
                    const catLabel = notificationCategoryLabel(item);
                    const actionLabel = notificationActionLabel(item);
                    return (
                      <TapHighlight
                        key={item.id}
                        style={[styles.card, item.is_read ? styles.cardRead : styles.cardUnread]}
                        onPress={() => void openItem(item)}
                      >
                        <View style={styles.cardTop}>
                          <View style={{ position: 'relative' }}>
                            <View style={[styles.iconWrap, !item.is_read && styles.iconWrapUnread, isDeal && styles.iconWrapDeal]}>
                              <Ionicons name={iconName} size={20} color={isDeal ? '#0EA5E9' : colors.primary} />
                            </View>
                            {!item.is_read ? <View style={styles.unreadDot} /> : null}
                          </View>
                          <View style={styles.cardBody}>
                            <View style={styles.metaRow}>
                              <Text style={styles.catText}>
                                {catLabel}{code ? ` · ${code}` : dealTitle ? ` · ${dealTitle}` : ''}
                              </Text>
                              <Text style={styles.timeText}>{timeAgo(item.created_at)}</Text>
                            </View>
                            <Text style={[styles.notifTitle, !item.is_read && styles.notifTitleUnread]} numberOfLines={2}>
                              {isDeal
                                ? item.title.replace(/^[^\s]+\s*/, '').trim() || item.title
                                : author
                                  ? `${author}${code ? ` · ${code}` : ''}`
                                  : item.title.replace(/^💬\s*/, '')}
                            </Text>
                            {!item.is_read ? (
                              <View style={styles.unreadBadge}>
                                <Text style={styles.unreadBadgeText}>CHƯA ĐỌC</Text>
                              </View>
                            ) : null}
                            {preview && !isDeal ? (
                              <View style={styles.previewBox}>
                                <Text style={styles.previewText} numberOfLines={3}>
                                  "{preview}"
                                </Text>
                              </View>
                            ) : (
                              <Text style={styles.notifMsg} numberOfLines={3}>
                                {item.message}
                              </Text>
                            )}
                            <View style={styles.actionRow}>
                              <TapHighlight
                                style={styles.primaryBtn}
                                onPress={() => void openItem(item)}
                              >
                                <Text style={styles.primaryBtnText}>{actionLabel}</Text>
                              </TapHighlight>
                            </View>
                          </View>
                        </View>
                      </TapHighlight>
                    );
                  })}
                </View>
              ))
            )}
          </ScrollView>
        )}

        <View style={styles.footer}>
          <Text style={styles.footerHint}>Bật quyền thông báo để nhận cảnh báo khi có bình luận mới</Text>
          <TapHighlight
            style={styles.footerBtnDanger}
            pressStyle={styles.footerBtnDangerPressed}
            onPress={() => void deleteAllRead()}
            disabled={!hasReadItems}
            android_ripple={{ color: colors.danger + '33', borderless: false }}
          >
            {({ pressed }: { pressed: boolean }) => (
              <Text
                style={[
                  styles.footerBtnDangerText,
                  pressed && hasReadItems && styles.footerBtnDangerTextPressed,
                ]}
              >
                Xóa tất cả thông báo đã đọc
              </Text>
            )}
          </TapHighlight>
        </View>
      </View>
    </Modal>
  );
}
