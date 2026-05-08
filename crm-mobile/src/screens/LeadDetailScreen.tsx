import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Image,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { RouteProp, useFocusEffect, useNavigation, useRoute } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api, formatApiError, postMultipart } from '../api/client';
import { useAuth } from '../context/AuthContext';
import type { CrmActivity, CrmDocument, CrmLeadDetail, CrmLeadMember, CrmStage, CrmTask } from '../types/crm';
import type { CrmStackParamList } from '../navigation/types';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';
import { formatDate, formatDateTime, formatVND } from '../lib/formatUtils';
import { openWebPath } from '../lib/openWeb';
import CrmTasksPanel from '../components/CrmTasksPanel';
import CrmVoiceRecordingsPanel from '../components/CrmVoiceRecordingsPanel';
import LeadChatPanel from '../components/LeadChatPanel';
import LeadMessengerPanel from '../components/LeadMessengerPanel';
import LeadFacebookPanel from '../components/LeadFacebookPanel';
import CrmNoteRichText from '../components/CrmNoteRichText';
import CrmMediaSlideshowModal from '../components/CrmMediaSlideshowModal';
import {
  slideshowItemsFromDocuments,
  classifyUrlMediaKind,
  getLeadActivityNoteBody,
  type SlideshowItem,
} from '../lib/crmNoteMedia';
import { resolveAttachmentUrl } from '../lib/resolveMediaUrl';

type R = RouteProp<CrmStackParamList, 'LeadDetail'>;
type Nav = NativeStackNavigationProp<CrmStackParamList, 'LeadDetail'>;

type TabKey = 'tasks' | 'documents' | 'activities' | 'notes' | 'team' | 'chat' | 'voice';
type ChatSubKey = 'crm' | 'internal' | 'facebook';

type LeadPreviewFbMsg = {
  id: string;
  direction?: string | null;
  content?: string | null;
  created_at?: string | null;
  attachment_url?: string | null;
  contact?: { fb_name?: string | null };
};

const MEMBER_ROLE_VI: Record<string, string> = {
  responsible: 'Chịu trách nhiệm',
  member: 'Tham gia',
  supervisor: 'Giám sát',
  viewer: 'Xem',
};

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

type PickerUser = { id: string; full_name?: string | null; email?: string | null };

/** File đính kèm nhiệm vụ (GET /crm/leads/:id/task-documents) */
type TaskDocRow = {
  id: string;
  name?: string | null;
  file_url?: string | null;
  doc_type?: string | null;
  mime_type?: string | null;
  task_title?: string | null;
  stage_slug?: string | null;
};

export default function LeadDetailScreen() {
  const { params } = useRoute<R>();
  const navigation = useNavigation<Nav>();
  const { user } = useAuth();
  const { id, openLeadChat } = params;

  const [lead, setLead] = useState<CrmLeadDetail | null>(null);
  const [stagesLead, setStagesLead] = useState<CrmStage[]>([]);
  const [stagesDeal, setStagesDeal] = useState<CrmStage[]>([]);
  const [activities, setActivities] = useState<CrmActivity[]>([]);
  const [documents, setDocuments] = useState<CrmDocument[]>([]);
  const [taskDocuments, setTaskDocuments] = useState<TaskDocRow[]>([]);
  const [taskCount, setTaskCount] = useState(0);
  const [custExpanded, setCustExpanded] = useState(false);
  const [crmExpanded, setCrmExpanded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [activeTab, setActiveTab] = useState<TabKey>(() => (openLeadChat ? 'chat' : 'tasks'));
  const [savingStage, setSavingStage] = useState(false);
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [pendingStageId, setPendingStageId] = useState<string | null>(null);
  const [stagePickerOpen, setStagePickerOpen] = useState(false);
  const [productionCompanies, setProductionCompanies] = useState<Array<{ id: string; name?: string; short_name?: string }>>([]);
  const [wonProdPickOpen, setWonProdPickOpen] = useState(false);
  const [pendingWonStageId, setPendingWonStageId] = useState<string | null>(null);
  const [wonProdCompanyId, setWonProdCompanyId] = useState('');

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  const [cust, setCust] = useState<CustForm>(emptyCust);
  const [savingCust, setSavingCust] = useState(false);
  const [converting, setConverting] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [members, setMembers] = useState<CrmLeadMember[]>([]);
  const [noteDraft, setNoteDraft] = useState('');
  const [noteSaving, setNoteSaving] = useState(false);
  const [chatSub, setChatSub] = useState<ChatSubKey>('crm');

  const [mediaViewerOpen, setMediaViewerOpen] = useState(false);
  const [mediaViewerItems, setMediaViewerItems] = useState<SlideshowItem[]>([]);
  const [mediaViewerIndex, setMediaViewerIndex] = useState(0);
  /** Remount slideshow khi mở lại (đồng bộ index / vuốt ngang). */
  const [mediaViewerSession, setMediaViewerSession] = useState(0);

  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewTasksWithNotes, setPreviewTasksWithNotes] = useState<CrmTask[]>([]);
  const [previewFbMsgs, setPreviewFbMsgs] = useState<LeadPreviewFbMsg[]>([]);

  const [valueDraft, setValueDraft] = useState('');
  const [createdAtDraft, setCreatedAtDraft] = useState('');
  const [assignDraftId, setAssignDraftId] = useState('');
  const [metaSaving, setMetaSaving] = useState(false);
  const [assigneeModal, setAssigneeModal] = useState(false);
  const [pickerUsers, setPickerUsers] = useState<PickerUser[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  const load = useCallback(async () => {
    setErr('');
    setLoading(true);
    try {
      const [detailRes, actRes, docRes, taskDocRes, stL, stD] = await Promise.all([
        api.get<CrmLeadDetail>(`/crm/leads/${id}/detail`),
        api.get<CrmActivity[]>(`/crm/leads/${id}/activities`).catch(() => ({ data: [] })),
        api.get<CrmDocument[]>(`/crm/leads/${id}/documents`).catch(() => ({ data: [] })),
        api.get<TaskDocRow[]>(`/crm/leads/${id}/task-documents`).catch(() => ({ data: [] })),
        api.get<CrmStage[]>('/crm/pipeline-stages', { params: { type: 'lead' } }).catch(() => ({ data: [] })),
        api.get<CrmStage[]>('/crm/pipeline-stages', { params: { type: 'deal' } }).catch(() => ({ data: [] })),
      ]);
      const L = detailRes.data;
      setLead(L);
      setTitleDraft(L?.title || '');
      setValueDraft(
        L?.estimated_value != null && !Number.isNaN(Number(L.estimated_value))
          ? String(Math.round(Number(L.estimated_value)))
          : '',
      );
      setCreatedAtDraft(L?.created_at ? String(L.created_at).slice(0, 10) : '');
      setAssignDraftId(String(L?.assigned_to || L?.lead_owner_id || ''));
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
      setTaskDocuments(Array.isArray(taskDocRes.data) ? taskDocRes.data : []);
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

  useEffect(() => {
    void (async () => {
      try {
        const { data } = await api.get<{ companies?: Array<{ id: string; name?: string; short_name?: string }> }>(
          '/companies',
          { params: { for_module: 'production' } },
        );
        setProductionCompanies(Array.isArray(data?.companies) ? data.companies : []);
      } catch {
        setProductionCompanies([]);
      }
    })();
  }, []);

  const skipNextActivitiesRefreshRef = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (skipNextActivitiesRefreshRef.current) {
        skipNextActivitiesRefreshRef.current = false;
        return;
      }
      if (!id) return;
      let cancelled = false;
      void (async () => {
        try {
          const { data } = await api.get<CrmActivity[]>(`/crm/leads/${id}/activities`);
          if (!cancelled && Array.isArray(data)) setActivities(data);
        } catch {
          /* giữ danh sách hiện tại */
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [id]),
  );

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
    () =>
      (activities || []).filter((a) => String(a.type || '').toLowerCase().trim() === 'note'),
    [activities],
  );
  const pipelineActivities = useMemo(
    () => (activities || []).filter((a) => a.type !== 'note'),
    [activities],
  );

  const standaloneDocuments = useMemo(
    () =>
      documents.filter((d) => !d.is_from_task && !d.source_attachment_id),
    [documents],
  );

  const documentTabCount = standaloneDocuments.length + taskDocuments.length;

  const allDocMediaSources = useMemo(
    () => [
      ...taskDocuments.map((td) => ({
        file_url: td.file_url,
        mime_type: td.mime_type,
        name: td.name,
      })),
      ...standaloneDocuments.map((d) => ({
        file_url: d.file_url,
        mime_type: d.mime_type,
        name: d.name,
      })),
    ],
    [taskDocuments, standaloneDocuments],
  );
  const documentSlideshowItems = useMemo(
    () => slideshowItemsFromDocuments(allDocMediaSources),
    [allDocMediaSources],
  );

  const openMediaSlideshow = useCallback((items: SlideshowItem[], index: number) => {
    if (!items.length) return;
    setMediaViewerItems(items);
    setMediaViewerIndex(Math.min(Math.max(0, index), items.length - 1));
    setMediaViewerSession((s) => s + 1);
    setMediaViewerOpen(true);
  }, []);

  const closeMediaSlideshow = useCallback(() => {
    setMediaViewerOpen(false);
  }, []);

  const openDocSlideshowAtUri = useCallback(
    (resolvedUri: string) => {
      const idx = documentSlideshowItems.findIndex((it) => it.uri === resolvedUri);
      openMediaSlideshow(documentSlideshowItems, idx >= 0 ? idx : 0);
    },
    [documentSlideshowItems, openMediaSlideshow],
  );

  const loadMembers = useCallback(async () => {
    try {
      const { data } = await api.get<CrmLeadMember[]>(`/crm/leads/${id}/members`);
      setMembers(Array.isArray(data) ? data : []);
    } catch {
      setMembers([]);
    }
  }, [id]);

  useEffect(() => {
    if (activeTab === 'team') void loadMembers();
  }, [activeTab, loadMembers]);

  const loadLeadPreview = useCallback(async () => {
    setPreviewLoading(true);
    try {
      const [tRes, fRes] = await Promise.all([
        api.get<CrmTask[]>(`/crm/leads/${id}/tasks`).catch(() => ({ data: [] as CrmTask[] })),
        api.get<LeadPreviewFbMsg[]>(`/facebook/leads/${id}/messages`).catch(() => ({ data: [] as LeadPreviewFbMsg[] })),
      ]);
      const tasks = Array.isArray(tRes.data) ? tRes.data : [];
      setPreviewTasksWithNotes(tasks.filter((t) => (t.notes || '').trim().length > 0));
      const fb = Array.isArray(fRes.data) ? fRes.data : [];
      setPreviewFbMsgs(fb.slice(-40));
    } catch {
      setPreviewTasksWithNotes([]);
      setPreviewFbMsgs([]);
    } finally {
      setPreviewLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (previewExpanded) void loadLeadPreview();
  }, [previewExpanded, loadLeadPreview]);

  const applyStage = async (
    stageId: string,
    opts?: { lost?: string; production_company_id?: string },
  ) => {
    setSavingStage(true);
    try {
      await api.patch(`/crm/leads/${id}/stage`, {
        stage_id: stageId,
        ...(opts?.lost ? { lost_reason: opts.lost } : {}),
        ...(opts?.production_company_id ? { production_company_id: opts.production_company_id } : {}),
      });
      await load();
      setStagePickerOpen(false);
      setWonProdPickOpen(false);
      setPendingWonStageId(null);
      setWonProdCompanyId('');
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
    if (lead.type === 'deal' && stage.is_won && !lead.project_id) {
      setPendingWonStageId(stage.id);
      setWonProdCompanyId(lead.company_id ? String(lead.company_id) : '');
      setWonProdPickOpen(true);
      setStagePickerOpen(false);
      return;
    }
    void applyStage(stage.id);
  };

  const confirmLost = () => {
    if (!lostReason.trim() || !pendingStageId) {
      Alert.alert('Thiếu thông tin', 'Vui lòng nhập lý do thua.');
      return;
    }
    void applyStage(pendingStageId, { lost: lostReason.trim() });
  };

  const confirmWonProductionCompany = () => {
    if (!pendingWonStageId) return;
    if (!wonProdCompanyId.trim()) {
      Alert.alert('Thiếu thông tin', 'Chọn công ty thuộc module Sản xuất.');
      return;
    }
    void applyStage(pendingWonStageId, { production_company_id: wonProdCompanyId.trim() });
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
    if (!lead) return;
    if (!cust.full_name.trim()) {
      Alert.alert('Khách hàng', 'Vui lòng nhập tên khách hàng.');
      return;
    }
    if (lead.type === 'deal' && !cust.phone.trim()) {
      Alert.alert('Khách hàng', 'Deal cần số điện thoại khách hàng.');
      return;
    }
    const cid = lead.customer?.id;
    setSavingCust(true);
    try {
      if (cid) {
        const { data: res } = await api.put<{ customer?: CrmLeadDetail['customer'] }>(`/customers/${cid}`, {
          full_name: cust.full_name.trim() || null,
          phone: cust.phone.trim() || null,
          email: cust.email.trim() || null,
          address: cust.address.trim() || null,
          company: cust.company.trim() || null,
          tax_code: cust.tax_code.trim() || null,
        });
        const row = res?.customer ?? (res as unknown as CrmLeadDetail['customer']);
        setLead((prev) => (prev ? { ...prev, customer: { ...prev.customer, ...row, id: cid } } : prev));
        Alert.alert('Đã lưu', 'Đã cập nhật khách hàng.');
      } else {
        const { data: res } = await api.post<{ customer?: { id: string } & Record<string, unknown> }>('/customers', {
          full_name: cust.full_name.trim(),
          phone: cust.phone.trim() || null,
          email: cust.email.trim() || null,
          address: cust.address.trim() || null,
          company: cust.company.trim() || null,
          tax_code: cust.tax_code.trim() || null,
        });
        const newId = res?.customer?.id;
        if (!newId) {
          Alert.alert('Lỗi', 'Không tạo được khách hàng (thiếu id).');
          return;
        }
        await api.put<CrmLeadDetail>(`/crm/leads/${id}`, { customer_id: newId });
        await load();
        Alert.alert('Đã lưu', 'Đã tạo khách hàng và gắn vào lead/deal.');
      }
    } catch (e: unknown) {
      Alert.alert('Lỗi', (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không lưu được');
    } finally {
      setSavingCust(false);
    }
  };

  const openAssigneePicker = async () => {
    setAssigneeModal(true);
    if (pickerUsers.length) return;
    setPickerLoading(true);
    try {
      const { data } = await api.get<{ users?: PickerUser[] }>('/users');
      setPickerUsers(Array.isArray(data?.users) ? data.users : []);
    } catch {
      setPickerUsers([]);
    } finally {
      setPickerLoading(false);
    }
  };

  const saveLeadCoreMeta = async () => {
    if (!lead) return;
    const pickAssigneeAllowed = !!lead.company_id;
    const dateStr = createdAtDraft.trim();
    if (dateStr && !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      Alert.alert('Ngày tạo', 'Dùng định dạng YYYY-MM-DD (ví dụ 2026-04-16).');
      return;
    }
    const digits = valueDraft.replace(/\D/g, '');
    const estimated_value = digits ? parseInt(digits, 10) : 0;

    const body: Record<string, unknown> = { estimated_value };
    if (dateStr) body.created_at = `${dateStr}T12:00:00.000Z`;
    if (pickAssigneeAllowed) {
      body.assigned_to = assignDraftId.trim() || null;
    }

    setMetaSaving(true);
    try {
      await api.put<CrmLeadDetail>(`/crm/leads/${id}`, body);
      await load();
      Alert.alert('Đã lưu', 'Đã cập nhật thông tin lead/deal.');
    } catch (e: unknown) {
      Alert.alert('Lỗi', (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không lưu được.');
    } finally {
      setMetaSaving(false);
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
      const { data: up } = await postMultipart<{ files: { file_url?: string; file_name?: string; file_size?: number; mime_type?: string }[] }>(
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
      Alert.alert('Lỗi upload', formatApiError(e));
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
      if (data?.id) {
        setActivities((prev) => [data, ...(prev || []).filter((x) => x.id !== data.id)]);
      } else {
        try {
          const listRes = await api.get<CrmActivity[]>(`/crm/leads/${id}/activities`);
          if (Array.isArray(listRes.data)) setActivities(listRes.data);
        } catch {
          /* ignore */
        }
      }
      setNoteDraft('');
    } catch (e: unknown) {
      Alert.alert('Lỗi', (e as { response?: { data?: { error?: string } } })?.response?.data?.error || 'Không lưu được ghi chú');
    } finally {
      setNoteSaving(false);
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
  const canPickAssignee = !!lead.company_id;
  const assigneeLabel = !assignDraftId
    ? '— Chưa gán —'
    : pickerUsers.find((u) => u.id === assignDraftId)?.full_name ||
      lead.assignee?.full_name ||
      lead.lead_owner?.full_name ||
      `${assignDraftId.slice(0, 8)}…`;
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

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
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
            <Text style={styles.statValAmber}>{documentTabCount}</Text>
          </View>
          <View style={[styles.statBox, styles.statPurple]}>
            <Text style={styles.statLabel}>Công việc</Text>
            <Text style={styles.statValPurple}>{taskCount}</Text>
          </View>
        </View>

        <View style={[styles.card, CrmShadow.card]}>
          <TouchableOpacity
            style={styles.collapseHead}
            onPress={() => setPreviewExpanded((v) => !v)}
            activeOpacity={0.75}
          >
            <View style={styles.collapseHeadRow}>
              <Text style={[styles.cardH, styles.cardHInline]}>Ghi chú nhiệm vụ & Facebook</Text>
              <Text style={styles.collapseChevron}>{previewExpanded ? '▼' : '▶'}</Text>
            </View>
            {!previewExpanded ? (
              <Text style={styles.collapsePreview} numberOfLines={2}>
                {isDeal
                  ? 'Xem nhanh ghi chú trên công việc và tin Facebook của khách (deal).'
                  : 'Xem nhanh ghi chú trên công việc và tin Facebook của khách.'}
              </Text>
            ) : null}
          </TouchableOpacity>
          {previewExpanded ? (
            <View style={styles.previewBody}>
              {previewLoading ? (
                <ActivityIndicator style={{ marginVertical: 16 }} color={CrmColors.blue600} />
              ) : (
                <>
                  <Text style={styles.previewSectionH}>Ghi chú trên nhiệm vụ</Text>
                  {previewTasksWithNotes.length === 0 ? (
                    <Text style={styles.muted}>Chưa có ghi chú trên nhiệm vụ (tab Công việc).</Text>
                  ) : (
                    previewTasksWithNotes.map((t) => (
                      <View key={t.id} style={styles.previewNoteCard}>
                        <Text style={styles.previewTaskTitle}>{t.title || 'Nhiệm vụ'}</Text>
                    <CrmNoteRichText
                      text={(t.notes || '').trim() || '—'}
                      bodyStyle={styles.previewTaskNotes}
                      onOpenSlideshow={(items, index) => openMediaSlideshow(items, index)}
                    />
                      </View>
                    ))
                  )}

                  <Text style={[styles.previewSectionH, { marginTop: 16 }]}>Tin nhắn Facebook</Text>
                  {previewFbMsgs.length === 0 ? (
                    <Text style={styles.muted}>Chưa có tin nhắn Facebook gắn hồ sơ này.</Text>
                  ) : (
                    <ScrollView style={styles.previewFbScroll} nestedScrollEnabled showsVerticalScrollIndicator>
                      {previewFbMsgs.map((m) => {
                        const out = String(m.direction || '').toLowerCase() === 'outbound';
                        return (
                          <View
                            key={m.id}
                            style={[styles.previewFbBubble, out ? styles.previewFbOut : styles.previewFbIn]}
                          >
                            <Text style={styles.previewFbMeta}>
                              {out ? 'Page' : m.contact?.fb_name || 'Khách'} · {formatDateTime(m.created_at)}
                            </Text>
                            {m.content ? <Text style={styles.previewFbTxt}>{m.content}</Text> : null}
                            {m.attachment_url ? (
                              <TouchableOpacity onPress={() => void Linking.openURL(m.attachment_url!)}>
                                <Text style={styles.previewFbLink}>Đính kèm / ảnh</Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        );
                      })}
                    </ScrollView>
                  )}
                  <TouchableOpacity
                    style={styles.previewWebBtn}
                    onPress={() => openWebPath(`/crm/leads/${id}?tab=facebook`)}
                  >
                    <Text style={styles.previewWebBtnTxt}>Facebook đầy đủ trên web</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.previewReload} onPress={() => void loadLeadPreview()}>
                    <Text style={styles.previewReloadTxt}>Tải lại</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          ) : null}
        </View>

        <View style={[styles.card, CrmShadow.card]}>
          <TouchableOpacity
            style={styles.collapseHead}
            onPress={() => setCustExpanded((v) => !v)}
            activeOpacity={0.75}
          >
            <View style={styles.collapseHeadRow}>
              <Text style={[styles.cardH, styles.cardHInline]}>Khách hàng</Text>
              <Text style={styles.collapseChevron}>{custExpanded ? '▼' : '▶'}</Text>
            </View>
            {!custExpanded ? (
              <Text style={styles.collapsePreview} numberOfLines={2}>
                {!c?.id
                  ? 'Chưa gán KH — chạm để nhập / tạo'
                  : [cust.full_name, cust.phone].filter(Boolean).join(' · ') || '—'}
              </Text>
            ) : null}
          </TouchableOpacity>
          {custExpanded ? (
            <>
              {!c?.id ? (
                <Text style={styles.custBanner}>
                  Chưa gán khách hàng — nhập thông tin bên dưới và bấm «Tạo & gắn» để tạo mới và liên kết với lead/deal này.
                </Text>
              ) : null}
              <FieldInp label="👤 Tên *" value={cust.full_name} onChange={(t) => setCust((p) => ({ ...p, full_name: t }))} />
              <FieldInp
                label={isDeal ? '📞 SĐT *' : '📞 SĐT'}
                value={cust.phone}
                onChange={(t) => setCust((p) => ({ ...p, phone: t }))}
                keyboard="phone-pad"
              />
              <FieldInp label="✉️ Email" value={cust.email} onChange={(t) => setCust((p) => ({ ...p, email: t }))} keyboard="email-address" />
              <View style={styles.divider} />
              <FieldInp label="📍 Địa chỉ" value={cust.address} onChange={(t) => setCust((p) => ({ ...p, address: t }))} />
              <FieldInp label="🏢 Công ty" value={cust.company} onChange={(t) => setCust((p) => ({ ...p, company: t }))} />
              <FieldInp label="🧾 MST" value={cust.tax_code} onChange={(t) => setCust((p) => ({ ...p, tax_code: t }))} />
              <TouchableOpacity style={styles.saveCust} onPress={() => void saveCustomer()} disabled={savingCust}>
                <Text style={styles.saveCustTxt}>
                  {savingCust ? 'Đang lưu…' : c?.id ? 'Lưu khách hàng' : 'Tạo & gắn khách hàng'}
                </Text>
              </TouchableOpacity>
            </>
          ) : null}
        </View>

        <View style={[styles.card, CrmShadow.card]}>
          <TouchableOpacity
            style={styles.collapseHead}
            onPress={() => setCrmExpanded((v) => !v)}
            activeOpacity={0.75}
          >
            <View style={styles.collapseHeadRow}>
              <Text style={[styles.cardH, styles.cardHInline]}>Thông tin CRM</Text>
              <Text style={styles.collapseChevron}>{crmExpanded ? '▼' : '▶'}</Text>
            </View>
            {!crmExpanded ? (
              <Text style={styles.collapsePreview} numberOfLines={2}>
                {[
                  valueDraft.trim() ? formatVND(Number(valueDraft)) : null,
                  lead.stage?.name || null,
                  assigneeLabel !== '— Chưa gán —' ? assigneeLabel : null,
                ]
                  .filter(Boolean)
                  .join(' · ') || '—'}
              </Text>
            ) : null}
          </TouchableOpacity>
          {crmExpanded ? (
            <>
              <Text style={styles.metaHint}>Giá trị (VNĐ), ngày tạo (YYYY-MM-DD), người phụ trách — lưu chung một nút.</Text>

              <FieldInp
                label="💰 Giá trị dự kiến (VNĐ)"
                value={valueDraft}
                onChange={setValueDraft}
                keyboard="numeric"
              />

              <FieldInp
                label="📅 Ngày tạo (YYYY-MM-DD)"
                value={createdAtDraft}
                onChange={setCreatedAtDraft}
              />

              <View style={styles.fieldBlock}>
                <Text style={styles.fieldLabel}>👤 Người phụ trách</Text>
                <Text style={styles.fieldValue}>{assigneeLabel}</Text>
                {!lead.company_id ? (
                  <Text style={styles.metaHintSm}>Chọn công ty cho lead/deal trên web trước khi đổi người phụ trách.</Text>
                ) : (
                  <TouchableOpacity style={styles.pickAssignBtn} onPress={() => void openAssigneePicker()}>
                    <Text style={styles.pickAssignBtnTxt}>Chọn nhân viên…</Text>
                  </TouchableOpacity>
                )}
              </View>

              <InfoRow
                label="Nguồn"
                value={
                  lead.source?.name ? `${lead.source.icon || ''} ${lead.source.name}`.trim() : undefined
                }
              />
              <InfoRow label="Giai đoạn" value={lead.stage?.name} />

              <TouchableOpacity style={styles.saveCust} onPress={() => void saveLeadCoreMeta()} disabled={metaSaving}>
                <Text style={styles.saveCustTxt}>{metaSaving ? 'Đang lưu…' : 'Lưu thông tin CRM'}</Text>
              </TouchableOpacity>

              {canConvert ? (
                <View style={styles.convertBlock}>
                  <Text style={styles.convertLbl}>Lead → Deal</Text>
                  <Text style={styles.metaHintSm}>Chuyển sang pipeline Deal (giữ khách hàng & lịch sử). Dùng khi chốt tư vấn.</Text>
                  <TouchableOpacity style={styles.convertBtn} onPress={() => void convertToDeal()} disabled={converting}>
                    <Text style={styles.convertBtnTxt}>{converting ? 'Đang chuyển…' : '⚡ Chuyển sang Deal'}</Text>
                  </TouchableOpacity>
                </View>
              ) : null}
            </>
          ) : null}
        </View>

        <View style={[styles.tabsBar, CrmShadow.card]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
            {(
              [
                ['tasks', `✅ Công việc`] as const,
                ['documents', `📋 Tài liệu (${documentTabCount})`] as const,
                ['activities', `💬 Hoạt động (${pipelineActivities.length})`] as const,
                ['notes', `📝 Ghi chú (${noteActivities.length})`] as const,
                ['team', '👥 Thành viên'] as const,
                ['chat', '💬 Trao đổi'] as const,
                ['voice', '🎙 Ghi âm'] as const,
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

        <View style={[styles.webTabsBar, CrmShadow.card]}>
          <Text style={styles.webTabsKicker}>Chỉ trên web (mở trình duyệt)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
            <TouchableOpacity
              style={styles.webTabChip}
              onPress={() => openWebPath(`/crm/leads/${id}?tab=facebook`)}
            >
              <Text style={styles.webTabChipTxt}>📘 Facebook (đầy đủ trên web)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.webTabChip}
              onPress={() => openWebPath(`/crm/leads/${id}?tab=calls`)}
            >
              <Text style={styles.webTabChipTxt}>📞 Tổng đài</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.webTabChip}
              onPress={() => openWebPath(`/crm/leads/${id}?tab=voice_crm`)}
            >
              <Text style={styles.webTabChipTxt}>🎙 Ghi âm (web)</Text>
            </TouchableOpacity>
            {isDeal ? (
              <TouchableOpacity
                style={styles.webTabChip}
                onPress={() => openWebPath(`/crm/leads/${id}?tab=approvals`)}
              >
                <Text style={styles.webTabChipTxt}>✅ Gửi duyệt deal</Text>
              </TouchableOpacity>
            ) : null}
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

              {documentSlideshowItems.length > 0 ? (
                <View style={styles.docSlideStrip}>
                  <Text style={styles.docSlideStripH}>Trình chiếu ảnh / video / âm thanh</Text>
                  <ScrollView
                    horizontal
                    nestedScrollEnabled
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.docSlideStripInner}
                  >
                    {documentSlideshowItems.map((item, idx) => (
                      <TouchableOpacity
                        key={`doc-slide-${idx}-${item.uri}`}
                        style={styles.docSlideChip}
                        onPress={() => openMediaSlideshow(documentSlideshowItems, idx)}
                        activeOpacity={0.85}
                      >
                        {item.kind === 'image' ? (
                          <Image source={{ uri: item.uri }} style={styles.docSlideThumb} resizeMode="cover" />
                        ) : item.kind === 'video' ? (
                          <View style={[styles.docSlideThumb, styles.docSlideThumbVid]}>
                            <Text style={styles.docSlideThumbVidTxt}>▶</Text>
                          </View>
                        ) : (
                          <View style={[styles.docSlideThumb, styles.docSlideThumbAud]}>
                            <Text style={styles.docSlideThumbVidTxt}>♪</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                </View>
              ) : null}

              {taskDocuments.length > 0 ? (
                <>
                  <Text style={styles.docSectionH}>📂 File nhiệm vụ ({taskDocuments.length})</Text>
                  <Text style={styles.docSectionSub}>Từ nhiệm vụ CRM — chạm ảnh/video để trình chiếu; PDF/file khác mở liên kết.</Text>
                  {taskDocuments.map((td) => {
                    const resolved = td.file_url ? resolveAttachmentUrl(td.file_url) : null;
                    const mk = td.file_url ? classifyUrlMediaKind(td.file_url, td.mime_type) : 'file';
                    const openRow = () => {
                      if (resolved && mk !== 'file') {
                        openDocSlideshowAtUri(resolved);
                      } else if (td.file_url) {
                        void Linking.openURL(resolveAttachmentUrl(td.file_url) || td.file_url);
                      }
                    };
                    return (
                      <View key={td.id} style={styles.rowItemMedia}>
                        {resolved && mk === 'image' ? (
                          <TouchableOpacity onPress={openRow}>
                            <Image source={{ uri: resolved }} style={styles.rowThumb} resizeMode="cover" />
                          </TouchableOpacity>
                        ) : resolved && mk === 'video' ? (
                          <TouchableOpacity onPress={openRow}>
                            <View style={[styles.rowThumb, styles.rowThumbVid]}>
                              <Text style={styles.rowThumbVidTxt}>▶</Text>
                            </View>
                          </TouchableOpacity>
                        ) : resolved && mk === 'audio' ? (
                          <TouchableOpacity onPress={openRow}>
                            <View style={[styles.rowThumb, styles.rowThumbAud]}>
                              <Text style={styles.rowThumbVidTxt}>♪</Text>
                            </View>
                          </TouchableOpacity>
                        ) : (
                          <View style={styles.rowThumbPlaceholder} />
                        )}
                        <TouchableOpacity style={styles.rowItemMain} onPress={openRow} disabled={!td.file_url}>
                          <Text style={styles.rowTitle}>{td.name || '—'}</Text>
                          <Text style={styles.rowSub}>
                            {[td.task_title, td.stage_slug].filter(Boolean).join(' · ') || 'Nhiệm vụ'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </>
              ) : null}
              {standaloneDocuments.length > 0 ? (
                <>
                  {taskDocuments.length > 0 ? (
                    <Text style={[styles.docSectionH, { marginTop: 14 }]}>📋 Tài liệu lead / deal</Text>
                  ) : null}
                  {standaloneDocuments.map((d) => {
                    const resolved = d.file_url ? resolveAttachmentUrl(d.file_url) : null;
                    const mk = d.file_url ? classifyUrlMediaKind(d.file_url, d.mime_type) : 'file';
                    const openRow = () => {
                      if (resolved && mk !== 'file') {
                        openDocSlideshowAtUri(resolved);
                      } else if (d.file_url) {
                        void Linking.openURL(resolveAttachmentUrl(d.file_url) || d.file_url);
                      }
                    };
                    return (
                      <View key={d.id} style={styles.rowItemMedia}>
                        {resolved && mk === 'image' ? (
                          <TouchableOpacity onPress={openRow}>
                            <Image source={{ uri: resolved }} style={styles.rowThumb} resizeMode="cover" />
                          </TouchableOpacity>
                        ) : resolved && mk === 'video' ? (
                          <TouchableOpacity onPress={openRow}>
                            <View style={[styles.rowThumb, styles.rowThumbVid]}>
                              <Text style={styles.rowThumbVidTxt}>▶</Text>
                            </View>
                          </TouchableOpacity>
                        ) : resolved && mk === 'audio' ? (
                          <TouchableOpacity onPress={openRow}>
                            <View style={[styles.rowThumb, styles.rowThumbAud]}>
                              <Text style={styles.rowThumbVidTxt}>♪</Text>
                            </View>
                          </TouchableOpacity>
                        ) : (
                          <View style={styles.rowThumbPlaceholder} />
                        )}
                        <TouchableOpacity style={styles.rowItemMain} onPress={openRow} disabled={!d.file_url}>
                          <Text style={styles.rowTitle}>{d.name || '—'}</Text>
                          {d.doc_type ? <Text style={styles.rowSub}>{d.doc_type}</Text> : null}
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => removeDoc(d)}>
                          <Text style={styles.delDoc}>✕</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </>
              ) : taskDocuments.length === 0 ? (
                <Text style={styles.muted}>Chưa có tài liệu.</Text>
              ) : (
                <Text style={[styles.muted, { marginTop: 8 }]}>Chưa có tài liệu lead riêng (chỉ file từ nhiệm vụ ở trên).</Text>
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
                    <CrmNoteRichText
                      text={getLeadActivityNoteBody(a)}
                      bodyStyle={styles.noteBody}
                      onOpenSlideshow={(items, index) => openMediaSlideshow(items, index)}
                    />
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
          {activeTab === 'chat' ? (
            <View>
              <View style={styles.chatSubBar}>
                {(
                  [
                    ['crm', 'Trao đổi CRM'] as const,
                    ['internal', 'Chat nội bộ'] as const,
                    ['facebook', 'Facebook'] as const,
                  ] as const
                ).map(([k, label]) => (
                  <TouchableOpacity
                    key={k}
                    style={[styles.chatSubChip, chatSub === k && styles.chatSubChipOn]}
                    onPress={() => setChatSub(k)}
                  >
                    <Text style={[styles.chatSubChipTxt, chatSub === k && styles.chatSubChipTxtOn]}>{label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {chatSub === 'crm' ? <LeadChatPanel leadId={id} /> : null}
              {chatSub === 'internal' ? <LeadMessengerPanel leadId={id} navigation={navigation} /> : null}
              {chatSub === 'facebook' ? <LeadFacebookPanel leadId={id} /> : null}
            </View>
          ) : null}
        </View>

        <Text style={styles.webHint}>
          Tab «Ghi âm» trong app = ghi âm CRM trên thiết bị. Tab «Trao đổi» gồm CRM, chat nhóm nội bộ theo lead và tin
          Facebook; tổng đài / duyệt deal đầy đủ: hàng nút phía trên hoặc mở web.
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

      <Modal visible={wonProdPickOpen} transparent animationType="slide" onRequestClose={() => !savingStage && setWonProdPickOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => !savingStage && setWonProdPickOpen(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Chọn công ty Sản xuất</Text>
            <Text style={styles.rowSub}>Bắt buộc để tạo dự án xưởng khi deal Thắng.</Text>
            <FlatList
              data={productionCompanies}
              keyExtractor={(c) => c.id}
              style={{ maxHeight: 320 }}
              renderItem={({ item: c }) => {
                const sel = wonProdCompanyId === c.id;
                return (
                  <TouchableOpacity
                    style={[styles.sheetRow, sel && { backgroundColor: CrmColors.blue50 }]}
                    onPress={() => setWonProdCompanyId(c.id)}
                  >
                    <Text style={styles.sheetName}>{c.short_name || c.name || c.id}</Text>
                  </TouchableOpacity>
                );
              }}
              ListEmptyComponent={<Text style={styles.rowSub}>Không có công ty SX. Cấu hình trên web.</Text>}
            />
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
              <TouchableOpacity style={styles.lostCancel} onPress={() => !savingStage && setWonProdPickOpen(false)}>
                <Text style={styles.lostCancelTxt}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.lostOk} onPress={confirmWonProductionCompany} disabled={savingStage}>
                <Text style={styles.lostOkTxt}>{savingStage ? '…' : 'Xác nhận'}</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
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

      <Modal visible={assigneeModal} animationType="slide" transparent onRequestClose={() => setAssigneeModal(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setAssigneeModal(false)}>
          <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.sheetTitle}>Người phụ trách</Text>
            <TouchableOpacity
              style={styles.sheetRow}
              onPress={() => {
                setAssignDraftId('');
                setAssigneeModal(false);
              }}
            >
              <Text style={styles.sheetName}>— Để trống / gỡ gán</Text>
            </TouchableOpacity>
            {pickerLoading ? <ActivityIndicator style={{ marginVertical: 16 }} color={CrmColors.blue600} /> : null}
            <FlatList
              data={pickerUsers}
              keyExtractor={(u) => u.id}
              style={{ maxHeight: 380 }}
              renderItem={({ item: u }) => (
                <TouchableOpacity
                  style={styles.sheetRow}
                  onPress={() => {
                    setAssignDraftId(u.id);
                    setAssigneeModal(false);
                  }}
                >
                  <Text style={styles.sheetName}>{u.full_name || u.email || u.id}</Text>
                  {u.email && u.full_name ? <Text style={styles.rowSub}>{u.email}</Text> : null}
                </TouchableOpacity>
              )}
            />
            <TouchableOpacity style={styles.sheetClose} onPress={() => setAssigneeModal(false)}>
              <Text style={styles.sheetCloseTxt}>Đóng</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      <CrmMediaSlideshowModal
        key={`slideshow-${mediaViewerSession}`}
        visible={mediaViewerOpen}
        items={mediaViewerItems}
        initialIndex={mediaViewerIndex}
        onClose={closeMediaSlideshow}
      />
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
  keyboard?: 'phone-pad' | 'email-address' | 'numeric';
}) {
  const kt =
    keyboard === 'phone-pad'
      ? 'phone-pad'
      : keyboard === 'email-address'
        ? 'email-address'
        : keyboard === 'numeric'
          ? 'numeric'
          : 'default';
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.custInput}
        value={value}
        onChangeText={onChange}
        keyboardType={kt}
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
  cardHInline: { marginBottom: 0 },
  collapseHead: { marginBottom: 0 },
  collapseHeadRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  collapseChevron: { fontSize: 14, color: CrmColors.gray500, fontWeight: '700', paddingLeft: 8 },
  collapsePreview: { fontSize: 13, color: CrmColors.gray600, marginTop: 8, lineHeight: 18 },
  previewBody: { marginTop: 8, paddingTop: 4 },
  previewSectionH: {
    fontSize: 12,
    fontWeight: '800',
    color: CrmColors.gray700,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  previewNoteCard: {
    backgroundColor: CrmColors.gray50,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.gray100,
    padding: 12,
    marginBottom: 8,
  },
  previewTaskTitle: { fontSize: 14, fontWeight: '800', color: CrmColors.gray900, marginBottom: 6 },
  previewTaskNotes: { fontSize: 14, color: CrmColors.gray800, lineHeight: 20 },
  previewFbScroll: { maxHeight: 280, marginTop: 4 },
  previewFbBubble: {
    borderRadius: CrmRadii.md,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
  },
  previewFbIn: { backgroundColor: CrmColors.white, borderColor: CrmColors.gray200, alignSelf: 'flex-start', maxWidth: '96%' },
  previewFbOut: { backgroundColor: CrmColors.blue50, borderColor: CrmColors.blue100, alignSelf: 'flex-end', maxWidth: '96%' },
  previewFbMeta: { fontSize: 11, color: CrmColors.gray500, marginBottom: 4 },
  previewFbTxt: { fontSize: 14, color: CrmColors.gray900, lineHeight: 20 },
  previewFbLink: { fontSize: 13, color: CrmColors.blue600, fontWeight: '700', marginTop: 4 },
  previewWebBtn: {
    marginTop: 12,
    paddingVertical: 10,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.blue100,
    backgroundColor: CrmColors.blue50,
    alignItems: 'center',
  },
  previewWebBtnTxt: { fontSize: 14, fontWeight: '800', color: CrmColors.blue700 },
  previewReload: { marginTop: 8, alignItems: 'center', paddingVertical: 6 },
  previewReloadTxt: { fontSize: 13, color: CrmColors.gray500, fontWeight: '600' },
  webTabsBar: {
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    borderRadius: CrmRadii.xl,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  webTabsKicker: { fontSize: 11, fontWeight: '700', color: CrmColors.gray500, marginBottom: 8, textTransform: 'uppercase' },
  webTabChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.gray100,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    marginRight: 6,
  },
  webTabChipTxt: { fontSize: 12, fontWeight: '700', color: CrmColors.gray800 },
  docSectionH: { fontSize: 12, fontWeight: '800', color: CrmColors.gray700, marginBottom: 4, textTransform: 'uppercase' },
  docSectionSub: { fontSize: 11, color: CrmColors.gray500, marginBottom: 8, lineHeight: 16 },
  metaHint: { fontSize: 12, color: CrmColors.gray500, marginBottom: 12, lineHeight: 17 },
  metaHintSm: { fontSize: 11, color: CrmColors.gray400, marginTop: 6, lineHeight: 15 },
  pickAssignBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.blue100,
    backgroundColor: CrmColors.blue50,
  },
  pickAssignBtnTxt: { fontSize: 13, fontWeight: '700', color: CrmColors.blue700 },
  convertBlock: { marginTop: 18, paddingTop: 16, borderTopWidth: 1, borderTopColor: CrmColors.gray100 },
  convertLbl: { fontSize: 12, fontWeight: '800', color: CrmColors.gray700, marginBottom: 6 },
  convertBtn: {
    marginTop: 10,
    backgroundColor: CrmColors.emerald600,
    paddingVertical: 12,
    borderRadius: CrmRadii.md,
    alignItems: 'center',
  },
  convertBtnTxt: { color: CrmColors.white, fontWeight: '800', fontSize: 15 },
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
  chatSubBar: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12, gap: 8 },
  chatSubChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: CrmRadii.full,
    backgroundColor: CrmColors.gray100,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  chatSubChipOn: { backgroundColor: CrmColors.blue50, borderColor: CrmColors.blue100 },
  chatSubChipTxt: { fontSize: 12, fontWeight: '700', color: CrmColors.gray600 },
  chatSubChipTxtOn: { color: CrmColors.blue600 },
  muted: { fontSize: 13, color: CrmColors.gray400, textAlign: 'center', paddingVertical: 12 },
  custBanner: {
    fontSize: 13,
    color: CrmColors.gray600,
    lineHeight: 19,
    marginBottom: 14,
    padding: 12,
    backgroundColor: CrmColors.blue50,
    borderRadius: CrmRadii.md,
    borderWidth: 1,
    borderColor: CrmColors.blue100,
  },
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
  docSlideStrip: { marginBottom: 14 },
  docSlideStripH: { fontSize: 12, fontWeight: '800', color: CrmColors.gray600, marginBottom: 8 },
  docSlideStripInner: { gap: 10, paddingVertical: 4 },
  docSlideChip: { marginRight: 10 },
  docSlideThumb: {
    width: 104,
    height: 104,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.gray100,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  docSlideThumbVid: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: CrmColors.gray900,
  },
  docSlideThumbAud: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: CrmColors.blue900,
  },
  docSlideThumbVidTxt: { fontSize: 28, color: '#fff', fontWeight: '800' },
  rowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: CrmColors.gray100,
  },
  rowItemMedia: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: CrmColors.gray100,
    gap: 10,
  },
  rowItemMain: { flex: 1, minWidth: 0 },
  rowThumb: {
    width: 52,
    height: 52,
    borderRadius: CrmRadii.sm,
    backgroundColor: CrmColors.gray100,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  rowThumbVid: { justifyContent: 'center', alignItems: 'center', backgroundColor: CrmColors.gray900 },
  rowThumbAud: { justifyContent: 'center', alignItems: 'center', backgroundColor: CrmColors.blue900 },
  rowThumbVidTxt: { fontSize: 18, color: '#fff', fontWeight: '800' },
  rowThumbPlaceholder: { width: 52, height: 52 },
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
