import Ionicons from '@expo/vector-icons/Ionicons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../api/client';
import { fetchLeadDetail, type LeadDetailRow } from '../api/leadDetail';
import {
  LeadCommentsTab,
  LeadDocumentsTab,
  LeadDriveTab,
  LeadFacebookTab,
  LeadMembersTab,
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
  { key: 'tasks', label: 'Nhiệm vụ', icon: 'checkbox-outline' },
  { key: 'documents', label: 'Tài liệu', icon: 'document-text-outline' },
  { key: 'drive', label: 'Drive', icon: 'cloud-outline' },
  { key: 'comments', label: 'Bình luận', icon: 'chatbubbles-outline' },
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
  const { leadId, code: paramCode, title: paramTitle, kind: paramKind, initialTab } = route.params;
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();

  const [lead, setLead] = useState<LeadDetailRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<LeadDetailTabKey>(
    (initialTab as LeadDetailTabKey) || 'tasks',
  );

  const tabs = useMemo(() => buildTabs(lead), [lead]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const row = await fetchLeadDetail(leadId);
      setLead(row);
    } catch (e) {
      setError(formatApiError(e));
    } finally {
      setLoading(false);
    }
  }, [leadId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!lead) return;
    const ch = resolveInboxChannel(lead);
    if ((activeTab === 'facebook' || activeTab === 'zalo') && activeTab !== ch) {
      setActiveTab('tasks');
    }
  }, [lead, activeTab]);

  const displayCode = lead?.code || paramCode || '';
  const displayTitle = lead?.title || paramTitle || '';
  const displayKind = lead?.type || paramKind || 'lead';
  const kindLabel = displayKind === 'deal' ? 'Deal' : 'Lead';

  const renderTab = () => {
    if (!lead && loading) return null;
    switch (activeTab) {
      case 'tasks':
        return <LeadTasksTab leadId={leadId} companyId={lead?.company_id} />;
      case 'documents':
        return <LeadDocumentsTab leadId={leadId} />;
      case 'drive':
        return lead ? <LeadDriveTab lead={lead} /> : null;
      case 'comments':
        return <LeadCommentsTab leadId={leadId} />;
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
          <ActivityIndicator size="large" color={Colors.blue} />
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
              return (
                <Pressable
                  key={t.key}
                  onPress={() => setActiveTab(t.key)}
                  style={[styles.tabChip, active && styles.tabChipActive]}
                >
                  <Ionicons name={t.icon} size={15} color={active ? Colors.white : Colors.textMuted} />
                  <Text style={[styles.tabChipTxt, active && styles.tabChipTxtActive]}>{t.label}</Text>
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
    tabChipTxt: { fontSize: 13, fontWeight: '600', color: C.textMuted },
    tabChipTxtActive: { color: C.white },
    tabBody: { flex: 1 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.lg },
    loadingHint: { marginTop: 12, color: C.textMuted, fontSize: 14 },
    errorTxt: { color: C.red, textAlign: 'center', marginBottom: 12 },
    retryBtn: { paddingHorizontal: 16, paddingVertical: 8, backgroundColor: C.blueSoft, borderRadius: Radii.md },
    retryTxt: { color: C.blue, fontWeight: '700' },
  });
}
