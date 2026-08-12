/**
 * Tab Thông tin chung — xem + sửa KH / Lead-Deal (khớp web LeadInfoPanel).
 */
import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from 'react-native';
import { formatApiError } from '../../api/client';
import { fetchCrmSources, setCrmKanbanDeadline, updateCrmAssignee, type CrmOption } from '../../api/crm';
import {
  fetchCrmCompanies,
  fetchCrmEmployeesByCompany,
  fetchCrmRegions,
  type CrmCompany,
  type CrmEmployee,
} from '../../api/crmMeta';
import type { LeadDetailRow } from '../../api/leadDetail';
import {
  updateCustomerFields,
  updateLeadDeposit,
  updateLeadFields,
} from '../../api/leadDetail';
import { currentUserId, useAuth } from '../../context/AuthContext';
import {
  buildAssignPickerOptions,
  canAssignCrmCard,
  canClearCrmAssignee,
  canViewAllCrm,
  type CrmAssigneeTarget,
} from '../../lib/crmAssignee';
import { formatVnd } from '../../lib/format';
import { deadlineIsoToYmd } from '../../lib/crmStageMove';
import DatePickerSheet from '../DatePickerSheet';
import PickerSheet from '../PickerSheet';
import { Radii, Spacing, useColors, type ThemeColors } from '../../theme';

type Props = {
  lead: LeadDetailRow;
  onUpdated?: () => void;
};

type DeadlineMode = 'set' | 'edit' | 'clear' | null;
type DepositReceived = '' | 'yes' | 'no';
type SelectKind = 'source' | 'company' | 'region' | null;
type DateField = 'expected_close_date' | 'next_follow_up' | null;

type TextEdit = {
  scope: 'customer' | 'lead';
  field: string;
  label: string;
  value: string;
  multiline?: boolean;
  keyboard?: KeyboardTypeOptions;
};

function depositDisplay(lead: LeadDetailRow): string | null {
  const parts: string[] = [];
  const amt = Number(lead.deposit_amount);
  if (Number.isFinite(amt) && amt > 0) parts.push(`${formatVnd(amt)}đ`);
  if (lead.deposit_received === true) parts.push('Đã nhận cọc');
  else if (lead.deposit_received === false) parts.push('Chưa nhận cọc');
  const lbl = String(lead.deposit_label || '').trim();
  if (lbl) parts.push(lbl);
  return parts.length ? parts.join(' · ') : null;
}

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('vi-VN', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

function sourceLabel(source: LeadDetailRow['source']): string {
  if (!source) return '—';
  if (typeof source === 'string') return source || '—';
  return source.name || '—';
}

function sourceIdOf(lead: LeadDetailRow): string {
  if (lead.source_id) return String(lead.source_id);
  if (lead.source && typeof lead.source === 'object' && lead.source.id) return String(lead.source.id);
  return '';
}

function InfoRow({
  label,
  value,
  onPress,
  actionLabel,
  onAction,
  styles,
}: {
  label: string;
  value: string;
  onPress?: () => void;
  actionLabel?: string;
  onAction?: () => void;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Pressable style={{ flex: 1 }} onPress={onPress} disabled={!onPress}>
        <Text style={[styles.infoValue, onPress && styles.infoLink]} numberOfLines={3}>
          {value || '—'}
        </Text>
      </Pressable>
      {actionLabel && onAction ? (
        <Pressable style={styles.rowAction} onPress={onAction} hitSlop={6}>
          <Text style={styles.rowActionTxt}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export default function LeadInfoTab({ lead, onUpdated }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { user } = useAuth();
  const myId = currentUserId(user);

  const [refreshing, setRefreshing] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [regionName, setRegionName] = useState('');
  const [companies, setCompanies] = useState<CrmCompany[]>([]);
  const [regions, setRegions] = useState<{ id: string; name: string }[]>([]);
  const [sources, setSources] = useState<CrmOption[]>([]);
  const [employees, setEmployees] = useState<CrmEmployee[]>([]);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignBusy, setAssignBusy] = useState(false);

  const [deadlineMode, setDeadlineMode] = useState<DeadlineMode>(null);
  const [pendingYmd, setPendingYmd] = useState<string | null>(null);
  const [reasonOpen, setReasonOpen] = useState(false);
  const [reasonText, setReasonText] = useState('');
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [savingDeadline, setSavingDeadline] = useState(false);

  const [depositOpen, setDepositOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositReceived, setDepositReceived] = useState<DepositReceived>('');
  const [depositLabel, setDepositLabel] = useState('');
  const [savingDeposit, setSavingDeposit] = useState(false);

  const [textEdit, setTextEdit] = useState<TextEdit | null>(null);
  const [textDraft, setTextDraft] = useState('');
  const [savingText, setSavingText] = useState(false);
  const [selectKind, setSelectKind] = useState<SelectKind>(null);
  const [selectBusy, setSelectBusy] = useState(false);
  const [dateField, setDateField] = useState<DateField>(null);

  const customer = lead.customer;
  const customerId = String(customer?.id || lead.customer_id || '');
  const assigneeId = String(
    lead.assigned_to || lead.assignee?.id || lead.lead_owner?.id || '',
  );
  const ownerName =
    lead.assignee?.full_name || lead.lead_owner?.full_name || 'Chưa gán';
  const deadlineIso = lead.kanban_deadline_at || lead.deadline || null;
  const isDeal = String(lead.type || '') === 'deal';
  const companyId = lead.company_id ? String(lead.company_id) : '';

  const assignTarget = useMemo<CrmAssigneeTarget>(
    () => ({
      kind: isDeal ? 'deal' : 'lead',
      assignedToId: assigneeId,
      leadOwnerId: String(lead.lead_owner?.id || ''),
      ownerId: assigneeId,
    }),
    [isDeal, assigneeId, lead.lead_owner?.id],
  );
  const canAssign = canAssignCrmCard(user, assignTarget, myId || '', companyId);

  const projects = useMemo(() => {
    const fromApi = Array.isArray(lead.production_projects)
      ? lead.production_projects.filter((p) => p?.project_id)
      : [];
    if (fromApi.length) return fromApi;
    if (!lead.project_id && !lead.linked_project) return [];
    return [{
      project_id: lead.project_id || lead.linked_project?.id,
      code: lead.linked_project?.code || null,
      name: lead.linked_project?.name || null,
      is_primary: true,
    }];
  }, [lead.production_projects, lead.project_id, lead.linked_project]);

  useEffect(() => {
    const embedded = lead.company?.name || lead.company?.short_name || '';
    const embeddedRegion = lead.crm_region?.name || lead.region?.name || '';
    if (embedded) setCompanyName(embedded);
    else setCompanyName('');
    if (embeddedRegion) setRegionName(embeddedRegion);
    else setRegionName('');

    let cancelled = false;
    void (async () => {
      try {
        const cos = await fetchCrmCompanies();
        if (cancelled) return;
        setCompanies(cos);
        if (companyId && !embedded) {
          const hit = cos.find((c) => String(c.id) === companyId);
          setCompanyName(hit?.name || hit?.short_name || '');
        }
        if (companyId) {
          const [regs, src, emp] = await Promise.all([
            fetchCrmRegions(companyId),
            fetchCrmSources(companyId),
            fetchCrmEmployeesByCompany(companyId),
          ]);
          if (cancelled) return;
          setRegions(regs.map((r) => ({ id: String(r.id), name: r.name })));
          setSources(src);
          setEmployees(emp.users || []);
          if (lead.region_id && !embeddedRegion) {
            const hit = regs.find((r) => String(r.id) === String(lead.region_id));
            setRegionName(hit?.name || '');
          }
        }
      } catch {
        /* ignore */
      }
    })();
    return () => { cancelled = true; };
  }, [companyId, lead.company, lead.crm_region, lead.region, lead.region_id]);

  const assignOptions = useMemo(
    () => buildAssignPickerOptions(employees, user, myId || ''),
    [employees, user, myId],
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    onUpdated?.();
    setTimeout(() => setRefreshing(false), 600);
  }, [onUpdated]);

  const callPhone = (phone?: string | null) => {
    const p = String(phone || '').trim();
    if (!p) return;
    void Linking.openURL(`tel:${p}`);
  };

  const requireCustomer = (): string | null => {
    if (!customerId) {
      Alert.alert('Thiếu khách hàng', 'Lead/Deal chưa gắn khách hàng — không sửa được thông tin KH.');
      return null;
    }
    return customerId;
  };

  const openCustomerEdit = (
    field: TextEdit['field'],
    label: string,
    value?: string | null,
    opts?: { multiline?: boolean; keyboard?: KeyboardTypeOptions },
  ) => {
    if (!requireCustomer()) return;
    setTextEdit({
      scope: 'customer',
      field,
      label,
      value: String(value || ''),
      multiline: opts?.multiline,
      keyboard: opts?.keyboard,
    });
    setTextDraft(String(value || ''));
  };

  const openLeadEdit = (
    field: TextEdit['field'],
    label: string,
    value?: string | null,
    opts?: { multiline?: boolean; keyboard?: KeyboardTypeOptions },
  ) => {
    setTextEdit({
      scope: 'lead',
      field,
      label,
      value: String(value ?? ''),
      multiline: opts?.multiline,
      keyboard: opts?.keyboard,
    });
    setTextDraft(String(value ?? ''));
  };

  const saveTextEdit = async () => {
    if (!textEdit) return;
    setSavingText(true);
    try {
      const raw = textDraft.trim();
      if (textEdit.scope === 'customer') {
        const cid = requireCustomer();
        if (!cid) return;
        const val = raw || null;
        await updateCustomerFields(cid, { [textEdit.field]: val });
      } else if (textEdit.field === 'estimated_value') {
        const n = raw === '' ? null : Number(raw.replace(/[^\d.]/g, ''));
        await updateLeadFields(lead.id, {
          estimated_value: n != null && Number.isFinite(n) ? n : null,
        });
      } else if (textEdit.field === 'probability') {
        const n = raw === '' ? null : Math.min(100, Math.max(0, Math.round(Number(raw))));
        await updateLeadFields(lead.id, {
          probability: n != null && Number.isFinite(n) ? n : null,
        });
      } else {
        await updateLeadFields(lead.id, { [textEdit.field]: raw || null });
      }
      setTextEdit(null);
      onUpdated?.();
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    } finally {
      setSavingText(false);
    }
  };

  const applySelect = async (kind: SelectKind, id: string | null) => {
    if (!kind) return;
    setSelectBusy(true);
    try {
      if (kind === 'source') {
        await updateLeadFields(lead.id, { source_id: id });
      } else if (kind === 'company') {
        await updateLeadFields(lead.id, { company_id: id, region_id: null });
      } else if (kind === 'region') {
        await updateLeadFields(lead.id, { region_id: id });
      }
      setSelectKind(null);
      onUpdated?.();
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    } finally {
      setSelectBusy(false);
    }
  };

  const applyAssignee = async (nextId: string | null) => {
    setAssignBusy(true);
    try {
      await updateCrmAssignee(lead.id, nextId);
      setAssignOpen(false);
      onUpdated?.();
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    } finally {
      setAssignBusy(false);
    }
  };

  const openSetDeadline = () => {
    setDeadlineMode(deadlineIso ? 'edit' : 'set');
    setPendingYmd(deadlineIsoToYmd(deadlineIso));
    setReasonText('');
    setDateField(null);
    setDatePickerOpen(true);
  };

  const openClearDeadline = () => {
    if (!deadlineIso) return;
    setDeadlineMode('clear');
    setPendingYmd(null);
    setReasonText('');
    setReasonOpen(true);
  };

  const openDateField = (field: Exclude<DateField, null>) => {
    setDateField(field);
    setDeadlineMode(null);
    const cur = field === 'expected_close_date' ? lead.expected_close_date : lead.next_follow_up;
    setPendingYmd(deadlineIsoToYmd(cur) || String(cur || '').slice(0, 10) || null);
    setDatePickerOpen(true);
  };

  const onDatePicked = (ymd: string) => {
    setDatePickerOpen(false);
    if (dateField) {
      void (async () => {
        try {
          await updateLeadFields(lead.id, { [dateField]: ymd });
          setDateField(null);
          onUpdated?.();
        } catch (e) {
          Alert.alert('Lỗi', formatApiError(e));
        }
      })();
      return;
    }
    setPendingYmd(ymd);
    if (deadlineIso) setReasonOpen(true);
    else void commitDeadline(ymd, '');
  };

  const commitDeadline = async (ymd: string | null, reason: string) => {
    if (deadlineIso && !(reason || '').trim()) {
      Alert.alert('Thiếu lý do', 'Vui lòng nhập lý do khi sửa hoặc xóa deadline.');
      return;
    }
    setSavingDeadline(true);
    try {
      await setCrmKanbanDeadline(lead.id, ymd, { reason: reason.trim() });
      setReasonOpen(false);
      setDeadlineMode(null);
      setReasonText('');
      onUpdated?.();
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    } finally {
      setSavingDeadline(false);
    }
  };

  const openDepositEdit = () => {
    const amt = Number(lead.deposit_amount);
    setDepositAmount(Number.isFinite(amt) && amt > 0 ? String(amt) : '');
    setDepositReceived(
      lead.deposit_received === true ? 'yes' : lead.deposit_received === false ? 'no' : '',
    );
    setDepositLabel(String(lead.deposit_label || '').trim());
    setDepositOpen(true);
  };

  const saveDeposit = async () => {
    setSavingDeposit(true);
    try {
      const raw = depositAmount.trim();
      const n = raw === '' ? null : Number(raw.replace(/[^\d.]/g, ''));
      await updateLeadDeposit(lead.id, {
        deposit_amount: n != null && Number.isFinite(n) && n > 0 ? n : null,
        deposit_received:
          depositReceived === 'yes' ? true : depositReceived === 'no' ? false : null,
        deposit_label: depositLabel.trim() || null,
      });
      setDepositOpen(false);
      onUpdated?.();
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    } finally {
      setSavingDeposit(false);
    }
  };

  const depositText = depositDisplay(lead);
  const editCustomer = customerId
    ? (field: string, label: string, value?: string | null, opts?: { multiline?: boolean; keyboard?: KeyboardTypeOptions }) =>
      () => openCustomerEdit(field, label, value, opts)
    : undefined;

  return (
    <>
      <ScrollView
        contentContainerStyle={styles.pad}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={Colors.blue} />
        }
      >
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Ionicons name="person-outline" size={18} color={Colors.blue} />
            <Text style={styles.cardTitle}>Khách hàng</Text>
          </View>
          <InfoRow
            label="Họ tên"
            value={customer?.full_name || '—'}
            actionLabel={customerId ? 'Sửa' : undefined}
            onAction={editCustomer?.('full_name', 'Họ tên', customer?.full_name)}
            styles={styles}
          />
          <InfoRow
            label="SĐT"
            value={customer?.phone || '—'}
            onPress={customer?.phone ? () => callPhone(customer.phone) : editCustomer?.('phone', 'SĐT', customer?.phone, { keyboard: 'phone-pad' })}
            actionLabel={customerId ? 'Sửa' : undefined}
            onAction={editCustomer?.('phone', 'SĐT', customer?.phone, { keyboard: 'phone-pad' })}
            styles={styles}
          />
          <InfoRow
            label="Email"
            value={customer?.email || '—'}
            actionLabel={customerId ? 'Sửa' : undefined}
            onAction={editCustomer?.('email', 'Email', customer?.email, { keyboard: 'email-address' })}
            styles={styles}
          />
          <InfoRow
            label="Địa chỉ"
            value={customer?.address || lead.install_address || '—'}
            actionLabel={customerId ? 'Sửa' : undefined}
            onAction={editCustomer?.('address', 'Địa chỉ', customer?.address || lead.install_address, { multiline: true })}
            styles={styles}
          />
          <InfoRow
            label="Công ty KH"
            value={customer?.company || '—'}
            actionLabel={customerId ? 'Sửa' : undefined}
            onAction={editCustomer?.('company', 'Công ty KH', customer?.company)}
            styles={styles}
          />
          <InfoRow
            label="MST"
            value={customer?.tax_code || '—'}
            actionLabel={customerId ? 'Sửa' : undefined}
            onAction={editCustomer?.('tax_code', 'MST', customer?.tax_code)}
            styles={styles}
          />
        </View>

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.purple} />
            <Text style={styles.cardTitle}>Thông tin {isDeal ? 'Deal' : 'Lead'}</Text>
          </View>
          <InfoRow label="Mã" value={lead.code || '—'} styles={styles} />
          <InfoRow
            label="Tiêu đề"
            value={lead.title || '—'}
            actionLabel="Sửa"
            onAction={() => openLeadEdit('title', 'Tiêu đề', lead.title)}
            styles={styles}
          />
          <InfoRow
            label="Công ty"
            value={companyName || '—'}
            actionLabel="Sửa"
            onAction={() => setSelectKind('company')}
            styles={styles}
          />
          <InfoRow
            label="Khu vực"
            value={regionName || '—'}
            actionLabel="Sửa"
            onAction={() => {
              if (!companyId) {
                Alert.alert('Thiếu công ty', 'Chọn công ty trước khi chọn khu vực.');
                return;
              }
              setSelectKind('region');
            }}
            styles={styles}
          />
          <InfoRow
            label="Phụ trách"
            value={ownerName}
            actionLabel={canAssign ? 'Chuyển' : undefined}
            onAction={canAssign ? () => setAssignOpen(true) : undefined}
            styles={styles}
          />
          <InfoRow label="Giai đoạn" value={lead.stage?.name || '—'} styles={styles} />
          <InfoRow
            label="Nguồn"
            value={sourceLabel(lead.source)}
            actionLabel="Sửa"
            onAction={() => {
              if (!companyId) {
                Alert.alert('Thiếu công ty', 'Chọn công ty trước khi chọn nguồn.');
                return;
              }
              setSelectKind('source');
            }}
            styles={styles}
          />
          <InfoRow
            label="Giá trị"
            value={lead.estimated_value != null ? `${formatVnd(Number(lead.estimated_value))}đ` : '—'}
            actionLabel="Sửa"
            onAction={() => openLeadEdit(
              'estimated_value',
              'Giá trị (VNĐ)',
              lead.estimated_value != null ? String(lead.estimated_value) : '',
              { keyboard: 'numeric' },
            )}
            styles={styles}
          />
          <InfoRow
            label="Tiền cọc"
            value={depositText || 'Nhấn để nhập…'}
            onPress={openDepositEdit}
            actionLabel="Sửa"
            onAction={openDepositEdit}
            styles={styles}
          />
          {isDeal ? (
            <InfoRow
              label="Dự kiến chốt"
              value={fmtDate(lead.expected_close_date)}
              actionLabel="Sửa"
              onAction={() => openDateField('expected_close_date')}
              styles={styles}
            />
          ) : (
            <InfoRow
              label="Follow-up"
              value={fmtDate(lead.next_follow_up)}
              actionLabel="Sửa"
              onAction={() => openDateField('next_follow_up')}
              styles={styles}
            />
          )}
          <InfoRow
            label="% chốt"
            value={lead.probability != null ? `${lead.probability}%` : '—'}
            actionLabel="Sửa"
            onAction={() => openLeadEdit(
              'probability',
              'Xác suất chốt (%)',
              lead.probability != null ? String(lead.probability) : '',
              { keyboard: 'numeric' },
            )}
            styles={styles}
          />
          <InfoRow label="Ngày tạo" value={fmtDate(lead.created_at)} styles={styles} />
          <InfoRow
            label="Ghi chú"
            value={lead.description ? String(lead.description) : '—'}
            actionLabel="Sửa"
            onAction={() => openLeadEdit('description', 'Ghi chú', lead.description, { multiline: true })}
            styles={styles}
          />
        </View>

        <View style={styles.card}>
          <View style={styles.cardHead}>
            <Ionicons name="alarm-outline" size={18} color={Colors.orange} />
            <Text style={styles.cardTitle}>Deadline thẻ</Text>
            <View style={{ flex: 1 }} />
            <Pressable style={styles.deadlineBtn} onPress={openSetDeadline} disabled={savingDeadline}>
              <Text style={styles.deadlineBtnTxt}>{deadlineIso ? 'Sửa' : 'Đặt'}</Text>
            </Pressable>
          </View>
          <Text style={styles.deadlineValue}>
            {deadlineIso ? fmtDate(deadlineIso) : 'Chưa đặt deadline'}
          </Text>
          {lead.kanban_deadline_reason ? (
            <Text style={styles.deadlineReason}>Lý do: {lead.kanban_deadline_reason}</Text>
          ) : null}
          {deadlineIso ? (
            <Pressable style={styles.clearBtn} onPress={openClearDeadline} disabled={savingDeadline}>
              <Text style={styles.clearBtnTxt}>Xóa deadline</Text>
            </Pressable>
          ) : null}
        </View>

        {isDeal ? (
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Ionicons name="construct-outline" size={18} color={Colors.green} />
              <Text style={styles.cardTitle}>Dự án sản xuất</Text>
            </View>
            {!projects.length ? (
              <Text style={styles.emptyHint}>Chưa liên kết dự án SX.</Text>
            ) : (
              projects.map((p, i) => (
                <View key={String(p.project_id || i)} style={styles.projectRow}>
                  <Text style={styles.projectCode}>{p.code || 'Dự án'}</Text>
                  <Text style={styles.projectName} numberOfLines={2}>{p.name || '—'}</Text>
                  {p.company_name ? <Text style={styles.metaMuted}>{p.company_name}</Text> : null}
                  {p.workshop_type_name ? <Text style={styles.metaMuted}>{p.workshop_type_name}</Text> : null}
                  {p.is_primary ? (
                    <View style={styles.primaryBadge}>
                      <Text style={styles.primaryBadgeTxt}>Chính</Text>
                    </View>
                  ) : null}
                </View>
              ))
            )}
          </View>
        ) : null}
      </ScrollView>

      <PickerSheet
        visible={assignOpen}
        title={isDeal ? 'Chuyển phụ trách Deal' : 'Chuyển phụ trách Lead'}
        options={assignOptions}
        selectedId={assigneeId || null}
        searchable={canViewAllCrm(user)}
        emptyLabel={canClearCrmAssignee(user) ? '— Bỏ gán —' : undefined}
        loading={assignBusy}
        accent={Colors.purple}
        onSelect={(opt) => { void applyAssignee(opt?.id || null); }}
        onClose={() => setAssignOpen(false)}
      />

      <PickerSheet
        visible={selectKind === 'source'}
        title="Chọn nguồn"
        options={sources}
        selectedId={sourceIdOf(lead) || null}
        searchable
        emptyLabel="— Bỏ nguồn —"
        loading={selectBusy}
        accent={Colors.blue}
        onSelect={(opt) => { void applySelect('source', opt?.id || null); }}
        onClose={() => setSelectKind(null)}
      />

      <PickerSheet
        visible={selectKind === 'company'}
        title="Chọn công ty"
        options={companies.map((c) => ({ id: c.id, name: c.name || c.short_name || 'Công ty' }))}
        selectedId={companyId || null}
        searchable
        loading={selectBusy}
        accent={Colors.blue}
        onSelect={(opt) => { void applySelect('company', opt?.id || null); }}
        onClose={() => setSelectKind(null)}
      />

      <PickerSheet
        visible={selectKind === 'region'}
        title="Chọn khu vực"
        options={regions}
        selectedId={lead.region_id ? String(lead.region_id) : null}
        searchable
        emptyLabel="— Bỏ khu vực —"
        loading={selectBusy}
        accent={Colors.blue}
        onSelect={(opt) => { void applySelect('region', opt?.id || null); }}
        onClose={() => setSelectKind(null)}
      />

      <DatePickerSheet
        visible={datePickerOpen}
        value={pendingYmd}
        accent={dateField ? Colors.blue : Colors.orange}
        onSelect={onDatePicked}
        onClose={() => {
          setDatePickerOpen(false);
          setDateField(null);
          if (!reasonOpen) setDeadlineMode(null);
        }}
      />

      <Modal
        visible={!!textEdit}
        transparent
        animationType="fade"
        onRequestClose={() => setTextEdit(null)}
      >
        <Pressable style={styles.modalBg} onPress={() => setTextEdit(null)} />
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{textEdit?.label || 'Sửa'}</Text>
          <TextInput
            style={[styles.depositInput, textEdit?.multiline && { minHeight: 96, textAlignVertical: 'top' }]}
            placeholder={`Nhập ${textEdit?.label || ''}…`}
            placeholderTextColor={Colors.textFaint}
            value={textDraft}
            onChangeText={setTextDraft}
            keyboardType={textEdit?.keyboard || 'default'}
            multiline={!!textEdit?.multiline}
            autoFocus
          />
          <View style={styles.modalRow}>
            <Pressable style={[styles.modalBtn, styles.modalCancel]} onPress={() => setTextEdit(null)}>
              <Text style={styles.modalCancelTxt}>Hủy</Text>
            </Pressable>
            <Pressable
              style={[styles.modalBtn, styles.modalOkBlue, savingText && { opacity: 0.6 }]}
              disabled={savingText}
              onPress={() => void saveTextEdit()}
            >
              <Text style={styles.modalOkTxt}>Lưu</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={reasonOpen}
        transparent
        animationType="fade"
        onRequestClose={() => { setReasonOpen(false); setDeadlineMode(null); }}
      >
        <Pressable style={styles.modalBg} onPress={() => { setReasonOpen(false); setDeadlineMode(null); }} />
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>
            {deadlineMode === 'clear' ? 'Lý do xóa deadline' : 'Lý do sửa deadline'}
          </Text>
          {deadlineMode !== 'clear' && pendingYmd ? (
            <Text style={styles.modalSub}>Ngày mới: {fmtDate(`${pendingYmd}T12:00:00`)}</Text>
          ) : null}
          <TextInput
            style={styles.reasonInput}
            placeholder="Nhập lý do (bắt buộc)…"
            placeholderTextColor={Colors.textFaint}
            value={reasonText}
            onChangeText={setReasonText}
            multiline
            autoFocus
          />
          <View style={styles.modalRow}>
            <Pressable
              style={[styles.modalBtn, styles.modalCancel]}
              onPress={() => { setReasonOpen(false); setDeadlineMode(null); }}
            >
              <Text style={styles.modalCancelTxt}>Hủy</Text>
            </Pressable>
            <Pressable
              style={[styles.modalBtn, styles.modalOk, savingDeadline && { opacity: 0.6 }]}
              disabled={savingDeadline}
              onPress={() => void commitDeadline(
                deadlineMode === 'clear' ? null : pendingYmd,
                reasonText,
              )}
            >
              <Text style={styles.modalOkTxt}>{deadlineMode === 'clear' ? 'Xóa' : 'Lưu'}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      <Modal
        visible={depositOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setDepositOpen(false)}
      >
        <Pressable style={styles.modalBg} onPress={() => setDepositOpen(false)} />
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Tiền cọc</Text>
          <Text style={styles.modalSub}>Số tiền (VNĐ)</Text>
          <TextInput
            style={styles.depositInput}
            placeholder="Ví dụ: 5000000"
            placeholderTextColor={Colors.textFaint}
            value={depositAmount}
            onChangeText={setDepositAmount}
            keyboardType="numeric"
            autoFocus
          />
          <Text style={[styles.modalSub, { marginTop: 10 }]}>Trạng thái nhận cọc</Text>
          <View style={styles.depositRxRow}>
            {([
              { id: '' as DepositReceived, label: 'Chưa xác định' },
              { id: 'yes' as DepositReceived, label: 'Đã nhận' },
              { id: 'no' as DepositReceived, label: 'Chưa nhận' },
            ]).map((opt) => (
              <Pressable
                key={opt.id || 'unk'}
                style={[styles.depositChip, depositReceived === opt.id && styles.depositChipOn]}
                onPress={() => setDepositReceived(opt.id)}
              >
                <Text style={[styles.depositChipTxt, depositReceived === opt.id && styles.depositChipTxtOn]}>
                  {opt.label}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.modalSub, { marginTop: 10 }]}>Mô tả</Text>
          <TextInput
            style={styles.depositInput}
            placeholder="VD: ký HĐ, lệnh SX…"
            placeholderTextColor={Colors.textFaint}
            value={depositLabel}
            onChangeText={setDepositLabel}
          />
          <View style={styles.modalRow}>
            <Pressable style={[styles.modalBtn, styles.modalCancel]} onPress={() => setDepositOpen(false)}>
              <Text style={styles.modalCancelTxt}>Hủy</Text>
            </Pressable>
            <Pressable
              style={[styles.modalBtn, styles.modalOkBlue, savingDeposit && { opacity: 0.6 }]}
              disabled={savingDeposit}
              onPress={() => void saveDeposit()}
            >
              <Text style={styles.modalOkTxt}>Lưu</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

function makeStyles(C: ThemeColors) {
  return StyleSheet.create({
    pad: { padding: Spacing.md, paddingBottom: 40, gap: 12 },
    card: {
      backgroundColor: C.card,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: C.borderSoft,
      padding: Spacing.md,
    },
    cardHead: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 10,
    },
    cardTitle: { fontSize: 15, fontWeight: '800', color: C.text },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingVertical: 7,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.borderSoft,
    },
    infoLabel: { width: 88, fontSize: 12, color: C.textMuted, fontWeight: '600' },
    infoValue: { flex: 1, fontSize: 13, color: C.text, fontWeight: '600' },
    infoLink: { color: C.blue },
    rowAction: {
      backgroundColor: C.blueSoft,
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: Radii.sm,
    },
    rowActionTxt: { color: C.purple, fontWeight: '800', fontSize: 12 },
    deadlineBtn: {
      backgroundColor: C.orangeSoft,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: Radii.sm,
    },
    deadlineBtnTxt: { color: C.orange, fontWeight: '800', fontSize: 12 },
    deadlineValue: { fontSize: 15, fontWeight: '700', color: C.text },
    deadlineReason: { marginTop: 4, fontSize: 12, fontStyle: 'italic', color: C.textMuted },
    clearBtn: { marginTop: 10, alignSelf: 'flex-start' },
    clearBtnTxt: { color: C.red, fontWeight: '700', fontSize: 12 },
    emptyHint: { fontSize: 13, color: C.textMuted },
    projectRow: {
      paddingVertical: 8,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: C.borderSoft,
      gap: 2,
    },
    projectCode: { fontSize: 12, fontWeight: '800', color: C.cyan },
    projectName: { fontSize: 14, fontWeight: '700', color: C.text },
    metaMuted: { fontSize: 12, color: C.textMuted },
    primaryBadge: {
      alignSelf: 'flex-start',
      marginTop: 4,
      backgroundColor: C.greenSoft,
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: Radii.sm,
    },
    primaryBadgeTxt: { fontSize: 11, fontWeight: '700', color: C.green },
    modalBg: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.55)',
    },
    modalCard: {
      position: 'absolute',
      left: 20,
      right: 20,
      top: '24%',
      backgroundColor: C.bgElevated,
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: C.border,
      padding: 18,
    },
    modalTitle: { fontSize: 16, fontWeight: '800', color: C.text },
    modalSub: { marginTop: 4, fontSize: 13, color: C.textMuted, fontWeight: '600' },
    reasonInput: {
      marginTop: 12,
      minHeight: 88,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: Radii.md,
      padding: 12,
      color: C.text,
      textAlignVertical: 'top',
      fontSize: 14,
      backgroundColor: C.surfaceSoft,
    },
    depositInput: {
      marginTop: 6,
      minHeight: 42,
      borderWidth: 1,
      borderColor: C.border,
      borderRadius: Radii.md,
      paddingHorizontal: 12,
      paddingVertical: 10,
      color: C.text,
      fontSize: 14,
      backgroundColor: C.surfaceSoft,
    },
    depositRxRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
    depositChip: {
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: Radii.sm,
      backgroundColor: C.surfaceSoft,
      borderWidth: 1,
      borderColor: C.borderSoft,
    },
    depositChipOn: { backgroundColor: C.blueSoft, borderColor: C.blue },
    depositChipTxt: { fontSize: 12, fontWeight: '700', color: C.textMuted },
    depositChipTxtOn: { color: C.blue },
    modalRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
    modalBtn: {
      flex: 1,
      height: 42,
      borderRadius: Radii.md,
      alignItems: 'center',
      justifyContent: 'center',
    },
    modalCancel: { backgroundColor: C.surfaceSoft, borderWidth: 1, borderColor: C.border },
    modalCancelTxt: { color: C.textMuted, fontWeight: '700' },
    modalOk: { backgroundColor: C.orange },
    modalOkBlue: { backgroundColor: C.blue },
    modalOkTxt: { color: '#fff', fontWeight: '800' },
  });
}
