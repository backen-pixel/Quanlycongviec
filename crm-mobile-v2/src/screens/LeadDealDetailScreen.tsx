import Ionicons from '@expo/vector-icons/Ionicons';
import SpinningLoader from '../components/SpinningLoader';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../api/client';
import {
  fetchLeadCommentReadReceipts,
  fetchLeadCommentsIndex,
  fetchLeadDetail,
  markLeadCommentsRead,
  type LeadDetailRow,
} from '../api/leadDetail';
import { currentUserId, useAuth } from '../context/AuthContext';
import { useCrmRealtimeRefresh } from '../hooks/useCrmRealtimeRefresh';
import { subscribeAppSocket } from '../lib/appSocket';
import {
  LeadCommentsTab,
  LeadDocumentsTab,
  LeadDriveTab,
  LeadFacebookTab,
  LeadInfoTab,
  LeadMembersTab,
  LeadSharedWorkspaceTab,
  LeadTasksTab,
  LeadZaloTab,
  type LeadDetailTabKey,
} from '../components/leadDetail/LeadDetailTabs';
import { resolveInboxChannel } from '../lib/leadInboxChannel';
import type { RootStackParamList } from '../navigation/types';
import { Radii, Spacing, useColors, type ThemeColors } from '../theme';

type Props = NativeStackScreenProps<RootStackParamList, 'LeadDealDetail'>;

type TabDef = { key: LeadDetailTabKey; label: string; icon: keyof typeof Ionicons.glyphMap };

const BASE_TABS: TabDef[] = [
  { key: 'info', label: 'Thông tin', icon: 'information-circle-outline' },
  { key: 'tasks', label: 'Nhiệm vụ', icon: 'checkbox-outline' },
  { key: 'comments', label: 'Bình luận', icon: 'chatbubbles-outline' },
  { key: 'shared-workspace', label: 'Không gian chung', icon: 'people-circle-outline' },
  { key: 'documents', label: 'Tài liệu', icon: 'document-text-outline' },
  { key: 'drive', label: 'Drive', icon: 'cloud-outline' },
  { key: 'members', label: 'Thành viên', icon: 'people-outline' },
];

function buildTabs(lead: LeadDetailRow | null): TabDef[] {
  const ch = resolveInboxChannel(lead);
  const tabs = [...BASE_TABS];
  if (ch === 'facebook') {
    tabs.push({ key: 'facebook', label: 'Facebook', icon: 'logo-facebook' });
  } else if (ch === 'zalo') {
    tabs.push({ key: 'zalo', label: 'Zalo', icon: 'chatbubble-ellipses-outline' });
  }
  return tabs;
}

export default function LeadDealDetailScreen({ route, navigation }: Props) {
  const {
    leadId,
    code: paramCode,
    title: paramTitle,
    kind: paramKind,
    initialTab,
    focusAssignmentId,
    focusTaskId,
  } = route.params;
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const myId = currentUserId(user);

  const [lead, setLead] = useState<LeadDetailRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<LeadDetailTabKey>(
    (initialTab as LeadDetailTabKey) || 'info',
  );
  const [unreadComments, setUnreadComments] = useState(0);
  const [commentTotal, setCommentTotal] = useState(0);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  const tabs = useMemo(() => buildTabs(lead), [lead]);

  const refreshCommentBadge = useCallback(async () => {
    if (!leadId) return;
    try {
      // Luôn dùng index + receipts — không phụ thuộc cache trang comments (có thể chỉ là page 1).
      const [index, receiptsRes] = await Promise.all([
        fetchLeadCommentsIndex([leadId]),
        fetchLeadCommentReadReceipts(leadId),
      ]);
      const row = index[String(leadId)];
      const total = Number(row?.count) || 0;
      setCommentTotal(total);
      const mine = (receiptsRes.receipts || []).find((r) => String(r.user_id) === String(myId || ''));
      const lastRead = mine?.last_read_at;
      const lastAt = row?.last_at;
      const lastUser = row?.last_user_id ? String(row.last_user_id) : '';
      if (!total || !lastAt) {
        setUnreadComments(0);
        return;
      }
      if (lastUser && lastUser === String(myId || '')) {
        setUnreadComments(0);
        return;
      }
      if (lastRead && new Date(lastAt).getTime() <= new Date(lastRead).getTime()) {
        setUnreadComments(0);
        return;
      }
      setUnreadComments(1);
    } catch {
      /* badge optional */
    }
  }, [leadId, myId]);

  const clearCommentBadge = useCallback(async () => {
    setUnreadComments(0);
    try {
      await markLeadCommentsRead(leadId);
    } catch {
      /* ignore */
    }
  }, [leadId]);

  const abortRef = useRef<AbortController | null>(null);
  const loadGenRef = useRef(0);
  const lastDetailLoadAtRef = useRef(0);

  const load = useCallback(async (silent = false) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const gen = ++loadGenRef.current;
    if (!silent) {
      setLoading(true);
      setError(null);
    }
    try {
      const row = await fetchLeadDetail(leadId, ac.signal);
      if (ac.signal.aborted || gen !== loadGenRef.current) return;
      setLead(row);
      lastDetailLoadAtRef.current = Date.now();
    } catch (e) {
      if (ac.signal.aborted || gen !== loadGenRef.current) return;
      if (!silent) setError(formatApiError(e));
    } finally {
      if (!silent && gen === loadGenRef.current) setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void load();
    return () => abortRef.current?.abort();
  }, [load]);

  useEffect(() => {
    void refreshCommentBadge();
  }, [refreshCommentBadge]);

  useCrmRealtimeRefresh(
    useCallback((payload) => {
      // Không reload full detail vì mọi noise CRM / bình luận (socket tab đã xử lý).
      if (payload?.reason === 'lead_comment' || payload?.reason === 'badge_updated') {
        return;
      }
      const detailLead = payload?.detail?.lead_id ?? payload?.detail?.id;
      if (detailLead != null && String(detailLead) !== String(leadId)) return;
      const DETAIL_TTL_MS = 45_000;
      if (Date.now() - lastDetailLoadAtRef.current < DETAIL_TTL_MS) return;
      void load(true);
    }, [leadId, load]),
  );

  useEffect(() => {
    if (!lead) return;
    const ch = resolveInboxChannel(lead);
    if ((activeTab === 'facebook' || activeTab === 'zalo') && activeTab !== ch) {
      setActiveTab('info');
    }
  }, [lead, activeTab]);

  useEffect(() => {
    if (activeTab === 'comments') {
      void clearCommentBadge();
    }
  }, [activeTab, clearCommentBadge]);

  useEffect(() => {
    return subscribeAppSocket((socket) => {
      socket.emit('join:lead', leadId);
      const onComment = (payload?: {
        lead_id?: string;
        action?: string;
        comment?: { id?: number; user_id?: string; user?: { id?: string }; created_at?: string };
      }) => {
        if (String(payload?.lead_id) !== String(leadId)) return;
        const action = payload?.action || 'created';
        if (action === 'deleted') {
          void refreshCommentBadge();
          return;
        }
        if (action === 'created' && payload?.comment?.id) {
          setCommentTotal((n) => n + 1);
          const author = String(payload.comment.user_id || payload.comment.user?.id || '');
          if (activeTabRef.current !== 'comments' && author && author !== String(myId || '')) {
            setUnreadComments((n) => n + 1);
          }
          return;
        }
        void refreshCommentBadge();
      };
      socket.on('lead:comment', onComment);
      return () => {
        socket.emit('leave:lead', leadId);
        socket.off('lead:comment', onComment);
      };
    });
  }, [leadId, myId, refreshCommentBadge]);

  const displayCode = lead?.code || paramCode || '';
  const displayTitle = lead?.title || paramTitle || '';
  const displayKind = lead?.type || paramKind || 'lead';
  const kindLabel = displayKind === 'deal' ? 'Deal' : 'Lead';
  /** Badge đỏ chỉ khi có bình luận mới (chưa đọc). */
  const commentsBadgeCount = unreadComments;

  const renderTab = () => {
    if (!lead && loading) return null;
    switch (activeTab) {
      case 'info':
        return lead ? <LeadInfoTab lead={lead} onUpdated={() => void load(true)} /> : null;
      case 'tasks':
        return (
          <LeadTasksTab
            leadId={leadId}
            companyId={lead?.company_id}
            leadType={lead?.type}
            currentStageId={lead?.stage?.id}
            focusTaskId={focusTaskId}
          />
        );
      case 'shared-workspace':
        return (
          <LeadSharedWorkspaceTab
            leadId={leadId}
            companyId={lead?.company_id}
            leadType={lead?.type}
            focusAssignmentId={focusAssignmentId}
          />
        );
      case 'documents':
        return <LeadDocumentsTab leadId={leadId} />;
      case 'drive':
        return lead ? <LeadDriveTab lead={lead} /> : null;
      case 'comments':
        return (
          <LeadCommentsTab
            leadId={leadId}
            onItemsChange={(n) => setCommentTotal(n)}
            onOpened={() => {
              setUnreadComments(0);
            }}
          />
        );
      case 'members':
        return <LeadMembersTab leadId={leadId} />;
      case 'facebook':
        return <LeadFacebookTab leadId={leadId} companyId={lead?.company_id} />;
      case 'zalo':
        return <LeadZaloTab leadId={leadId} />;
      default:
        return null;
    }
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={Colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <View style={styles.headerRow}>
            <View style={[styles.kindBadge, displayKind === 'deal' && styles.kindBadgeDeal]}>
              <Text style={[styles.kindBadgeTxt, displayKind === 'deal' && styles.kindBadgeTxtDeal]}>{kindLabel}</Text>
            </View>
            {displayCode ? <Text style={styles.headerCode}>{displayCode}</Text> : null}
          </View>
          <Text style={styles.headerTitle} numberOfLines={2}>{displayTitle || 'Chi tiết'}</Text>
          {lead?.stage?.name ? (
            <Text style={styles.headerStage} numberOfLines={1}>{lead.stage.name}</Text>
          ) : null}
        </View>
        <Pressable onPress={() => void load()} hitSlop={8} style={styles.refreshBtn}>
          <Ionicons name="refresh-outline" size={22} color={Colors.textMuted} />
        </Pressable>
      </View>

      {loading && !lead ? (
        <View style={styles.center}>
          <SpinningLoader size="large" color={Colors.blue} />
          <Text style={styles.loadingHint}>Đang tải chi tiết…</Text>
        </View>
      ) : error && !lead ? (
        <View style={styles.center}>
          <Text style={styles.errorTxt}>{error}</Text>
          <Pressable onPress={() => void load()} style={styles.retryBtn}>
            <Text style={styles.retryTxt}>Thử lại</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabBar}
            contentContainerStyle={styles.tabBarContent}
          >
            {tabs.map((t) => {
              const active = activeTab === t.key;
              const showBadge = t.key === 'comments' && commentsBadgeCount > 0;
              return (
                <Pressable
                  key={t.key}
                  onPress={() => setActiveTab(t.key)}
                  style={[styles.tabChip, active && styles.tabChipActive]}
                >
                  <View style={styles.tabChipInner}>
                    <Ionicons name={t.icon} size={15} color={active ? Colors.white : Colors.textMuted} />
                    <Text style={[styles.tabChipTxt, active && styles.tabChipTxtActive]}>{t.label}</Text>
                    {showBadge ? (
                      <View style={[styles.tabBadge, styles.tabBadgeNew]}>
                        <Text style={styles.tabBadgeTxt}>
                          {commentsBadgeCount > 99 ? '99+' : String(commentsBadgeCount)}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.tabBody}>{renderTab()}</View>
        </>
      )}
    </View>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    root: { flex: 1, backgroundColor: C.bg },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      paddingHorizontal: Spacing.md,
      paddingBottom: Spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: C.borderSoft,
    },
    backBtn: { paddingTop: 4 },
    refreshBtn: { paddingTop: 4 },
    headerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    kindBadge: {
      backgroundColor: C.blueSoft,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: Radii.sm,
    },
    kindBadgeDeal: { backgroundColor: C.orangeSoft },
    kindBadgeTxt: { fontSize: 11, fontWeight: '700', color: C.blue },
    kindBadgeTxtDeal: { color: C.orange },
    headerCode: { fontSize: 13, fontWeight: '700', color: C.cyan },
    headerTitle: { fontSize: 17, fontWeight: '700', color: C.text, marginTop: 4 },
    headerStage: { fontSize: 12, color: C.textMuted, marginTop: 2 },
    tabBar: { maxHeight: 52, borderBottomWidth: 1, borderBottomColor: C.borderSoft },
    tabBarContent: { paddingHorizontal: Spacing.sm, paddingVertical: 8, gap: 8, flexDirection: 'row' },
    tabChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: Radii.lg,
      backgroundColor: C.card,
      borderWidth: 1,
      borderColor: C.borderSoft,
    },
    tabChipActive: { backgroundColor: C.blue, borderColor: C.blue },
    tabChipInner: { flexDirection: 'row', alignItems: 'center', gap: 5 },
    tabChipTxt: { fontSize: 13, fontWeight: '600', color: C.textMuted },
    tabChipTxtActive: { color: C.white },
    tabBadge: {
      minWidth: 18,
      height: 18,
      paddingHorizontal: 5,
      borderRadius: 99,
      backgroundColor: C.textFaint,
      alignItems: 'center',
      justifyContent: 'center',
    },
    tabBadgeNew: { backgroundColor: C.red },
    tabBadgeTxt: { color: '#fff', fontSize: 10, fontWeight: '900', lineHeight: 12 },
    tabBody: { flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
    loadingHint: { marginTop: 12, color: C.textMuted, fontSize: 14 },
    errorTxt: { color: C.red, textAlign: 'center', marginBottom: 12 },
    retryBtn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: C.blueSoft, borderRadius: Radii.md },
    retryTxt: { color: C.blue, fontWeight: '700' },
  });
}
