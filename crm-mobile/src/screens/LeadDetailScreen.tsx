import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  FlatList,
  Pressable,
  ScrollView,
  TextInput,
  Alert,
  Platform,
  Linking,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../api/client';
import { API_ORIGIN } from '../config';
import type { CrmActivity, CrmDocument, CrmLeadDetail, CrmLeadMember, CrmLeadMessage, CrmStage } from '../types/crm';
import type { CrmStackParamList } from '../navigation/types';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { formatDate, formatDateTime, formatVND } from '../lib/formatUtils';
import { openWebPath } from '../lib/openWeb';
import CrmTasksPanel from '../components/CrmTasksPanel';
import CrmVoiceRecordingsPanel from '../components/CrmVoiceRecordingsPanel';

type R = RouteProp<CrmStackParamList, 'LeadDetail'>;
type Nav = NativeStackNavigationProp<CrmStackParamList, 'LeadDetail'>;

type TabKey = 'tasks' | 'documents' | 'activities' | 'notes' | 'team' | 'chat' | 'voice';

const MEMBER_ROLE_VI: Record<string, string> = {
  responsible: 'Chịu trách nhiệm',
  member: 'Tham gia',
  supervisor: 'Giám sát',
  viewer: 'Xem',
};

function chatFileUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${API_ORIGIN}${path.startsWith('/') ? '' : '/'}${path}`;
}

type CustForm = {
  full_name: string;
  phone: string;
  email: string;
  address: string;
  company: string;
  tax_code: string;
};

function emptyCust(): CustForm {
  return { full_name: '', phone: '', email: '', address: '', company: '', tax_code: '' };
}

export default function LeadDetailScreen() {
  const { params } = useRoute<R>();
  const navigation = useNavigation<Nav>();
  const { id } = params;

  const [lead, setLead] = useState<CrmLeadDetail | null>(null);
  const [stagesLead, setStagesLead] = useState<CrmStage[]>([]);
  const [stagesDeal, setStagesDeal] = useState<CrmStage[]>([]);
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [documents, setDocuments] = useState<CrmDocument[]>([]);
  const [taskCount, setTaskCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>('tasks');
  const [savingStage, setSavingStage] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [pendingStageId, setPendingStageId] = useState<string | null>(null);
  const [stagePickerOpen, setStagePickerOpen] = useState(false);

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  const [cust, setCust] = useState<CustForm>(emptyCust);
  const [savingCust, setSavingCust] = useState(false);
  const [converting, setConverting] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [members, setMembers] = useState<CrmLeadMember[]>([]);
  const [messages, setMessages] = useState<CrmLeadMessage[]>([]);
  const [chatDraft, setChatDraft] = useState('');
  const [chatSending, setChatSending] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);

  const load = useCallback(async () => {
    setErr('');
    setLoading(true);
    try {
      const [detailRes, actRes, docRes, stL, stD] = await Promise.all([
        api.get<CrmLeadDetail>(`/crm/leads/${id}/detail`),
        api.get<CrmActivity[]>(`/crm/leads/${id}/activities`).catch(() => ({ data: [] })),
        api.get<CrmDocument[]>(`/crm/leads/${id}/documents`).catch(() => ({ data: [] })),
        api.get<CrmStage[]>('/crm/pipeline-stages', { params: { type: 'lead' } }).catch(() => ({ data: [] })),
        api.get<CrmStage[]>('/crm/pipeline-stages', { params: { type: 'deal' } }).catch(() => ({ data: [] })),
      ]);
      const L = detailRes.data;
      setLead(L);
      setTitleDraft(L?.title || '');
      const k = L?.customer;
      setCust({
        full_name: k?.full_name || '',
        phone: k?.phone || '',
        email: k?.email || '',
        address: k?.address || '',
        company: k?.company || '',
        tax_code: k?.tax_code || '',
      });
      setActivities(Array.isArray(actRes.data) ? actRes.data : []);
      setDocuments(Array.isArray(docRes.data) ? docRes.data : []);
      setStagesLead(Array.isArray(stL.data) ? stL.data : []);
      setStagesDeal(Array.isArray(stD.data) ? stD.data : []);
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (e as Error)?.message ||
        'Không tải được chi tiết.';
      setErr(String(msg));
      setLead(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const stages = useMemo(() => {
    if (!lead?.type) return [];
    return lead.type === 'deal' ? stagesDeal : stagesLead;
  }, [lead?.type, stagesDeal, stagesLead]);

  const sortedStages = useMemo(() => {
    return [...stages].sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0));
  }, [stages]);

  const currentStageIdx = useMemo(() => {
    if (!lead?.stage_id) return -1;
    return sortedStages.findIndex((s) => s.id === lead.stage_id);
  }, [lead?.stage_id, sortedStages]);

  const noteActivities = useMemo(
    () => (activities || []).filter((a) => a.type === 'note'),
    [activities],
  );
  const pipelineActivities = useMemo(
    () => (activities || []).filter((a) => a.type !== 'note'),
    [activities],
  );

  const loadMembers = useCallback(async () => {
    try {
      const { data } = await api.get<CrmLeadMember[]>(`/crm/leads/${id}/members`);
      setMembers(Array.isArray(data) ? data : []);
    } catch {
      setMembers([]);
    }
  }, [id]);

  const loadChat = useCallback(async () => {
    try {
      const { data } = await api.get<CrmLeadMessage[]>(`/crm/leads/${id}/chat`);
      setMessages(Array.isArray(data) ? data : []);
    } catch {
      setMessages([]);
    }
  }, [id]);

  useEffect(() => {
    if (activeTab === 'team') void loadMembers();
  }, [activeTab, loadMembers]);

  useEffect(() => {
    if (activeTab === 'chat') void loadChat();
  }, [activeTab, loadChat]);

  const applyStage = async (stageId: string, lost?: string) => {
    setSavingStage(true);
    try {
      await api.patch(`/crm/leads/${id}/stage`, {
        stage_id: stageId,
        ...(lost ? { lost_reason: lost } : {}),
      });
      await load();
      setStagePickerOpen(false);
    } catch (e: unknown) {
      const body = (e as { response?: { data?: { error?: string; requires_conversion?: boolean } } })?.response?.data;
      const msg = body?.error || 'Không cập nhật được giai đoạn.';
      if (body?.requires_conversion) {
        Alert.alert('Chuyển Deal', String(msg));
        return;
      }
      Alert.alert('Lỗi', String(msg));
    } finally {
      setSavingStage(false);
      setLostOpen(false);
      setPendingStageId(null);
      setLostReason('');
    }
  };

  const onPickStage = (stage: CrmStage) => {
    if (!lead || stage.id === lead.stage_id) {
      setStagePickerOpen(false);
      return;
    }
    if (stage.is_lost) {
      setPendingStageId(stage.id);
      setLostReason('');
      setLostOpen(true);
      return;
    }
    void applyStage(stage.id);
  };

  const confirmLost = () => {
    if (!lostReason.trim() || !pendingStageId) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập lý do thua.');
      return;
    }
    void applyStage(pendingStageId, lostReason.trim());
  };

  const saveTitle = async () => {
    if (!titleDraft.trim()) return;
    setSavingTitle(true);
    try {
      const { data } = await api.put<CrmLeadDetail>(`/crm/leads/${id}`, { title: titleDraft.trim() });
      setLead((prev) => (prev ? { ...prev, ...data } : data));
      setEditingTitle(false);
    } catch (e: unknown) {
      Alert.alert('Lỗi', (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không lưu được');
    } finally {
      setSavingTitle(false);
    }
  };

  const saveCustomer = async () => {
    const cid = lead?.customer?.id;
    if (!cid) {
      Alert.alert('Khách hàng', 'Chưa có khách hàng để cập nhật.');
      return;
    }
    setSavingCust(true);
    try {
      const { data } = await api.put(`/customers/${cid}`, {
        full_name: cust.full_name.trim() || null,
        phone: cust.phone.trim() || null,
        email: cust.email.trim() || null,
        address: cust.address.trim() || null,
        company: cust.company.trim() || null,
        tax_code: cust.tax_code.trim() || null,
      });
      setLead((prev) => (prev ? { ...prev, customer: { ...prev.customer, ...data } } : prev));
      Alert.alert('Đã lưu', 'Đã cập nhật khách hàng.');
    } catch (e: unknown) {
      Alert.alert('Lỗi', (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không lưu được');
    } finally {
      setSavingCust(false);
    }
  };

  const convertToDeal = () => {
    Alert.alert('Chuyển sang Deal', 'Lead sẽ chuyển thành Deal (pipeline deal). Tiếp tục?', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Chuyển',
        onPress: async () => {
          setConverting(true);
          try {
            await api.post(`/crm/leads/${id}/convert-to-deal`, {
              company_id: lead?.company_id || undefined,
            });
            await load();
            Alert.alert('Thành công', 'Đã chuyển sang Deal.');
          } catch (e: unknown) {
            Alert.alert('Lỗi', (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không chuyển được');
          } finally {
            setConverting(false);
          }
        },
      },
    ]);
  };

  const pickAndUploadDoc = async () => {
    const pick = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true, multiple: false });
    if (pick.canceled || !pick.assets?.[0]) return;
    const asset = pick.assets[0];
    setUploadingDoc(true);
    try {
      const form = new FormData();
      form.append('files', {
        uri: asset.uri,
        name: asset.name || 'file',
        type: asset.mimeType || 'application/octet-stream',
      } as unknown as Blob);
      const { data: up } = await api.post<{ files: { file_url?: string; file_name?: string; file_size?: number; mime_type?: string }[] }>(
        '/upload',
        form,
      );
      const uploaded = up?.files || [];
      const items = uploaded
        .filter((u) => u.file_url)
        .map((upf) => ({
          name: (upf.file_name || 'Tài liệu').replace(/\.[^.]+$/, ''),
          doc_type: (upf.mime_type || '').startsWith('image/') ? 'image' : 'other',
          file_url: upf.file_url,
          file_name: upf.file_name,
          file_size: upf.file_size,
          mime_type: upf.mime_type,
        }));
      if (!items.length) throw new Error('Upload không trả về file_url');
      const { data: newDocs } = await api.post<CrmDocument[]>(`/crm/leads/${id}/documents/bulk`, { items });
      setDocuments((prev) => [...(newDocs || []), ...prev]);
    } catch (e: unknown) {
      Alert.alert('Lỗi', (e as { response?: { data?: { error?: string } } })?.response?.data?.error || (e as Error).message || 'Upload lỗi');
    } finally {
      setUploadingDoc(false);
    }
  };

  const removeDoc = (doc: CrmDocument) => {
    Alert.alert('Xóa tài liệu', doc.name || 'Tài liệu', [
      { text: 'Hủy', style: 'cancel' },
      {
        text: 'Xóa',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.delete(`/crm/leads/${id}/documents/${doc.id}`);
            setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
          } catch {
            Alert.alert('Lỗi', 'Không xóa được.');
          }
        },
      },
    ]);
  };

  const addNote = async () => {
    if (!noteDraft.trim()) return;
    setNoteSaving(true);
    try {
      const desc = noteDraft.trim();
      const titleLine = desc.split('\n')[0].slice(0, 120) || 'Ghi chú';
      const { data } = await api.post<CrmActivity>(`/crm/leads/${id}/activities`, {
        type: 'note',
        title: titleLine,
        description: desc,
      });
      setActivities((prev) => [data, ...prev]);
      setNoteDraft('');
    } catch (e: unknown) {
      Alert.alert('Lỗi', (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không lưu được ghi chú');
    } finally {
      setNoteSaving(false);
    }
  };

  const sendChat = async () => {
    const t = chatDraft.trim();
    if (!t) return;
    setChatSending(true);
    try {
      await api.post(`/crm/leads/${id}/chat`, { content: t });
      setChatDraft('');
      await loadChat();
    } catch (e: unknown) {
      Alert.alert('Lỗi', (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không gửi được tin');
    } finally {
      setChatSending(false);
    }
  };

  if (loading && !lead) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={CrmColors.blue600} />
        </View>
      </SafeAreaView>
    );
  }

  if (err && !lead) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centered}>
          <Text style={styles.err}>{err}</Text>
          <TouchableOpacity style={styles.retry} onPress={load}>
            <Text style={styles.retryText}>Thử lại</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  if (!lead) return null;

  const c = lead.customer;
  const isDeal = lead.type === 'deal';
  const canConvert = !isDeal;
  const leadTypeTab: 'lead' | 'deal' = isDeal ? 'deal' : 'lead';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.topBar}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backTxt}>←</Text>
        </TouchableOpacity>
        <Text style={styles.topBarTitle} numberOfLines={1}>
          Chi tiết
        </Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {err ? (
          <View style={styles.errBanner}>
            <Text style={styles.errBannerTxt}>{err}</Text>
          </View>
        ) : null}

        <View style={styles.hero}>
          <View style={styles.badgeRow}>
            <View style={[styles.typeBadge, isDeal ? styles.typeDeal : styles.typeLead]}>
              <Text style={[styles.typeBadgeTxt, isDeal ? styles.typeDealTxt : styles.typeLeadTxt]}>
                {isDeal ? '🎯 DEAL' : '💼 LEAD'}
              </Text>
            </View>
            <Text
              style={[
                styles.codeMono,
                { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
              ]}
            >
              {lead.code}
            </Text>
          </View>
          {editingTitle ? (
            <View style={styles.titleEditRow}>
              <TextInput style={styles.titleInput} value={titleDraft} onChangeText={setTitleDraft} />
              <TouchableOpacity style={styles.iconBtn} onPress={() => void saveTitle()} disabled={savingTitle}>
                <Text style={styles.iconBtnTxt}>{savingTitle ? '…' : 'Lưu'}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconBtnSec}
                onPress={() => {
                  setTitleDraft(lead.title || '');
                  setEditingTitle(false);
                }}
              >
                <Text style={styles.iconBtnSecTxt}>Hủy</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View style={styles.titleRow}>
              <Text style={styles.heroTitle}>{lead.title || '—'}</Text>
              <TouchableOpacity onPress={() => setEditingTitle(true)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.editHint}>✎</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={[styles.actionsCard, CrmShadow.card]}>
          <Text style={styles.actionsH}>Thao tác nhanh</Text>
          <View style={styles.actionsGrid}>
            <TouchableOpacity style={styles.actBtnAmber} onPress={() => openWebPath(`/crm/quotations/new?lead_id=${id}`)}>
              <Text style={styles.actBtnTxt}>📄 Báo giá</Text>
            </TouchableOpacity>
            {isDeal && lead.project_id ? (
              <>
                <TouchableOpacity style={styles.actBtnTeal} onPress={() => openWebPath(`/sx/projects/${lead.project_id}`)}>
                  <Text style={styles.actBtnTxtDark}>🏭 Xưởng / SX</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.actBtnEmerald} onPress={() => openWebPath(`/projects/${lead.project_id}`)}>
                  <Text style={styles.actBtnTxtDark}>📁 Dự án</Text>
                </TouchableOpacity>
              </>
            ) : null}
            {isDeal && !lead.project_id ? (
              <TouchableOpacity style={styles.actBtnIndigo} onPress={() => openWebPath(`/projects/create?deal_id=${id}`)}>
                <Text style={styles.actBtnTxt}>Tạo dự án</Text>
              </TouchableOpacity>
            ) : null}
            {canConvert ? (
              <TouchableOpacity style={styles.actBtnGreen} onPress={() => void convertToDeal()} disabled={converting}>
                <Text style={styles.actBtnTxt}>{converting ? '…' : '⚡ Chuyển Deal'}</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {lead.lost_reason ? (
          <View style={styles.lostBanner}>
            <Text style={styles.lostEmoji}>❌</Text>
            <View style={{ flex: 1 }}>
              <View style={styles.lostRow}>
                <Text style={styles.lostLabel}>THUA / MẤT</Text>
                <View style={styles.lostChip}>
                  <Text style={styles.lostChipTxt}>Đã kết thúc</Text>
                </View>
              </View>
              <Text style={styles.lostReason}>Lý do: {lead.lost_reason}</Text>
              {lead.lost_at ? (
                <Text style={styles.lostAt}>Vào lúc {formatDateTime(lead.lost_at)}</Text>
              ) : null}
            </View>
          </View>
        ) : null}

        <View style={[styles.panel, CrmShadow.card]}>
          <Text style={styles.panelHint}>Pipeline — chạm bước để chuyển</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.stepperRow}>
            {sortedStages.map((s, i) => {
              const isCurrent = s.id === lead.stage_id;
              const isPast = currentStageIdx >= 0 && i < currentStageIdx;
              const bg = isCurrent ? s.color || CrmColors.blue600 : undefined;
              return (
                <View key={s.id} style={styles.stepWrap}>
                  <View style={styles.stepCol}>
                    <TouchableOpacity
                      onPress={() => onPickStage(s)}
                      disabled={savingStage}
                      style={[
                        styles.stepCircle,
                        isPast && styles.stepCirclePast,
                        isCurrent && styles.stepCircleCurrent,
                        !isPast && !isCurrent && styles.stepCircleFuture,
                        isCurrent && bg ? { backgroundColor: bg } : null,
                      ]}
                      activeOpacity={0.8}
                    >
                      <Text
                        style={[
                          styles.stepCircleTxt,
                          isPast && styles.stepCircleTxtPast,
                          isCurrent && styles.stepCircleTxtOn,
                          !isPast && !isCurrent && styles.stepCircleTxtFut,
                        ]}
                      >
                        {isPast ? '✓' : s.icon || String(i + 1)}
                      </Text>
                    </TouchableOpacity>
                    <Text
                      style={[styles.stepName, isCurrent && styles.stepNameOn, isPast && styles.stepNamePast]}
                      numberOfLines={3}
                    >
                      {s.name}
                    </Text>
                  </View>
                  {i < sortedStages.length - 1 ? (
                    <View style={styles.stepLineWrap}>
                      <View style={[styles.stepLine, isPast ? styles.stepLinePast : styles.stepLineFut]} />
                    </View>
                  ) : null}
                </View>
              );
            })}
          </ScrollView>
          <TouchableOpacity style={styles.moreStageBtn} onPress={() => setStagePickerOpen(true)}>
            <Text style={styles.moreStageTxt}>Danh sách giai đoạn…</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.statsRow}>
          <View style={[styles.statBox, styles.statBlue]}>
            <Text style={styles.statLabel}>Hoạt động</Text>
            <Text style={styles.statValBlue}>{pipelineActivities.length}</Text>
          </View>
          <View style={[styles.statBox, styles.statIndigo]}>
            <Text style={styles.statLabel}>Ghi chú</Text>
            <Text style={styles.statValIndigo}>{noteActivities.length}</Text>
          </View>
          <View style={[styles.statBox, styles.statAmber]}>
            <Text style={styles.statLabel}>Tài liệu</Text>
            <Text style={styles.statValAmber}>{documents.length}</Text>
          </View>
          <View style={[styles.statBox, styles.statPurple]}>
            <Text style={styles.statLabel}>Công việc</Text>
            <Text style={styles.statValPurple}>{taskCount}</Text>
          </View>
        </View>

        <View style={[styles.card, CrmShadow.card]}>
          <Text style={styles.cardH}>Khách hàng</Text>
          {!c?.id ? (
            <Text style={styles.muted}>Chưa gán khách hàng — tạo trên web hoặc thêm từ CRM web.</Text>
          ) : (
            <>
              <FieldInp label="👤 Tên" value={cust.full_name} onChange={(t) => setCust((p) => ({ ...p, full_name: t }))} />
              <FieldInp label="📞 SĐT" value={cust.phone} onChange={(t) => setCust((p) => ({ ...p, phone: t }))} keyboard="phone-pad" />
              <FieldInp label="✉️ Email" value={cust.email} onChange={(t) => setCust((p) => ({ ...p, email: t }))} keyboard="email-address" />
              <View style={styles.divider} />
              <FieldInp label="📍 Địa chỉ" value={cust.address} onChange={(t) => setCust((p) => ({ ...p, address: t }))} />
              <FieldInp label="🏢 Công ty" value={cust.company} onChange={(t) => setCust((p) => ({ ...p, company: t }))} />
              <FieldInp label="🧾 MST" value={cust.tax_code} onChange={(t) => setCust((p) => ({ ...p, tax_code: t }))} />
              <TouchableOpacity style={styles.saveCust} onPress={() => void saveCustomer()} disabled={savingCust}>
                <Text style={styles.saveCustTxt}>{savingCust ? 'Đang lưu…' : 'Lưu khách hàng'}</Text>
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={[styles.card, CrmShadow.card]}>
          <Text style={styles.cardH}>Thông tin</Text>
          <InfoRow label="Giá trị" value={formatVND(lead.estimated_value)} />
          <InfoRow label="Ngày tạo" value={formatDate(lead.created_at)} />
          <InfoRow
            label="Nguồn"
            value={
              lead.source?.name ? `${lead.source.icon || ''} ${lead.source.name}`.trim() : undefined
            }
          />
          <InfoRow label="Phụ trách" value={lead.assignee?.full_name || lead.lead_owner?.full_name} />
          <InfoRow label="Giai đoạn" value={lead.stage?.name} />
        </View>

        <View style={[styles.tabsBar, CrmShadow.card]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
            {(
              [
                ['tasks', '✅ Công việc'],
                ['documents', '📄 Tài liệu'],
                ['activities', '📋 Hoạt động'],
                ['notes', '📝 Ghi chú'],
                ['team', '👥 Nhóm'],
                ['chat', '💬 Chat'],
                ['voice', '🎙 Ghi âm'],
              ] as const
            ).map(([key, label]) => (
              <TouchableOpacity
                key={key}
                style={[styles.tabItem, activeTab === key && styles.tabItemOn]}
                onPress={() => setActiveTab(key)}
              >
                <Text style={[styles.tabTxt, activeTab === key && styles.tabTxtOn]}>{label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        <View style={[styles.tabBody, CrmShadow.card]}>
          {activeTab === 'tasks' && (
            <CrmTasksPanel leadId={id} leadType={leadTypeTab} onCountChange={setTaskCount} />
          )}
          {activeTab === 'documents' && (
            <View>
              <TouchableOpacity style={styles.uploadBtn} onPress={() => void pickAndUploadDoc()} disabled={uploadingDoc}>
                <Text style={styles.uploadBtnTxt}>{uploadingDoc ? 'Đang tải…' : '📎 Thêm tệp'}</Text>
              </TouchableOpacity>
              {documents.length === 0 ? (
                <Text style={styles.muted}>Chưa có tài liệu.</Text>
              ) : (
                documents.map((d) => (
                  <View key={d.id} style={styles.rowItem}>
                    <TouchableOpacity
                      style={{ flex: 1 }}
                      onPress={() => d.file_url && void Linking.openURL(d.file_url)}
                      disabled={!d.file_url}
                    >
                      <Text style={styles.rowTitle}>{d.name || '—'}</Text>
                      {d.doc_type ? <Text style={styles.rowSub}>{d.doc_type}</Text> : null}
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => removeDoc(d)}>
                      <Text style={styles.delDoc}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))
              )}
            </View>
          )}
          {activeTab === 'activities' && (
            <View>
              {pipelineActivities.length === 0 ? (
                <Text style={styles.muted}>Chưa có hoạt động (gọi, gặp…). Ghi chú nằm ở tab Ghi chú.</Text>
              ) : (
                pipelineActivities.slice(0, 60).map((a) => (
                  <View key={a.id} style={styles.rowItem}>
                    <Text style={styles.rowTitle}>{a.title || a.type || 'Hoạt động'}</Text>
                    <Text style={styles.rowSub}>
                      {formatDateTime(a.activity_date)}
                      {a.creator?.full_name ? ` · ${a.creator.full_name}` : ''}
                    </Text>
                  </View>
                ))
              )}
            </View>
          )}
          {activeTab === 'notes' && (
            <View>
              <TextInput
                style={styles.noteComposer}
                placeholder="Viết ghi chú… (xuống dòng được)"
                placeholderTextColor={CrmColors.gray400}
                value={noteDraft}
                onChangeText={setNoteDraft}
                multiline
                textAlignVertical="top"
              />
              <TouchableOpacity
                style={[styles.noteSendBtn, (!noteDraft.trim() || noteSaving) && styles.noteSendBtnOff]}
                onPress={() => void addNote()}
                disabled={!noteDraft.trim() || noteSaving}
              >
                <Text style={styles.noteSendTxt}>{noteSaving ? 'Đang lưu…' : 'Lưu ghi chú'}</Text>
              </TouchableOpacity>
              {noteActivities.length === 0 ? (
                <Text style={styles.muted}>Chưa có ghi chú.</Text>
              ) : (
                noteActivities.map((a) => (
                  <View key={a.id} style={styles.noteCard}>
                    <Text style={styles.noteMeta}>
                      {formatDateTime(a.activity_date)}
                      {a.creator?.full_name ? ` · ${a.creator.full_name}` : ''}
                    </Text>
                    <Text style={styles.noteBody}>{a.description || a.title || '—'}</Text>
                  </View>
                ))
              )}
            </View>
          )}
          {activeTab === 'team' && (
            <View>
              <Text style={styles.teamHint}>Thêm / sửa thành viên chi tiết trên web.</Text>
              <TouchableOpacity style={styles.webLinkBtn} onPress={() => openWebPath(`/crm/leads/${id}`)}>
                <Text style={styles.webLinkBtnTxt}>Quản lý thành viên trên web</Text>
              </TouchableOpacity>
              {members.length === 0 ? (
                <Text style={styles.muted}>Chưa có thành viên hoặc chưa tải được.</Text>
              ) : (
                members.map((m) => (
                  <View key={m.user_id} style={styles.teamRow}>
                    <View style={styles.teamAvatar}>
                      <Text style={styles.teamAvatarTxt}>{(m.user?.full_name || '?')[0].toUpperCase()}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{m.user?.full_name || m.user_id}</Text>
                      <Text style={styles.rowSub}>{MEMBER_ROLE_VI[m.role || ''] || m.role || '—'}</Text>
                    </View>
                  </View>
                ))
              )}
            </View>
          )}
          {activeTab === 'voice' && (
            <CrmVoiceRecordingsPanel leadId={id} customerPhone={lead?.customer?.phone} />
          )}
          {activeTab === 'chat' && (
            <View>
              <TouchableOpacity style={styles.webLinkBtn} onPress={() => openWebPath(`/crm/leads/${id}?tab=chat`)}>
                <Text style={styles.webLinkBtnTxt}>Mở chat đầy đủ (file, reply — web)</Text>
              </TouchableOpacity>
              <ScrollView style={styles.chatList} nestedScrollEnabled>
                {messages.length === 0 ? (
                  <Text style={styles.muted}>Chưa có tin nhắn.</Text>
                ) : (
                  messages.map((msg) => {
                    const who = msg.user?.full_name || (msg.is_system ? 'Hệ thống' : '—');
                    const att = chatFileUrl(msg.attachment_url);
                    return (
                      <View key={msg.id} style={[styles.chatBubble, msg.is_system && styles.chatBubbleSys]}>
                        <Text style={styles.chatWho}>{who}</Text>
                        <Text style={styles.chatTime}>{formatDateTime(msg.created_at)}</Text>
                        {msg.content ? <Text style={styles.chatText}>{msg.content}</Text> : null}
                        {att ? (
                          <TouchableOpacity onPress={() => void Linking.openURL(att)}>
                            <Text style={styles.chatAttach}>{msg.attachment_name || '📎 Tệp đính kèm'}</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    );
                  })
                )}
              </ScrollView>
              <View style={styles.chatInputRow}>
                <TextInput
                  style={styles.chatInput}
                  placeholder="Nhập tin nhắn…"
                  placeholderTextColor={CrmColors.gray400}
                  value={chatDraft}
                  onChangeText={setChatDraft}
                  multiline
                  maxLength={4000}
                />
                <TouchableOpacity
                  style={[styles.chatSend, (!chatDraft.trim() || chatSending) && styles.chatSendOff]}
                  onPress={() => void sendChat()}
                  disabled={!chatDraft.trim() || chatSending}
                >
                  <Text style={styles.chatSendTxt}>{chatSending ? '…' : 'Gửi'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        <Text style={styles.webHint}>
          Facebook, Zalo OA, báo giá PDF… — mở trên web. Ghi âm micro có tại tab Ghi âm. Toast thông báo khi có tin mới
          (socket).
        </Text>
      </ScrollView>

      <Modal visible={lostOpen} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.lostSheet}>
            <Text style={styles.lostSheetTitle}>Lý do thua / mất</Text>
            <TextInput
              style={styles.lostInput}
              placeholder="Nhập lý do…"
              placeholderTextColor={CrmColors.gray400}
              value={lostReason}
              onChangeText={setLostReason}
              multiline
            />
            <View style={styles.lostActions}>
              <TouchableOpacity style={styles.lostCancel} onPress={() => setLostOpen(false)}>
                <Text style={styles.lostCancelTxt}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.lostOk} onPress={confirmLost}>
                <Text style={styles.lostOkTxt}>Xác nhận</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={stagePickerOpen} animationType="slide" transparent>
        <Pressable style={styles.modalBackdrop} onPress={() => !savingStage && setStagePickerOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Chọn giai đoạn</Text>
            <FlatList
              data={sortedStages}
              keyExtractor={(s) => s.id}
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.sheetRow} onPress={() => onPickStage(item)} disabled={savingStage}>
                  <View style={[styles.sheetDot, { backgroundColor: item.color || '#94a3b8' }]} />
                  <Text style={styles.sheetName}>{item.name}</Text>
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.sheetClose} onPress={() => setStagePickerOpen(false)}>
              <Text style={styles.sheetCloseTxt}>Đóng</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.fieldValue}>{value && String(value).trim() ? value : '—'}</Text>
    </View>
  );
}

function FieldInp({
  label,
  value,
  onChange,
  keyboard,
}: {
  label: string;
  value: string;
  onChange: (t: string) => void;
  keyboard?: 'phone-pad' | 'email-address';
}) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.custInput}
        value={value}
        onChangeText={onChange}
        keyboardType={keyboard === 'phone-pad' ? 'phone-pad' : keyboard === 'email-address' ? 'email-address' : 'default'}
        autoCapitalize={keyboard === 'email-address' ? 'none' : 'sentences'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: CrmColors.pageBg },
  scroll: { paddingHorizontal: 16, paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  err: { color: CrmColors.red700, marginBottom: 12, textAlign: 'center' },
  retry: { backgroundColor: CrmColors.blue600, paddingHorizontal: 20, paddingVertical: 10, borderRadius: CrmRadii.md },
  retryText: { color: CrmColors.white, fontWeight: '600' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: CrmColors.gray200,
    backgroundColor: CrmColors.white,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  backTxt: { fontSize: 22, color: CrmColors.gray900 },
  topBarTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700', color: CrmColors.gray900 },
  errBanner: {
    backgroundColor: CrmColors.red50,
    borderWidth: 1,
    borderColor: CrmColors.red200,
    padding: 10,
    borderRadius: CrmRadii.md,
    marginBottom: 12,
  },
  errBannerTxt: { color: CrmColors.red800, fontSize: 13 },
  hero: { marginBottom: 12 },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: CrmRadii.full },
  typeLead: { backgroundColor: CrmColors.blue100 },
  typeDeal: { backgroundColor: CrmColors.purple100 },
  typeBadgeTxt: { fontSize: 11, fontWeight: '800' },
  typeLeadTxt: { color: CrmColors.blue700 },
  typeDealTxt: { color: CrmColors.purple700 },
  codeMono: { fontSize: 12, color: CrmColors.gray500 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  heroTitle: { flex: 1, fontSize: 22, fontWeight: '700', color: CrmColors.gray900 },
  editHint: { fontSize: 18, color: CrmColors.blue600 },
  titleEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  titleInput: {
    flex: 1,
    minWidth: 160,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    borderRadius: CrmRadii.md,
    padding: 10,
    fontSize: 16,
    fontWeight: '600',
    color: CrmColors.gray900,
    backgroundColor: CrmColors.white,
  },
  iconBtn: { backgroundColor: CrmColors.emerald600, paddingHorizontal: 14, paddingVertical: 10, borderRadius: CrmRadii.md },
  iconBtnTxt: { color: CrmColors.white, fontWeight: '700' },
  iconBtnSec: { paddingHorizontal: 12, paddingVertical: 10 },
  iconBtnSecTxt: { color: CrmColors.gray600, fontWeight: '600' },
  actionsCard: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.xl,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 14,
    marginBottom: 12,
  },
  actionsH: { fontSize: 12, fontWeight: '800', color: CrmColors.gray600, marginBottom: 10 },
  actionsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actBtnAmber: { backgroundColor: CrmColors.amber500, paddingHorizontal: 12, paddingVertical: 10, borderRadius: CrmRadii.md },
  actBtnTeal: { backgroundColor: CrmColors.teal100, paddingHorizontal: 12, paddingVertical: 10, borderRadius: CrmRadii.md },
  actBtnEmerald: { backgroundColor: CrmColors.emerald100, paddingHorizontal: 12, paddingVertical: 10, borderRadius: CrmRadii.md },
  actBtnIndigo: { backgroundColor: CrmColors.indigo600, paddingHorizontal: 12, paddingVertical: 10, borderRadius: CrmRadii.md },
  actBtnGreen: { backgroundColor: CrmColors.emerald600, paddingHorizontal: 12, paddingVertical: 10, borderRadius: CrmRadii.md },
  actBtnTxt: { color: CrmColors.white, fontWeight: '700', fontSize: 13 },
  actBtnTxtDark: { color: CrmColors.teal800, fontWeight: '700', fontSize: 13 },
  lostBanner: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: CrmColors.red50,
    borderWidth: 1,
    borderColor: CrmColors.red200,
    borderRadius: CrmRadii.xl,
    padding: 14,
    marginBottom: 14,
  },
  lostEmoji: { fontSize: 22 },
  lostRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  lostLabel: { fontSize: 13, fontWeight: '800', color: CrmColors.red700 },
  lostChip: { backgroundColor: CrmColors.red50, paddingHorizontal: 8, paddingVertical: 2, borderRadius: CrmRadii.full, borderWidth: 1, borderColor: CrmColors.red200 },
  lostChipTxt: { fontSize: 10, color: CrmColors.red500, fontWeight: '600' },
  lostReason: { fontSize: 14, color: CrmColors.red800, fontWeight: '600' },
  lostAt: { fontSize: 11, color: CrmColors.red500, marginTop: 4 },
  panel: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.xl,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 16,
    marginBottom: 14,
  },
  panelHint: { fontSize: 11, color: CrmColors.gray500, marginBottom: 10 },
  stepperRow: { paddingVertical: 8, alignItems: 'flex-start' },
  stepWrap: { flexDirection: 'row', alignItems: 'flex-start' },
  stepCol: { width: 76, alignItems: 'center' },
  stepCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  stepCirclePast: { backgroundColor: CrmColors.emerald500, borderColor: CrmColors.emerald500 },
  stepCircleCurrent: { borderColor: CrmColors.blue100 },
  stepCircleFuture: { borderColor: CrmColors.gray300, backgroundColor: CrmColors.white },
  stepCircleTxt: { fontSize: 14, fontWeight: '700' },
  stepCircleTxtPast: { color: CrmColors.white },
  stepCircleTxtOn: { color: CrmColors.white },
  stepCircleTxtFut: { color: CrmColors.gray400 },
  stepName: { marginTop: 8, fontSize: 11, textAlign: 'center', color: CrmColors.gray500, maxWidth: 72 },
  stepNameOn: { color: CrmColors.gray900, fontWeight: '700' },
  stepNamePast: { color: CrmColors.emerald600, fontWeight: '600' },
  stepLineWrap: { width: 24, paddingTop: 18 },
  stepLine: { height: 2, width: '100%' },
  stepLinePast: { backgroundColor: CrmColors.emerald500 },
  stepLineFut: { backgroundColor: CrmColors.gray200 },
  moreStageBtn: { marginTop: 8, alignSelf: 'center', paddingVertical: 6 },
  moreStageTxt: { fontSize: 13, color: CrmColors.blue600, fontWeight: '600' },
  statsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  statBox: {
    flexGrow: 1,
    minWidth: '44%',
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    paddingVertical: 10,
    alignItems: 'center',
  },
  statBlue: { backgroundColor: CrmColors.blue50, borderColor: CrmColors.blue100 },
  statIndigo: { backgroundColor: '#EEF2FF', borderColor: '#C7D2FE' },
  statAmber: { backgroundColor: CrmColors.amber50, borderColor: CrmColors.amber100 },
  statPurple: { backgroundColor: '#faf5ff', borderColor: '#e9d5ff' },
  statLabel: { fontSize: 11, color: CrmColors.gray600, marginBottom: 2 },
  statValBlue: { fontSize: 20, fontWeight: '800', color: CrmColors.blue600 },
  statValIndigo: { fontSize: 20, fontWeight: '800', color: CrmColors.indigo600 },
  statValAmber: { fontSize: 20, fontWeight: '800', color: CrmColors.amber600 },
  statValPurple: { fontSize: 20, fontWeight: '800', color: '#7c3aed' },
  card: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.xl,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 18,
    marginBottom: 14,
  },
  cardH: { fontSize: 13, fontWeight: '800', color: CrmColors.gray900, marginBottom: 12, textTransform: 'uppercase' },
  fieldBlock: { marginBottom: 12 },
  fieldLabel: { fontSize: 11, fontWeight: '600', color: CrmColors.gray500, marginBottom: 2 },
  fieldValue: { fontSize: 14, fontWeight: '600', color: CrmColors.gray900 },
  custInput: {
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    borderRadius: CrmRadii.md,
    padding: 10,
    fontSize: 14,
    color: CrmColors.gray900,
  },
  saveCust: {
    marginTop: 8,
    backgroundColor: CrmColors.blue600,
    paddingVertical: 12,
    borderRadius: CrmRadii.md,
    alignItems: 'center',
  },
  saveCustTxt: { color: CrmColors.white, fontWeight: '700' },
  divider: { height: 1, backgroundColor: CrmColors.gray100, marginVertical: 8 },
  tabsBar: {
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    borderTopLeftRadius: CrmRadii.xl,
    borderTopRightRadius: CrmRadii.xl,
    overflow: 'hidden',
  },
  tabsScroll: { flexDirection: 'row', alignItems: 'center', paddingVertical: 2, paddingHorizontal: 4, gap: 2 },
  tabItem: { paddingVertical: 12, paddingHorizontal: 12, alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' },
  tabItemOn: { borderBottomColor: CrmColors.blue600 },
  tabTxt: { fontSize: 13, fontWeight: '600', color: CrmColors.gray600 },
  tabTxtOn: { color: CrmColors.blue600 },
  tabBody: {
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: CrmColors.gray200,
    borderBottomLeftRadius: CrmRadii.xl,
    borderBottomRightRadius: CrmRadii.xl,
    padding: 14,
    marginBottom: 16,
  },
  muted: { fontSize: 13, color: CrmColors.gray400, textAlign: 'center', paddingVertical: 12 },
  uploadBtn: {
    alignSelf: 'flex-start',
    backgroundColor: CrmColors.gray100,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: CrmRadii.md,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  uploadBtnTxt: { fontWeight: '700', color: CrmColors.gray800 },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: CrmColors.gray100,
  },
  rowTitle: { fontSize: 14, fontWeight: '600', color: CrmColors.gray900 },
  rowSub: { fontSize: 12, color: CrmColors.gray500, marginTop: 2 },
  delDoc: { fontSize: 16, color: CrmColors.red500, paddingLeft: 12 },
  webHint: { fontSize: 12, color: CrmColors.gray400, textAlign: 'center', marginTop: 8 },
  noteComposer: {
    minHeight: 88,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    borderRadius: CrmRadii.md,
    padding: 12,
    fontSize: 14,
    color: CrmColors.gray900,
    backgroundColor: CrmColors.white,
    marginBottom: 10,
    textAlignVertical: 'top',
  },
  noteSendBtn: {
    alignSelf: 'flex-start',
    backgroundColor: CrmColors.blue600,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: CrmRadii.md,
    marginBottom: 16,
  },
  noteSendBtnOff: { opacity: 0.45 },
  noteSendTxt: { color: CrmColors.white, fontWeight: '700', fontSize: 14 },
  noteCard: {
    padding: 12,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.gray50,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    marginBottom: 10,
  },
  noteMeta: { fontSize: 11, color: CrmColors.gray500, marginBottom: 6 },
  noteBody: { fontSize: 14, color: CrmColors.gray800, lineHeight: 20 },
  teamHint: { fontSize: 12, color: CrmColors.gray600, marginBottom: 8 },
  webLinkBtn: {
    alignSelf: 'flex-start',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.blue50,
    borderWidth: 1,
    borderColor: CrmColors.blue100,
    marginBottom: 12,
  },
  webLinkBtnTxt: { fontSize: 13, fontWeight: '700', color: CrmColors.blue600 },
  teamRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: CrmColors.gray100 },
  teamAvatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: CrmColors.blue100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teamAvatarTxt: { fontSize: 16, fontWeight: '800', color: CrmColors.blue700 },
  chatList: { maxHeight: 280, marginBottom: 12 },
  chatBubble: {
    padding: 10,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.gray50,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    marginBottom: 8,
  },
  chatBubbleSys: { backgroundColor: CrmColors.amber50, borderColor: CrmColors.amber100 },
  chatWho: { fontSize: 12, fontWeight: '700', color: CrmColors.gray800 },
  chatTime: { fontSize: 10, color: CrmColors.gray400, marginTop: 2 },
  chatText: { fontSize: 14, color: CrmColors.gray800, marginTop: 6, lineHeight: 20 },
  chatAttach: { fontSize: 13, color: CrmColors.blue600, fontWeight: '600', marginTop: 8 },
  chatInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  chatInput: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    borderRadius: CrmRadii.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: CrmColors.gray900,
    backgroundColor: CrmColors.white,
  },
  chatSend: { backgroundColor: CrmColors.blue600, paddingHorizontal: 16, paddingVertical: 12, borderRadius: CrmRadii.md },
  chatSendOff: { opacity: 0.45 },
  chatSendTxt: { color: CrmColors.white, fontWeight: '800', fontSize: 14 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  lostSheet: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.xl,
    padding: 18,
  },
  lostSheetTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10, color: CrmColors.gray900 },
  lostInput: {
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    borderRadius: CrmRadii.md,
    minHeight: 88,
    padding: 12,
    textAlignVertical: 'top',
    color: CrmColors.gray900,
  },
  lostActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 12, marginTop: 14 },
  lostCancel: { paddingVertical: 10, paddingHorizontal: 16 },
  lostCancelTxt: { color: CrmColors.gray600, fontWeight: '600' },
  lostOk: { backgroundColor: CrmColors.blue600, paddingVertical: 10, paddingHorizontal: 18, borderRadius: CrmRadii.md },
  lostOkTxt: { color: CrmColors.white, fontWeight: '700' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: CrmColors.white,
    borderTopLeftRadius: CrmRadii.xl,
    borderTopRightRadius: CrmRadii.xl,
    padding: 16,
    maxHeight: '72%',
  },
  sheetTitle: { fontSize: 18, fontWeight: '800', marginBottom: 8, color: CrmColors.gray900 },
  sheetRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: CrmColors.gray100 },
  sheetDot: { width: 10, height: 10, borderRadius: 5, marginRight: 12 },
  sheetName: { fontSize: 16, color: CrmColors.gray900, fontWeight: '500' },
  sheetClose: { padding: 14, alignItems: 'center' },
  sheetCloseTxt: { color: CrmColors.gray500, fontSize: 16, fontWeight: '600' },
});
