import Ionicons from '@expo/vector-icons/Ionicons';
import SpinningLoader from '../components/SpinningLoader';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatApiError } from '../api/client';
import {
  createCrmEntity,
  fetchCrmCompanies,
  fetchCrmCompanyRegions,
  fetchCrmCompanyUsers,
  fetchCrmLeadTypes,
  fetchCrmReferrers,
  fetchCrmSources,
  invalidateCrmBootstrapCache,
  invalidateCrmHubCache,
  invalidateCrmTotalsCache,
  invalidatePlannerCache,
  invalidatePipelineStagesCache,
  type CrmCompanyOption,
  type CrmOption,
} from '../api/crm';
import { currentUserId, useAuth } from '../context/AuthContext';
import { colorFromName, initialsFromName } from '../lib/media';
import type { RootStackParamList } from '../navigation/types';
import { Radii, useColors, type ThemeColors } from '../theme';
import PickerSheet from '../components/PickerSheet';
import DatePickerSheet from '../components/DatePickerSheet';

type Props = NativeStackScreenProps<RootStackParamList, 'CreateEntity'>;

type PickerKind = 'company' | 'region' | 'source' | 'leadType' | 'referrer' | 'assignee' | null;

const VALUE_STEP = 1_000_000;

function groupNumber(n: number): string {
  if (!n) return '0';
  return Math.round(n).toLocaleString('vi-VN');
}
function formatDeadline(iso?: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export default function CreateEntityScreen({ navigation, route }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const isLead = route.params.kind === 'lead';
  const accent = isLead ? Colors.blue : Colors.orange;
  const entityLabel = isLead ? 'Lead' : 'Deal';
  // Chỉ admin hệ thống mới tạo cho công ty khác; nhân viên bị khóa theo công ty của họ.
  const canPickCompany = String(user?.role || '').trim().toLowerCase() === 'admin';

  const [step, setStep] = useState<1 | 2>(1);

  // Bước 1 — thông tin Lead/Deal
  const [title, setTitle] = useState('');
  const [company, setCompany] = useState<CrmCompanyOption | null>(null);
  const [region, setRegion] = useState<CrmOption | null>(null);
  const [installAddress, setInstallAddress] = useState('');
  const [source, setSource] = useState<CrmOption | null>(null);
  const [leadType, setLeadType] = useState<CrmOption | null>(null);
  const [referrer, setReferrer] = useState<string>('');
  const [value, setValue] = useState(0);
  const [note, setNote] = useState('');

  // Bước 2 — thông tin khách hàng + phân công
  const [customerName, setCustomerName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [customerCompany, setCustomerCompany] = useState('');
  const [assignee, setAssignee] = useState<CrmOption | null>(null);
  const [deadline, setDeadline] = useState<string | null>(null);

  // Meta
  const [companies, setCompanies] = useState<CrmCompanyOption[]>([]);
  const [regions, setRegions] = useState<CrmOption[]>([]);
  const [sources, setSources] = useState<CrmOption[]>([]);
  const [leadTypes, setLeadTypes] = useState<CrmOption[]>([]);
  const [referrers, setReferrers] = useState<CrmOption[]>([]);
  const [users, setUsers] = useState<CrmOption[]>([]);
  const [metaLoading, setMetaLoading] = useState(false);

  const [picker, setPicker] = useState<PickerKind>(null);
  const [dateOpen, setDateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  const doneAnim = useRef(new Animated.Value(0)).current;

  // Tải công ty + người dùng + mặc định theo user.
  useEffect(() => {
    const ac = new AbortController();
    void (async () => {
      try {
        const [cos, us] = await Promise.all([
          fetchCrmCompanies(ac.signal).catch(() => []),
          fetchCrmCompanyUsers(user?.company_id || undefined, ac.signal).catch(() => []),
        ]);
        if (ac.signal.aborted) return;
        setCompanies(cos);
        setUsers(us);
        const myId = currentUserId(user);
        const me = us.find((u) => String(u.id) === String(myId));
        setAssignee(me || (myId ? { id: myId, name: user?.full_name || user?.fullName || 'Tôi' } : null));
        const defCo = cos.find((c) => String(c.id) === String(user?.company_id || ''));
        if (defCo) setCompany(defCo);
        else if (user?.company_id) {
          // Nhân viên: công ty có thể không nằm trong danh sách → vẫn khóa theo công ty của họ.
          setCompany({ id: String(user.company_id), name: 'Công ty của tôi' });
        }
      } catch {
        /* ignore */
      }
    })();
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Khi đổi công ty: nạp khu vực / nguồn / loại / người giới thiệu.
  useEffect(() => {
    const cid = company?.id;
    setRegion(null);
    setSource(null);
    setLeadType(null);
    setRegions([]);
    setSources([]);
    setLeadTypes([]);
    setReferrers([]);
    if (!cid) return;
    const ac = new AbortController();
    setMetaLoading(true);
    void (async () => {
      try {
        const [rg, sr, lt, rf] = await Promise.all([
          fetchCrmCompanyRegions(cid, company?.divisionUnitId, ac.signal).catch(() => []),
          fetchCrmSources(cid, ac.signal).catch(() => []),
          fetchCrmLeadTypes(cid, isLead ? 'lead' : 'deal', ac.signal).catch(() => []),
          fetchCrmReferrers(cid, ac.signal).catch(() => []),
        ]);
        if (ac.signal.aborted) return;
        setRegions(rg);
        setSources(sr);
        setLeadTypes(lt);
        setReferrers(rf);
        if (rg.length === 1) setRegion(rg[0]);
      } finally {
        if (!ac.signal.aborted) setMetaLoading(false);
      }
    })();
    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company?.id]);

  const goNext = () => {
    if (!title.trim()) {
      Alert.alert('Thiếu thông tin', `Nhập tên ${entityLabel}.`);
      return;
    }
    if (!company) {
      Alert.alert('Thiếu thông tin', 'Vui lòng chọn công ty.');
      return;
    }
    if (regions.length > 0 && !region) {
      Alert.alert('Thiếu thông tin', 'Vui lòng chọn khu vực.');
      return;
    }
    setStep(2);
  };

  const runSuccessAnim = () => {
    setDone(true);
    Animated.spring(doneAnim, { toValue: 1, useNativeDriver: true, friction: 6 }).start();
    setTimeout(() => {
      invalidatePipelineStagesCache();
      invalidateCrmBootstrapCache();
      invalidateCrmTotalsCache();
      invalidateCrmHubCache();
      invalidatePlannerCache();
      navigation.goBack();
    }, 1150);
  };

  const submit = async () => {
    if (!customerName.trim()) {
      Alert.alert('Thiếu thông tin', 'Nhập tên khách hàng.');
      return;
    }
    if (!phone.trim() && !isLead) {
      Alert.alert('Thiếu thông tin', 'Deal cần số điện thoại khách hàng.');
      return;
    }
    setSaving(true);
    try {
      await createCrmEntity({
        kind: route.params.kind,
        title,
        companyId: company?.id || null,
        regionId: region?.id || null,
        installAddress,
        sourceId: source?.id || null,
        leadTypeId: leadType?.id || null,
        referrerName: referrer || null,
        value,
        note,
        assignedTo: assignee?.id || null,
        deadline,
        customer: {
          name: customerName,
          phone,
          email,
          company: customerCompany,
        },
      });
      runSuccessAnim();
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
      setSaving(false);
    }
  };

  const summaryRows: { label: string; value: string }[] = [
    { label: 'Loại', value: leadType?.name || '— Không có —' },
    { label: 'Khu vực', value: region?.name || '— Chưa chọn —' },
    { label: 'Giá trị', value: value > 0 ? `${groupNumber(value)}đ` : '0đ' },
    { label: 'Phụ trách', value: assignee?.name || '—' },
  ];

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable style={styles.iconBtn} onPress={() => navigation.goBack()} hitSlop={8}>
          <Ionicons name="close" size={24} color={Colors.text} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <View style={styles.titleRow}>
            <Ionicons name={isLead ? 'person-add' : 'pricetags'} size={16} color={accent} />
            <Text style={styles.headerTitle}>Tạo {entityLabel} mới</Text>
          </View>
          <Text style={styles.headerSub}>Tạo trực tiếp · {isLead ? 'khách tiềm năng' : 'không qua Lead'}</Text>
        </View>
        <Text style={[styles.stepBadge, { color: accent }]}>Bước {step} / 2</Text>
      </View>

      <View style={styles.progressTrack}>
        <View style={[styles.progressSeg, { backgroundColor: accent }]} />
        <View style={[styles.progressSeg, { backgroundColor: step === 2 ? accent : Colors.border }]} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top + 60}
      >
        <ScrollView
          contentContainerStyle={{ padding: 16, paddingBottom: 28 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {step === 1 ? (
            <>
              <SectionTitle icon="document-text-outline" color={accent} text={`THÔNG TIN ${entityLabel.toUpperCase()}`} styles={styles} />

              <Labeled label={`Tên ${entityLabel}`} required styles={styles}>
                <TextInput
                  style={styles.input}
                  placeholder={isLead ? 'VD: Khách hỏi tủ bếp anh Minh' : 'VD: Tủ bếp gỗ sồi nhà anh Minh'}
                  placeholderTextColor={Colors.textFaint}
                  value={title}
                  onChangeText={setTitle}
                />
              </Labeled>

              <View style={styles.row2}>
                <Labeled label="Công ty" required flex styles={styles}>
                  <SelectBox
                    placeholder="-- Chọn --"
                    value={company?.shortName || company?.name}
                    onPress={() => setPicker('company')}
                    locked={!canPickCompany}
                    styles={styles}
                    Colors={Colors}
                  />
                </Labeled>
                <Labeled label="Khu vực" required={regions.length > 0} flex styles={styles}>
                  <SelectBox
                    placeholder="-- Chọn --"
                    value={region?.name}
                    loading={metaLoading}
                    disabled={!company}
                    onPress={() => setPicker('region')}
                    styles={styles}
                    Colors={Colors}
                  />
                </Labeled>
              </View>

              <Labeled label="Địa chỉ lắp đặt" styles={styles}>
                <TextInput
                  style={styles.input}
                  placeholder="Số nhà, đường, quận/huyện, TP..."
                  placeholderTextColor={Colors.textFaint}
                  value={installAddress}
                  onChangeText={setInstallAddress}
                />
              </Labeled>

              <View style={styles.row2}>
                <Labeled label="Nguồn" flex styles={styles}>
                  <SelectBox
                    placeholder="-- Nguồn --"
                    value={source?.name}
                    disabled={!company}
                    onPress={() => setPicker('source')}
                    styles={styles}
                    Colors={Colors}
                  />
                </Labeled>
                <Labeled label={`Loại ${entityLabel}`} flex styles={styles}>
                  <SelectBox
                    placeholder="-- Không bắt buộc --"
                    value={leadType?.name}
                    disabled={!company}
                    onPress={() => setPicker('leadType')}
                    styles={styles}
                    Colors={Colors}
                  />
                </Labeled>
              </View>

              <Labeled label="Người giới thiệu" styles={styles}>
                <SelectBox
                  placeholder="-- Không chọn --"
                  value={referrer || undefined}
                  disabled={!company}
                  onPress={() => setPicker('referrer')}
                  styles={styles}
                  Colors={Colors}
                />
              </Labeled>

              <Labeled label="Giá trị (VNĐ)" styles={styles}>
                <View style={styles.stepper}>
                  <TouchableOpacity
                    style={styles.stepBtn}
                    onPress={() => setValue((v) => Math.max(0, v - VALUE_STEP))}
                  >
                    <Ionicons name="remove" size={22} color={Colors.text} />
                  </TouchableOpacity>
                  <TextInput
                    style={styles.stepValue}
                    value={groupNumber(value)}
                    onChangeText={(t) => setValue(parseInt(t.replace(/[^\d]/g, ''), 10) || 0)}
                    keyboardType="numeric"
                    textAlign="center"
                  />
                  <TouchableOpacity
                    style={[styles.stepBtn, { backgroundColor: accent, borderColor: accent }]}
                    onPress={() => setValue((v) => v + VALUE_STEP)}
                  >
                    <Ionicons name="add" size={22} color="#fff" />
                  </TouchableOpacity>
                </View>
              </Labeled>

              <Labeled label="Ghi chú" styles={styles}>
                <TextInput
                  style={[styles.input, styles.textarea]}
                  placeholder={`Ghi chú thêm về ${entityLabel.toLowerCase()}...`}
                  placeholderTextColor={Colors.textFaint}
                  value={note}
                  onChangeText={setNote}
                  multiline
                />
              </Labeled>
            </>
          ) : (
            <>
              <SectionTitle icon="person-outline" color={accent} text="THÔNG TIN KHÁCH HÀNG" styles={styles} />

              <Labeled label="Tên khách hàng" required styles={styles}>
                <TextInput
                  style={styles.input}
                  placeholder="Nguyễn Văn A"
                  placeholderTextColor={Colors.textFaint}
                  value={customerName}
                  onChangeText={setCustomerName}
                />
              </Labeled>

              <View style={styles.row2}>
                <Labeled label="Số điện thoại" required={!isLead} flex styles={styles}>
                  <TextInput
                    style={styles.input}
                    placeholder="0901 234 567"
                    placeholderTextColor={Colors.textFaint}
                    value={phone}
                    onChangeText={setPhone}
                    keyboardType="phone-pad"
                  />
                </Labeled>
                <Labeled label="Email" flex styles={styles}>
                  <TextInput
                    style={styles.input}
                    placeholder="email@example.com"
                    placeholderTextColor={Colors.textFaint}
                    value={email}
                    onChangeText={setEmail}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </Labeled>
              </View>

              <Labeled label="Công ty KH" styles={styles}>
                <TextInput
                  style={styles.input}
                  placeholder="Tên công ty khách hàng (nếu có)"
                  placeholderTextColor={Colors.textFaint}
                  value={customerCompany}
                  onChangeText={setCustomerCompany}
                />
              </Labeled>

              <SectionTitle icon="people-outline" color={accent} text="PHÂN CÔNG & DEADLINE" styles={styles} top />

              <Labeled label="Người phụ trách" styles={styles}>
                <TouchableOpacity style={styles.assigneeBox} activeOpacity={0.7} onPress={() => setPicker('assignee')}>
                  {assignee ? (
                    <>
                      <View style={[styles.avatar, { backgroundColor: colorFromName(assignee.name) }]}>
                        <Text style={styles.avatarTxt}>{initialsFromName(assignee.name)}</Text>
                      </View>
                      <Text style={styles.assigneeName} numberOfLines={1}>{assignee.name}</Text>
                    </>
                  ) : (
                    <Text style={styles.selectPlaceholder}>-- Chọn --</Text>
                  )}
                  <Ionicons name="chevron-down" size={18} color={Colors.textMuted} />
                </TouchableOpacity>
              </Labeled>

              <Labeled label="Deadline" styles={styles}>
                <TouchableOpacity style={styles.selectBox} activeOpacity={0.7} onPress={() => setDateOpen(true)}>
                  <Ionicons name="calendar-outline" size={18} color={Colors.textMuted} />
                  <Text style={[styles.selectValue, !deadline && styles.selectPlaceholder]}>
                    {deadline ? formatDeadline(deadline) : 'mm/dd/yyyy'}
                  </Text>
                </TouchableOpacity>
              </Labeled>

              <View style={styles.confirmCard}>
                <View style={styles.confirmHead}>
                  <Ionicons name="checkmark-circle-outline" size={16} color={accent} />
                  <Text style={[styles.confirmTitle, { color: accent }]}>XÁC NHẬN</Text>
                </View>
                {summaryRows.map((r) => (
                  <View key={r.label} style={styles.confirmRow}>
                    <Text style={styles.confirmLabel}>{r.label}</Text>
                    <Text style={styles.confirmValue} numberOfLines={1}>{r.value}</Text>
                  </View>
                ))}
              </View>
            </>
          )}
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          {step === 1 ? (
            <>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => navigation.goBack()}>
                <Text style={styles.ghostTxt}>Hủy</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.primaryBtn, { backgroundColor: accent }]} onPress={goNext}>
                <Text style={styles.primaryTxt}>Tiếp theo</Text>
                <Ionicons name="arrow-forward" size={18} color="#fff" />
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity style={styles.ghostBtn} onPress={() => setStep(1)} disabled={saving}>
                <Ionicons name="arrow-back" size={18} color={Colors.text} />
                <Text style={styles.ghostTxt}>Quay lại</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: accent }, saving && { opacity: 0.7 }]}
                onPress={() => void submit()}
                disabled={saving}
              >
                {saving ? (
                  <SpinningLoader color="#fff" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={18} color="#fff" />
                    <Text style={styles.primaryTxt}>Tạo {entityLabel}</Text>
                  </>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Pickers */}
      <PickerSheet
        visible={picker === 'company'}
        title="Chọn công ty"
        options={companies}
        selectedId={company?.id}
        searchable
        accent={accent}
        onSelect={(o) => setCompany((o as CrmCompanyOption) || null)}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === 'region'}
        title="Chọn khu vực"
        options={regions}
        selectedId={region?.id}
        emptyLabel="-- Chưa chọn --"
        loading={metaLoading}
        accent={accent}
        onSelect={(o) => setRegion(o)}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === 'source'}
        title="Chọn nguồn"
        options={sources}
        selectedId={source?.id}
        emptyLabel="-- Nguồn --"
        accent={accent}
        onSelect={(o) => setSource(o)}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === 'leadType'}
        title={`Chọn loại ${entityLabel}`}
        options={leadTypes}
        selectedId={leadType?.id}
        emptyLabel="-- Không bắt buộc --"
        accent={accent}
        onSelect={(o) => setLeadType(o)}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === 'referrer'}
        title="Người giới thiệu"
        options={referrers}
        selectedId={referrers.find((r) => r.name === referrer)?.id}
        emptyLabel="-- Không chọn --"
        allowCustom
        customPlaceholder="Nhập tên người giới thiệu mới..."
        accent={accent}
        onSelect={(o) => setReferrer(o?.name || '')}
        onCustom={(t) => setReferrer(t)}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === 'assignee'}
        title="Người phụ trách"
        options={users}
        selectedId={assignee?.id}
        searchable
        accent={accent}
        onSelect={(o) => setAssignee(o)}
        onClose={() => setPicker(null)}
      />
      <DatePickerSheet
        visible={dateOpen}
        value={deadline}
        accent={accent}
        onSelect={setDeadline}
        onClear={() => setDeadline(null)}
        onClose={() => setDateOpen(false)}
      />

      {done ? (
        <View style={styles.doneOverlay}>
          <Animated.View
            style={[
              styles.doneCard,
              { transform: [{ scale: doneAnim }], opacity: doneAnim },
            ]}
          >
            <View style={[styles.doneIcon, { backgroundColor: Colors.green }]}>
              <Ionicons name="checkmark" size={42} color="#fff" />
            </View>
            <Text style={styles.doneTitle}>Tạo {entityLabel} thành công!</Text>
            <Text style={styles.doneSub}>{title.trim() || customerName.trim()}</Text>
          </Animated.View>
        </View>
      ) : null}
    </View>
  );
}

// --- Sub components -------------------------------------------------------

function SectionTitle({
  icon, color, text, styles, top,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  text: string;
  styles: ReturnType<typeof makeStyles>;
  top?: boolean;
}) {
  return (
    <View style={[styles.sectionRow, top && { marginTop: 18 }]}>
      <Ionicons name={icon} size={16} color={color} />
      <Text style={[styles.sectionText, { color }]}>{text}</Text>
    </View>
  );
}

function Labeled({
  label, required, flex, children, styles,
}: {
  label: string;
  required?: boolean;
  flex?: boolean;
  children: React.ReactNode;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={[styles.field, flex && { flex: 1 }]}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={styles.req}> *</Text> : null}
      </Text>
      {children}
    </View>
  );
}

function SelectBox({
  placeholder, value, onPress, disabled, loading, locked, styles, Colors,
}: {
  placeholder: string;
  value?: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  /** Khóa hẳn (không cho đổi) — hiển thị icon ổ khóa. */
  locked?: boolean;
  styles: ReturnType<typeof makeStyles>;
  Colors: ThemeColors;
}) {
  const blocked = disabled || locked;
  return (
    <TouchableOpacity
      style={[styles.selectBox, disabled && !locked && { opacity: 0.5 }, locked && styles.selectLocked]}
      activeOpacity={0.7}
      onPress={blocked ? undefined : onPress}
      disabled={blocked}
    >
      <Text style={[styles.selectValue, !value && styles.selectPlaceholder]} numberOfLines={1}>
        {value || placeholder}
      </Text>
      {loading ? (
        <SpinningLoader size="small" color={Colors.textMuted} />
      ) : (
        <Ionicons name={locked ? 'lock-closed' : 'chevron-down'} size={locked ? 14 : 18} color={Colors.textFaint} />
      )}
    </TouchableOpacity>
  );
}

const makeStyles = (Colors: ThemeColors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: Colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { color: Colors.text, fontSize: 17, fontWeight: '800' },
  headerSub: { color: Colors.textFaint, fontSize: 12, marginTop: 1 },
  stepBadge: { fontSize: 13, fontWeight: '800' },
  progressTrack: { flexDirection: 'row', gap: 6, paddingHorizontal: 16, marginBottom: 4 },
  progressSeg: { flex: 1, height: 4, borderRadius: 2 },

  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 12 },
  sectionText: { fontSize: 13, fontWeight: '800', letterSpacing: 0.4 },

  field: { marginBottom: 14 },
  row2: { flexDirection: 'row', gap: 12 },
  label: { color: Colors.textMuted, fontSize: 13, fontWeight: '700', marginBottom: 7 },
  req: { color: Colors.red },
  input: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: Colors.text,
    fontSize: 15,
    minHeight: 48,
  },
  textarea: { minHeight: 90, textAlignVertical: 'top', paddingTop: 12 },

  selectBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.md,
    paddingHorizontal: 14,
    minHeight: 48,
  },
  selectValue: { flex: 1, color: Colors.text, fontSize: 15, fontWeight: '600' },
  selectPlaceholder: { color: Colors.textFaint, fontWeight: '400' },
  selectLocked: { backgroundColor: Colors.surfaceSoft, borderStyle: 'dashed' },

  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.md,
    padding: 6,
  },
  stepBtn: {
    width: 46,
    height: 40,
    borderRadius: Radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceSoft,
  },
  stepValue: { flex: 1, color: Colors.text, fontSize: 19, fontWeight: '800', paddingVertical: 0 },

  assigneeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.md,
    paddingHorizontal: 12,
    minHeight: 52,
  },
  avatar: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  avatarTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
  assigneeName: { flex: 1, color: Colors.text, fontSize: 15, fontWeight: '700' },

  confirmCard: {
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: Radii.lg,
    padding: 14,
    marginTop: 6,
  },
  confirmHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 10 },
  confirmTitle: { fontSize: 12, fontWeight: '800', letterSpacing: 0.4 },
  confirmRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 7,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    gap: 12,
  },
  confirmLabel: { color: Colors.textMuted, fontSize: 14 },
  confirmValue: { flex: 1, color: Colors.text, fontSize: 14, fontWeight: '700', textAlign: 'right' },

  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.bgElevated,
  },
  ghostBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flex: 1,
    height: 50,
    borderRadius: Radii.md,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.card,
  },
  ghostTxt: { color: Colors.text, fontSize: 15, fontWeight: '700' },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    flex: 1.4,
    height: 50,
    borderRadius: Radii.md,
  },
  primaryTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },

  doneOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneCard: {
    backgroundColor: Colors.bgElevated,
    borderRadius: Radii.xl,
    paddingVertical: 28,
    paddingHorizontal: 36,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    maxWidth: '80%',
  },
  doneIcon: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  doneTitle: { color: Colors.text, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  doneSub: { color: Colors.textMuted, fontSize: 14, marginTop: 4, textAlign: 'center' },
});
