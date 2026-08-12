import Ionicons from '@expo/vector-icons/Ionicons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../api/client';
import type { AuthUser } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  createWorkshopIntake,
  fetchCompanies,
  fetchCompanyRegions,
  fetchExternalCompanies,
  fetchWorkshopTypes,
  type CompanyOption,
  type ExternalCompanyOption,
  type RegionOption,
  type WorkshopTypeOption,
} from '../lib/productionApi';
import { HIT_TARGET, Radii, Spacing, colorWithAlpha } from '../theme';

import SpinningLoader from './SpinningLoader';
type FilterOption = { id: string; label: string };

type Props = {
  visible: boolean;
  user?: AuthUser | null;
  onClose: () => void;
  onCreated: (msg: string) => void;
};

type PickerKind = 'company' | 'workshop' | 'external' | 'region' | null;

const VALUE_STEP = 1_000_000;

function initials(name?: string | null): string {
  if (!name) return '?';
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

function formatVnd(n: number): string {
  if (!n) return '0đ';
  return `${new Intl.NumberFormat('vi-VN').format(n)}đ`;
}

export default function CreateDealModal({ visible, user, onClose, onCreated }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const isSystemAdmin = user?.role === 'admin' && !user?.company_id;

  const [step, setStep] = useState<1 | 2>(1);
  const [title, setTitle] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [workshopTypeId, setWorkshopTypeId] = useState('');
  const [regionId, setRegionId] = useState('');
  const [externalPick, setExternalPick] = useState('');
  const [externalNewName, setExternalNewName] = useState('');
  const [installAddress, setInstallAddress] = useState('');
  const [estimatedValue, setEstimatedValue] = useState(0);
  const [description, setDescription] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerCompany, setCustomerCompany] = useState('');

  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [workTypes, setWorkTypes] = useState<WorkshopTypeOption[]>([]);
  const [externalCompanies, setExternalCompanies] = useState<ExternalCompanyOption[]>([]);
  const [regions, setRegions] = useState<RegionOption[]>([]);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [picker, setPicker] = useState<PickerKind>(null);
  const [showExternalForm, setShowExternalForm] = useState(false);

  const canPickCompany = isSystemAdmin || companies.length > 1;

  const assigneeName = user?.full_name || user?.fullName || user?.email || 'Bạn';

  const styles = useMemo(
    () =>
      StyleSheet.create({
        root: { flex: 1, backgroundColor: colors.bg },
        header: {
          paddingHorizontal: Spacing.lg,
          paddingTop: Spacing.sm,
          paddingBottom: Spacing.md,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        headerTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
        closeBtn: {
          width: 36,
          height: 36,
          borderRadius: 18,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.cardAlt,
          marginTop: 2,
        },
        headerIcon: {
          width: 40,
          height: 40,
          borderRadius: 12,
          backgroundColor: colorWithAlpha(colors.primary, 0.18),
          alignItems: 'center',
          justifyContent: 'center',
        },
        headerTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
        headerSub: { color: colors.textFaint, fontSize: 12, marginTop: 4, lineHeight: 17 },
        progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
        progressTrack: {
          flex: 1,
          height: 4,
          borderRadius: 2,
          backgroundColor: colors.border,
          overflow: 'hidden',
        },
        progressFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 2 },
        progressLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
        scroll: { flex: 1 },
        scrollContent: { padding: Spacing.lg, paddingBottom: Spacing.xl },
        sectionTitle: {
          color: colors.primary,
          fontSize: 11,
          fontWeight: '800',
          letterSpacing: 0.8,
          marginBottom: 14,
        },
        field: { marginBottom: 14 },
        label: { color: colors.textMuted, fontSize: 13, fontWeight: '600', marginBottom: 6 },
        required: { color: colors.danger },
        input: {
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radii.md,
          paddingHorizontal: 14,
          paddingVertical: 12,
          fontSize: 15,
          color: colors.text,
        },
        inputError: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
        selectBtn: {
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radii.md,
          paddingHorizontal: 14,
          paddingVertical: 13,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        },
        selectText: { color: colors.text, fontSize: 15, flex: 1 },
        selectPlaceholder: { color: colors.textFaint },
        lockedCompany: {
          backgroundColor: colorWithAlpha(colors.primary, 0.12),
          borderWidth: 1,
          borderColor: colorWithAlpha(colors.primary, 0.35),
          borderRadius: Radii.md,
          paddingHorizontal: 14,
          paddingVertical: 12,
        },
        lockedCompanyText: { color: colors.primary, fontSize: 15, fontWeight: '600' },
        warnBox: {
          backgroundColor: colorWithAlpha(colors.warning, 0.12),
          borderWidth: 1,
          borderColor: colorWithAlpha(colors.warning, 0.35),
          borderRadius: Radii.md,
          padding: 12,
          flexDirection: 'row',
          gap: 8,
        },
        warnText: { flex: 1, color: colors.warning, fontSize: 12, lineHeight: 18 },
        optionalHint: { color: colors.textFaint, fontSize: 11, marginTop: 4 },
        linkBtn: {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingVertical: 8,
        },
        linkBtnText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
        valueRow: {
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radii.md,
          overflow: 'hidden',
        },
        valueBtn: {
          width: 48,
          height: 48,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.cardAlt,
        },
        valueInput: {
          flex: 1,
          textAlign: 'center',
          fontSize: 16,
          fontWeight: '700',
          color: colors.text,
          paddingVertical: 12,
        },
        textarea: { minHeight: 88, textAlignVertical: 'top' },
        previewCard: {
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colorWithAlpha(colors.primary, 0.35),
          borderRadius: Radii.lg,
          padding: Spacing.md,
          marginBottom: 14,
        },
        previewBadge: { color: colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
        previewTitle: { color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 6, minHeight: 22 },
        previewTitleEmpty: { color: colors.textFaint, fontWeight: '500', fontStyle: 'italic' },
        previewAssignee: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 },
        avatar: {
          width: 28,
          height: 28,
          borderRadius: 14,
          backgroundColor: colorWithAlpha(colors.primary, 0.25),
          alignItems: 'center',
          justifyContent: 'center',
        },
        avatarText: { color: colors.primary, fontSize: 10, fontWeight: '800' },
        assigneeName: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
        kanbanHint: {
          marginTop: 10,
          padding: 12,
          borderRadius: Radii.md,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: colors.border,
          backgroundColor: colors.cardAlt,
          alignItems: 'center',
        },
        kanbanHintTitle: { color: colors.textFaint, fontSize: 10 },
        kanbanHintSub: { color: colors.textMuted, fontSize: 13, fontWeight: '700', marginTop: 2 },
        confirmBox: {
          backgroundColor: colors.cardAlt,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: Radii.lg,
          padding: Spacing.md,
          marginBottom: 14,
        },
        confirmRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
        confirmLabel: { color: colors.textFaint, fontSize: 13 },
        confirmValue: { color: colors.text, fontSize: 13, fontWeight: '700', maxWidth: '58%', textAlign: 'right' },
        confirmValuePrimary: { color: colors.primary },
        confirmValueMoney: { color: colors.warning, fontWeight: '800' },
        errBox: {
          backgroundColor: colors.dangerSoft,
          borderWidth: 1,
          borderColor: colors.danger,
          borderRadius: Radii.md,
          padding: 10,
          marginBottom: 12,
        },
        errText: { color: colors.danger, fontSize: 13, fontWeight: '600' },
        footer: {
          flexDirection: 'row',
          gap: 10,
          paddingHorizontal: Spacing.lg,
          paddingTop: 12,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.bgElevated,
        },
        footerBtn: {
          flex: 1,
          minHeight: HIT_TARGET + 4,
          borderRadius: Radii.md,
          alignItems: 'center',
          justifyContent: 'center',
          borderWidth: 1,
          borderColor: colors.borderStrong,
        },
        footerBtnGhost: { backgroundColor: colors.card },
        footerBtnPrimary: { backgroundColor: colors.primary, borderColor: colors.primary },
        footerBtnText: { fontSize: 15, fontWeight: '800', color: colors.text },
        footerBtnTextPrimary: { color: colors.white },
        footerBtnDisabled: { opacity: 0.5 },
        pickerOverlay: {
          ...StyleSheet.absoluteFillObject,
          justifyContent: 'flex-end',
          zIndex: 100,
          elevation: 100,
        },
        pickerBackdrop: {
          ...StyleSheet.absoluteFillObject,
          backgroundColor: 'rgba(0,0,0,0.55)',
        },
        pickerSheet: {
          backgroundColor: colors.bgElevated,
          borderTopLeftRadius: Radii.xl,
          borderTopRightRadius: Radii.xl,
          maxHeight: '55%',
          borderWidth: 1,
          borderColor: colors.border,
          borderBottomWidth: 0,
        },
        pickerHeader: {
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: Spacing.lg,
          paddingVertical: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        },
        pickerTitle: { flex: 1, color: colors.text, fontSize: 16, fontWeight: '800' },
        pickerRow: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: Spacing.lg,
          paddingVertical: 14,
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          minHeight: HIT_TARGET,
        },
        pickerRowActive: { backgroundColor: colors.primarySoft },
        pickerRowText: { flex: 1, color: colors.text, fontSize: 14, fontWeight: '600', marginRight: 8 },
        pickerRowTextActive: { color: colors.primary, fontWeight: '800' },
        pickerEmpty: { padding: Spacing.lg, alignItems: 'center' },
        pickerEmptyText: { color: colors.textMuted, fontSize: 14, textAlign: 'center' },
      }),
    [colors],
  );

  const reset = useCallback(() => {
    setStep(1);
    setTitle('');
    setCompanyId(user?.company_id ? String(user.company_id) : '');
    setWorkshopTypeId('');
    setRegionId('');
    setExternalPick('');
    setExternalNewName('');
    setShowExternalForm(false);
    setInstallAddress('');
    setEstimatedValue(0);
    setDescription('');
    setCustomerName('');
    setCustomerPhone('');
    setCustomerEmail('');
    setCustomerCompany('');
    setErr('');
    setPicker(null);
  }, [user?.company_id]);

  useEffect(() => {
    if (!visible) return;
    reset();
    let cancelled = false;
    setLoadingMeta(true);
    fetchCompanies()
      .then((list) => {
        if (cancelled) return;
        setCompanies(list);
        if (isSystemAdmin) return;
        const userCo = user?.company_id ? String(user.company_id) : '';
        if (userCo && list.some((c) => c.id === userCo)) {
          setCompanyId(userCo);
        } else if (list.length === 1) {
          setCompanyId(list[0].id);
        } else if (userCo) {
          setCompanyId(userCo);
        }
      })
      .catch(() => {
        if (!cancelled) setCompanies([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingMeta(false);
      });
    return () => { cancelled = true; };
  }, [visible, reset, isSystemAdmin, user?.company_id]);

  useEffect(() => {
    if (!visible || !companyId) {
      setWorkTypes([]);
      setExternalCompanies([]);
      setRegions([]);
      setWorkshopTypeId('');
      setRegionId('');
      setExternalPick('');
      setExternalNewName('');
      return;
    }
    let cancelled = false;
    setLoadingMeta(true);
    Promise.all([
      fetchWorkshopTypes(companyId),
      fetchExternalCompanies(companyId),
      fetchCompanyRegions(companyId),
    ])
      .then(([wt, ext, regAll]) => {
        if (cancelled) return;
        const assigned = Array.isArray(user?.crm_region_ids)
          ? user!.crm_region_ids!.map(String).filter(Boolean)
          : [];
        const isFullCompanyAdmin =
          isSystemAdmin || user?.role === 'admin' || user?.role === 'sales_admin';
        const reg = assigned.length > 0 && !isFullCompanyAdmin
          ? regAll.filter((r) => assigned.includes(r.id))
          : regAll;
        setWorkTypes(wt);
        setExternalCompanies(ext);
        setRegions(reg);
        if (wt.length === 1) setWorkshopTypeId(wt[0].id);
        if (reg.length === 1) setRegionId(reg[0].id);
      })
      .catch(() => {
        if (!cancelled) {
          setWorkTypes([]);
          setExternalCompanies([]);
          setRegions([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingMeta(false);
      });
    return () => { cancelled = true; };
  }, [visible, companyId, isSystemAdmin, user?.crm_region_ids, user?.role]);

  const isFullCompanyAdmin =
    isSystemAdmin || user?.role === 'admin' || user?.role === 'sales_admin';

  const companyName = companies.find((c) => c.id === companyId)?.name
    || (user?.company_id && String(user.company_id) === companyId ? 'Công ty của bạn' : '');
  const workTypeName = workTypes.find((t) => t.id === workshopTypeId)?.name || '';
  const regionName = (() => {
    const hit = regions.find((r) => r.id === regionId);
    if (!hit) return '';
    return hit.divisionName ? `${hit.name} — ${hit.divisionName}` : hit.name;
  })();

  const resolvedExternalName = useMemo(() => {
    if (!externalPick) return '';
    if (externalPick === '__new__') return externalNewName.trim();
    return externalCompanies.find((c) => c.id === externalPick)?.name || '';
  }, [externalPick, externalNewName, externalCompanies]);

  const close = () => {
    if (busy) return;
    reset();
    onClose();
  };

  const validateStep1 = (): string | null => {
    if (!title.trim()) return 'Nhập tên Deal.';
    if (!companyId) return 'Chọn công ty SX.';
    if (!workTypes.length) return 'Công ty chưa cấu hình phân loại xưởng.';
    if (!workshopTypeId) return 'Chọn phân loại xưởng.';
    if (regions.length > 0 && !regionId) return 'Chọn khu vực.';
    if (!resolvedExternalName) {
      return 'Chọn hoặc nhập công ty ngoài / đối tác.';
    }
    if (externalPick === '__new__' && !externalNewName.trim()) {
      return 'Nhập tên công ty ngoài / đối tác.';
    }
    return null;
  };

  const validateStep2 = (): string | null => {
    if (!customerName.trim()) return 'Nhập tên khách hàng.';
    if (!customerPhone.trim()) return 'Nhập số điện thoại khách hàng.';
    return null;
  };

  const goNext = () => {
    setErr('');
    const v = validateStep1();
    if (v) { setErr(v); return; }
    setStep(2);
  };

  const submit = async () => {
    setErr('');
    const v1 = validateStep1();
    if (v1) { setStep(1); setErr(v1); return; }
    const v2 = validateStep2();
    if (v2) { setErr(v2); return; }

    setBusy(true);
    try {
      const t0 = Date.now();
      const res = await createWorkshopIntake({
        title,
        company_id: companyId,
        workshop_type_id: workshopTypeId,
        region_id: regionId || null,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_email: customerEmail || null,
        install_address: installAddress || null,
        estimated_value: estimatedValue,
        description: description || null,
        external_company_name: resolvedExternalName || null,
      });
      const elapsedMs = Date.now() - t0;
      const apiMs = Number(res?.timing?.api_total_ms ?? res?.timing?.total_ms);
      const elapsedLabel = elapsedMs < 1000 ? `${elapsedMs}ms` : `${(elapsedMs / 1000).toFixed(1)}s`;
      const apiLabel = Number.isFinite(apiMs)
        ? (apiMs < 1000 ? `${Math.round(apiMs)}ms` : `${(apiMs / 1000).toFixed(1)}s`)
        : elapsedLabel;
      reset();
      const code = res.project_code || res.deal_code || '';
      onCreated(
        code
          ? `Đã tạo đơn xưởng ${code} (${elapsedLabel}, API ${apiLabel})`
          : `Đã tạo đơn xưởng (${elapsedLabel}, API ${apiLabel})`,
      );
      onClose();
    } catch (e) {
      setErr(formatApiError(e));
    } finally {
      setBusy(false);
    }
  };

  const pickerOptions = useMemo((): FilterOption[] => {
    if (picker === 'company') {
      return companies.map((c) => ({ id: c.id, label: c.name }));
    }
    if (picker === 'workshop') {
      return workTypes.map((t) => ({ id: t.id, label: t.name }));
    }
    if (picker === 'region') {
      return regions.map((r) => ({
        id: r.id,
        label: r.divisionName ? `${r.name} — ${r.divisionName}` : r.name,
      }));
    }
    if (picker === 'external') {
      return [
        ...externalCompanies.map((c) => ({ id: c.id, label: c.name })),
        { id: '__new__', label: '➕ Nhập công ty mới…' },
      ];
    }
    return [];
  }, [picker, companies, workTypes, regions, externalCompanies]);

  const pickerSelected = picker === 'company' ? companyId
    : picker === 'workshop' ? workshopTypeId
      : picker === 'region' ? regionId
        : externalPick;

  const onPickerSelect = (id: string) => {
    if (picker === 'company') {
      setCompanyId(id);
      setWorkshopTypeId('');
      setRegionId('');
      setExternalPick('');
      setExternalNewName('');
    } else if (picker === 'workshop') {
      setWorkshopTypeId(id);
    } else if (picker === 'region') {
      setRegionId(id);
    } else if (picker === 'external') {
      setExternalPick(id);
      if (id !== '__new__') setExternalNewName('');
      setShowExternalForm(id === '__new__');
    }
    setPicker(null);
  };

  const pickerTitle =
    picker === 'company' ? 'Chọn công ty SX'
      : picker === 'workshop' ? 'Phân loại xưởng'
        : picker === 'region' ? 'Khu vực'
          : picker === 'external' ? 'Công ty ngoài / Đối tác'
            : '';

  const progress = step === 1 ? 0.5 : 1;

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView
        style={[styles.root, { paddingTop: insets.top }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <Pressable style={styles.closeBtn} onPress={close} hitSlop={8}>
              <Ionicons name="close" size={22} color={colors.textMuted} />
            </Pressable>
            <View style={styles.headerIcon}>
              <Ionicons name="business" size={22} color={colors.primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Tạo đơn xưởng</Text>
              <Text style={styles.headerSub}>
                Tạo trực tiếp trên Kanban SX — không qua pipeline CRM
              </Text>
            </View>
          </View>
          <View style={styles.progressRow}>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${progress * 100}%` }]} />
            </View>
            <Text style={styles.progressLabel}>Bước {step} / 2</Text>
          </View>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {err ? (
            <View style={styles.errBox}>
              <Text style={styles.errText}>{err}</Text>
            </View>
          ) : null}

          {step === 1 ? (
            <>
              <Text style={styles.sectionTitle}>THÔNG TIN ĐƠN</Text>

              <View style={styles.field}>
                <Text style={styles.label}>
                  Tên Deal <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="VD: Tủ bếp gỗ sồi nhà anh Minh"
                  placeholderTextColor={colors.textFaint}
                  value={title}
                  onChangeText={setTitle}
                  editable={!busy}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>
                  Công ty SX <Text style={styles.required}>*</Text>
                </Text>
                {canPickCompany ? (
                  <TouchableOpacity
                    style={[styles.selectBtn, !companyId && styles.inputError]}
                    onPress={() => setPicker('company')}
                    disabled={busy || loadingMeta}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.selectText, !companyId && styles.selectPlaceholder]}>
                      {loadingMeta ? 'Đang tải…' : companyName || '-- Chọn --'}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color={colors.textFaint} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.lockedCompany}>
                    <Text style={styles.lockedCompanyText}>{companyName || 'Công ty của bạn'}</Text>
                  </View>
                )}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>
                  Phân loại xưởng <Text style={styles.required}>*</Text>
                </Text>
                {workTypes.length > 0 ? (
                  <TouchableOpacity
                    style={[styles.selectBtn, !workshopTypeId && styles.inputError]}
                    onPress={() => setPicker('workshop')}
                    disabled={busy || !companyId}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.selectText, !workshopTypeId && styles.selectPlaceholder]}>
                      {workTypeName || '-- Chọn --'}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color={colors.textFaint} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.warnBox}>
                    <Ionicons name="warning" size={18} color={colors.warning} />
                    <Text style={styles.warnText}>
                      Công ty chưa cấu hình phân loại xưởng — vào Cài đặt pipeline SX để thêm.
                    </Text>
                  </View>
                )}
              </View>

              {regions.length > 0 && (
                <View style={styles.field}>
                  <Text style={styles.label}>
                    Khu vực <Text style={styles.required}>*</Text>
                  </Text>
                  <TouchableOpacity
                    style={[styles.selectBtn, !regionId && styles.inputError]}
                    onPress={() => setPicker('region')}
                    disabled={busy}
                    activeOpacity={0.85}
                  >
                    <Text style={[styles.selectText, !regionId && styles.selectPlaceholder]}>
                      {regionName || '-- Chọn --'}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color={colors.textFaint} />
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.field}>
                <Text style={styles.label}>
                  Công ty ngoài / Đối tác <Text style={styles.required}>*</Text>
                </Text>
                <TouchableOpacity
                  style={[styles.selectBtn, !resolvedExternalName && styles.inputError]}
                  onPress={() => {
                    if (!companyId) {
                      setErr('Chọn công ty SX trước khi chọn đối tác.');
                      return;
                    }
                    setPicker('external');
                  }}
                  disabled={busy}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.selectText, !resolvedExternalName && styles.selectPlaceholder]}>
                    {resolvedExternalName || '-- Chọn --'}
                  </Text>
                  <Ionicons name="chevron-down" size={18} color={colors.textFaint} />
                </TouchableOpacity>
                {externalPick === '__new__' && (
                  <TextInput
                    style={[styles.input, { marginTop: 8 }, !externalNewName.trim() && styles.inputError]}
                    placeholder="VD: Công ty đối tác B2B"
                    placeholderTextColor={colors.textFaint}
                    value={externalNewName}
                    onChangeText={setExternalNewName}
                    editable={!busy}
                  />
                )}
                {!externalCompanies.length && companyId ? (
                  <TouchableOpacity
                    style={[styles.linkBtn, { marginTop: 8 }]}
                    onPress={() => {
                      setExternalPick('__new__');
                      setShowExternalForm(true);
                      setErr('');
                    }}
                    disabled={busy}
                    activeOpacity={0.85}
                  >
                    <Ionicons name="add-circle-outline" size={18} color={colors.primary} />
                    <Text style={styles.linkBtnText}>Nhập công ty ngoài mới</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Địa chỉ lắp đặt</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Số nhà, đường, quận/huyện, TP..."
                  placeholderTextColor={colors.textFaint}
                  value={installAddress}
                  onChangeText={setInstallAddress}
                  editable={!busy}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Giá trị (VNĐ)</Text>
                <View style={styles.valueRow}>
                  <TouchableOpacity
                    style={styles.valueBtn}
                    onPress={() => setEstimatedValue((v) => Math.max(0, v - VALUE_STEP))}
                    disabled={busy}
                  >
                    <Ionicons name="remove" size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                  <TextInput
                    style={styles.valueInput}
                    keyboardType="number-pad"
                    value={estimatedValue ? String(estimatedValue) : '0'}
                    onChangeText={(t) => {
                      const digits = t.replace(/[^\d]/g, '');
                      setEstimatedValue(digits ? Number(digits) : 0);
                    }}
                    editable={!busy}
                  />
                  <TouchableOpacity
                    style={styles.valueBtn}
                    onPress={() => setEstimatedValue((v) => v + VALUE_STEP)}
                    disabled={busy}
                  >
                    <Ionicons name="add" size={20} color={colors.textMuted} />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Ghi chú</Text>
                <TextInput
                  style={[styles.input, styles.textarea]}
                  placeholder="Ghi chú thêm về deal..."
                  placeholderTextColor={colors.textFaint}
                  value={description}
                  onChangeText={setDescription}
                  editable={!busy}
                  multiline
                />
              </View>
            </>
          ) : (
            <>
              <Text style={styles.sectionTitle}>THÔNG TIN KHÁCH HÀNG</Text>

              <View style={styles.field}>
                <Text style={styles.label}>
                  Tên khách hàng <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="Nguyễn Văn A"
                  placeholderTextColor={colors.textFaint}
                  value={customerName}
                  onChangeText={setCustomerName}
                  editable={!busy}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>
                  Số điện thoại <Text style={styles.required}>*</Text>
                </Text>
                <TextInput
                  style={styles.input}
                  placeholder="0901 234 567"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="phone-pad"
                  value={customerPhone}
                  onChangeText={setCustomerPhone}
                  editable={!busy}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Email</Text>
                <TextInput
                  style={styles.input}
                  placeholder="email@example.com"
                  placeholderTextColor={colors.textFaint}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={customerEmail}
                  onChangeText={setCustomerEmail}
                  editable={!busy}
                />
              </View>

              <View style={styles.field}>
                <Text style={styles.label}>Công ty KH</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Tên công ty khách hàng (nếu có)"
                  placeholderTextColor={colors.textFaint}
                  value={customerCompany}
                  onChangeText={setCustomerCompany}
                  editable={!busy}
                />
              </View>

              <Text style={[styles.sectionTitle, { marginTop: 8 }]}>XEM TRƯỚC THẺ XƯỞNG</Text>
              <View style={styles.previewCard}>
                <Text style={styles.previewBadge}>SX</Text>
                <Text style={[styles.previewTitle, !title.trim() && styles.previewTitleEmpty]}>
                  {title.trim() || 'Chưa có tên...'}
                </Text>
                <View style={styles.previewAssignee}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initials(assigneeName)}</Text>
                  </View>
                  <Text style={styles.assigneeName}>{assigneeName}</Text>
                </View>
                <View style={styles.kanbanHint}>
                  <Text style={styles.kanbanHintTitle}>Kanban SX</Text>
                  <Text style={styles.kanbanHintSub}>Cột «Chờ vào xưởng»</Text>
                </View>
              </View>

              <Text style={styles.sectionTitle}>XÁC NHẬN</Text>
              <View style={styles.confirmBox}>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Công ty SX</Text>
                  <Text style={[styles.confirmValue, styles.confirmValuePrimary]} numberOfLines={2}>
                    {companyName || '— Chọn —'}
                  </Text>
                </View>
                <View style={styles.confirmRow}>
                  <Text style={styles.confirmLabel}>Giá trị</Text>
                  <Text style={[styles.confirmValue, styles.confirmValueMoney]}>
                    {formatVnd(estimatedValue)}
                  </Text>
                </View>
                <View style={[styles.confirmRow, { marginBottom: 0 }]}>
                  <Text style={styles.confirmLabel}>Phụ trách</Text>
                  <Text style={[styles.confirmValue, styles.confirmValuePrimary]} numberOfLines={2}>
                    {assigneeName}
                  </Text>
                </View>
              </View>
            </>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {step === 1 ? (
            <>
              <TouchableOpacity
                style={[styles.footerBtn, styles.footerBtnGhost, busy && styles.footerBtnDisabled]}
                onPress={close}
                disabled={busy}
                activeOpacity={0.85}
              >
                <Text style={styles.footerBtnText}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.footerBtn,
                  styles.footerBtnPrimary,
                  (busy || !workTypes.length) && styles.footerBtnDisabled,
                ]}
                onPress={goNext}
                disabled={busy || !workTypes.length}
                activeOpacity={0.85}
              >
                <Text style={[styles.footerBtnText, styles.footerBtnTextPrimary]}>Tiếp theo →</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                style={[styles.footerBtn, styles.footerBtnGhost, busy && styles.footerBtnDisabled]}
                onPress={() => { setErr(''); setStep(1); }}
                disabled={busy}
                activeOpacity={0.85}
              >
                <Text style={styles.footerBtnText}>Quay lại</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.footerBtn, styles.footerBtnPrimary, busy && styles.footerBtnDisabled]}
                onPress={submit}
                disabled={busy}
                activeOpacity={0.85}
              >
                {busy ? (
                  <SpinningLoader color={colors.white} />
                ) : (
                  <Text style={[styles.footerBtnText, styles.footerBtnTextPrimary]}>🏭 Tạo & vào xưởng</Text>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

        {picker != null ? (
          <View style={styles.pickerOverlay} pointerEvents="box-none">
            <Pressable style={styles.pickerBackdrop} onPress={() => setPicker(null)} />
            <View style={[styles.pickerSheet, { paddingBottom: Math.max(insets.bottom, 16) }]}>
              <View style={styles.pickerHeader}>
                <Text style={styles.pickerTitle}>{pickerTitle}</Text>
                <TouchableOpacity onPress={() => setPicker(null)} hitSlop={8}>
                  <Ionicons name="close" size={22} color={colors.textMuted} />
                </TouchableOpacity>
              </View>
              {pickerOptions.length === 0 ? (
                <View style={styles.pickerEmpty}>
                  <Text style={styles.pickerEmptyText}>
                    {picker === 'company'
                      ? 'Không có công ty SX — kiểm tra quyền hoặc cấu hình module Sản xuất.'
                      : picker === 'external'
                        ? 'Chưa có đối tác — chọn «Nhập công ty mới» bên dưới form.'
                        : 'Không có lựa chọn.'}
                  </Text>
                  {picker === 'external' ? (
                    <TouchableOpacity
                      style={[styles.footerBtn, styles.footerBtnPrimary, { marginTop: 16, alignSelf: 'stretch' }]}
                      onPress={() => {
                        setExternalPick('__new__');
                        setShowExternalForm(true);
                        setPicker(null);
                        setErr('');
                      }}
                    >
                      <Text style={[styles.footerBtnText, styles.footerBtnTextPrimary]}>➕ Nhập công ty mới</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : (
                <FlatList
                  data={pickerOptions}
                  keyExtractor={(item) => item.id || '__none__'}
                  keyboardShouldPersistTaps="handled"
                  style={{ maxHeight: 360 }}
                  renderItem={({ item }) => {
                    const active = pickerSelected === item.id;
                    return (
                      <TouchableOpacity
                        style={[styles.pickerRow, active && styles.pickerRowActive]}
                        onPress={() => onPickerSelect(item.id)}
                        activeOpacity={0.75}
                      >
                        <Text style={[styles.pickerRowText, active && styles.pickerRowTextActive]} numberOfLines={2}>
                          {item.label}
                        </Text>
                        {active ? (
                          <Ionicons name="checkmark-circle" size={20} color={colors.primary} />
                        ) : null}
                      </TouchableOpacity>
                    );
                  }}
                />
              )}
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}
