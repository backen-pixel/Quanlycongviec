import Ionicons from '@expo/vector-icons/Ionicons';
import SpinningLoader from '../SpinningLoader';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useEffect, useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { formatApiError } from '../../api/client';
import type { LeadComment } from '../../api/leadDetail';
import {
  confirmVcHandoverComment,
  fetchLogisticsCompanies,
  scheduleVcHandoverComment,
  selectVcHandoverComment,
} from '../../api/vcHandover';
import type { CrmCompany } from '../../api/crmMeta';
import { currentUserId, useAuth } from '../../context/AuthContext';
import type { RootStackParamList } from '../../navigation/types';
import { Radii, useColors, type ThemeColors } from '../../theme';

type Props = {
  comment: LeadComment;
  onUpdated: (next: LeadComment) => void;
  onHistoryComment?: (row: LeadComment) => void;
};

function formatVcDateTime(raw?: unknown): string {
  if (!raw) return '—';
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) return String(raw);
  return d.toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function relativeDays(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  const days = Math.floor(diffMs / (24 * 60 * 60 * 1000));
  if (days <= 0) {
    const hours = Math.floor(diffMs / (60 * 60 * 1000));
    if (hours <= 0) return 'Vừa xong';
    return `${hours} giờ`;
  }
  if (days === 1) return '1 ngày';
  return `${days} ngày`;
}

function isConfirmed(val: unknown): boolean {
  return val != null && val !== false && val !== '';
}

function splitLocal(v: string): { date: string; time: string } {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return { date: m ? `${m[1]}-${m[2]}-${m[3]}` : '', time: m ? `${m[4]}:${m[5]}` : '09:00' };
}

function joinLocal(date: string, time: string): string {
  const d = (date || '').trim();
  const t = (time || '09:00').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return '';
  if (!/^\d{2}:\d{2}$/.test(t)) return `${d}T09:00`;
  return `${d}T${t}`;
}

function toLocalDatetimeValue(iso?: unknown): string {
  if (!iso) return '';
  const d = new Date(String(iso));
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localToIso(local: string): string | null {
  if (!local) return null;
  const d = new Date(local);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export default function VcHandoverCommentCard({ comment, onUpdated, onHistoryComment }: Props) {
  const Colors = useColors();
  const styles = useMemo(() => makeStyles(Colors), [Colors]);
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const md = (comment.metadata || {}) as Record<string, unknown>;
  const state = String(md.state || 'awaiting_company');
  const selfUid = String(currentUserId(user) || user?.id || user?.userId || '');
  const saleIds = (Array.isArray(md.sale_user_ids) ? md.sale_user_ids : []).map(String);
  const canSale = saleIds.includes(selfUid);
  const role = String(user?.role || '').trim().toLowerCase();
  const canAct = canSale || role === 'admin' || role === 'sales_admin' || role === 'platform_admin';
  const canConfirmProduction = selfUid === String(md.production_person_id || '');
  const canConfirmLogistics = selfUid === String(md.logistics_person_id || '');

  const [companies, setCompanies] = useState<CrmCompany[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [companyPickerOpen, setCompanyPickerOpen] = useState(false);
  const [selectNotes, setSelectNotes] = useState('');
  const [pickupAt, setPickupAt] = useState('');
  const [pickupNotes, setPickupNotes] = useState('');
  const [installDate, setInstallDate] = useState('');
  const [installAddress, setInstallAddress] = useState(String(md.install_address || ''));
  const [busy, setBusy] = useState('');
  const [err, setErr] = useState('');

  const projLabel = String(md.project_name || md.project_code || 'dự án');
  const eventsLabel =
    md.events_mode === 'triple' || (Array.isArray(md.event_ids) && md.event_ids.length >= 3)
      ? 'Mở lịch sự kiện (3 sự kiện: SX + VC + Lắp)'
      : md.events_mode === 'split'
        ? 'Mở lịch sự kiện VC/LĐ (2 sự kiện)'
        : 'Mở lịch sự kiện VC/LĐ';

  useEffect(() => {
    if (state !== 'awaiting_company' || !canAct) return undefined;
    const ac = new AbortController();
    void fetchLogisticsCompanies(ac.signal).then((list) => {
      setCompanies(list);
      if (list.length === 1) setCompanyId(String(list[0].id));
    });
    if (md.install_date) setInstallDate((prev) => prev || toLocalDatetimeValue(md.install_date));
    if (md.lead_type_name || md.workshop_company_name) {
      const notes = [md.lead_type_name, md.workshop_company_name]
        .map((s) => String(s || '').trim())
        .filter(Boolean)
        .join(' - ');
      if (notes) setSelectNotes((prev) => prev || notes);
    }
    return () => ac.abort();
  }, [state, canAct, md.install_date, md.lead_type_name, md.workshop_company_name]);

  const pickupParts = splitLocal(pickupAt);
  const installParts = splitLocal(installDate);
  const companyLabel =
    companies.find((c) => c.id === companyId)?.short_name
    || companies.find((c) => c.id === companyId)?.name
    || (companyId ? 'Đã chọn' : '— Chọn công ty —');

  const setPickupDate = (date: string) => {
    const next = joinLocal(date, pickupParts.time || '09:00');
    setPickupAt(next);
    if (next) {
      const day = next.slice(0, 10);
      setInstallDate((prev) => {
        if (prev && String(prev).slice(0, 10) >= day) return prev;
        return `${day}T14:00`;
      });
    }
  };
  const setPickupTime = (time: string) => setPickupAt(joinLocal(pickupParts.date, time));
  const setInstallDatePart = (date: string) => setInstallDate(joinLocal(date, installParts.time || '14:00'));
  const setInstallTime = (time: string) => setInstallDate(joinLocal(installParts.date, time));

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setErr('');
    try {
      await fn();
    } catch (e) {
      setErr(formatApiError(e));
    } finally {
      setBusy('');
    }
  };

  const confirm = async (side: 'production' | 'logistics') => {
    await run(`confirm-${side}`, async () => {
      const next = await confirmVcHandoverComment(comment.id, side);
      if (next) onUpdated(next);
    });
  };

  const sides = [
    {
      side: 'crm' as const,
      label: 'CRM',
      personName: md.crm_responsible_user_name ? String(md.crm_responsible_user_name) : '',
      confirmed: isConfirmed(md.confirmed_crm) || state === 'awaiting_confirm' || state === 'done',
      can: false,
    },
    {
      side: 'production' as const,
      label: 'Xưởng (SX)',
      personName: md.production_person_name ? String(md.production_person_name) : '',
      confirmed: isConfirmed(md.confirmed_production),
      can: canConfirmProduction,
    },
    {
      side: 'logistics' as const,
      label: 'VC/LĐ',
      personName: md.logistics_person_name ? String(md.logistics_person_name) : '',
      confirmed: isConfirmed(md.confirmed_logistics),
      can: canConfirmLogistics,
    },
  ];

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.iconCircle}>
            <Ionicons name="car-outline" size={16} color="#EA580C" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.title}>Bàn giao Vận chuyển / Lắp đặt</Text>
            <Text style={styles.sub} numberOfLines={1}>
              Dự án: {projLabel}
            </Text>
          </View>
          <Text style={styles.rel}>{relativeDays(comment.created_at)}</Text>
        </View>

        {state === 'awaiting_company' ? (
          canAct ? (
            <View style={styles.formBox}>
              <Text style={styles.fieldLabel}>Công ty VC/LĐ *</Text>
              <Pressable style={styles.pickerBtn} onPress={() => setCompanyPickerOpen(true)}>
                <Text style={[styles.pickerTxt, !companyId && styles.pickerPlaceholder]} numberOfLines={1}>
                  {companyLabel}
                </Text>
                <Ionicons name="chevron-down" size={16} color="#9A3412" />
              </Pressable>

              <Text style={styles.fieldLabel}>Ghi chú</Text>
              <TextInput
                value={selectNotes}
                onChangeText={setSelectNotes}
                placeholder="Loại - xưởng - …"
                placeholderTextColor="#9CA3AF"
                style={[styles.input, styles.textarea]}
                multiline
              />

              <View style={styles.infoInner}>
                <Text style={styles.sectionTitle}>Thông tin giao / lắp</Text>

                <Text style={styles.fieldLabel}>Ngày nhận hàng *</Text>
                <View style={styles.rowInputs}>
                  <TextInput
                    value={pickupParts.date}
                    onChangeText={setPickupDate}
                    placeholder="yyyy-mm-dd"
                    placeholderTextColor="#9CA3AF"
                    style={[styles.input, { flex: 1.4 }]}
                    autoCapitalize="none"
                  />
                  <TextInput
                    value={pickupParts.time}
                    onChangeText={setPickupTime}
                    placeholder="HH:mm"
                    placeholderTextColor="#9CA3AF"
                    style={[styles.input, { flex: 1 }]}
                    autoCapitalize="none"
                  />
                </View>

                <Text style={styles.fieldLabel}>Ngày lắp đặt</Text>
                <View style={styles.rowInputs}>
                  <TextInput
                    value={installParts.date}
                    onChangeText={setInstallDatePart}
                    placeholder="yyyy-mm-dd"
                    placeholderTextColor="#9CA3AF"
                    style={[styles.input, { flex: 1.4 }]}
                    autoCapitalize="none"
                  />
                  <TextInput
                    value={installParts.time}
                    onChangeText={setInstallTime}
                    placeholder="HH:mm"
                    placeholderTextColor="#9CA3AF"
                    style={[styles.input, { flex: 1 }]}
                    autoCapitalize="none"
                  />
                </View>

                {(pickupAt || installDate) ? (
                  <View style={styles.previewBox}>
                    <Text style={styles.previewTitle}>3 sự kiện sẽ tạo</Text>
                    <Text style={styles.previewRow}>SX · Giao hàng xưởng — {pickupAt ? formatVcDateTime(pickupAt) : '—'}</Text>
                    <Text style={styles.previewRow}>VC · Vận chuyển / nhận hàng — {pickupAt ? formatVcDateTime(pickupAt) : '—'}</Text>
                    <Text style={styles.previewRow}>
                      LĐ · Lắp đặt — {formatVcDateTime(installDate || pickupAt)}
                    </Text>
                  </View>
                ) : null}

                <Text style={styles.fieldLabel}>Địa chỉ lắp đặt</Text>
                <TextInput
                  value={installAddress}
                  onChangeText={setInstallAddress}
                  placeholder="Số nhà, đường, phường…"
                  placeholderTextColor="#9CA3AF"
                  style={[styles.input, styles.textarea]}
                  multiline
                />
              </View>

              {err ? <Text style={styles.err}>{err}</Text> : null}

              <Pressable
                style={[styles.primaryBtn, (!companyId || !pickupAt || busy === 'select') && { opacity: 0.5 }]}
                disabled={!companyId || !pickupAt || busy === 'select'}
                onPress={() => {
                  if (installDate && pickupAt) {
                    const vcDay = String(pickupAt).slice(0, 10);
                    const installDay = String(installDate).slice(0, 10);
                    if (installDay < vcDay) {
                      setErr('Ngày lắp đặt phải bằng hoặc sau ngày nhận hàng VC.');
                      return;
                    }
                  }
                  const pickupIso = localToIso(pickupAt);
                  if (!pickupIso) {
                    setErr('Ngày nhận hàng không hợp lệ.');
                    return;
                  }
                  void run('select', async () => {
                    const res = await selectVcHandoverComment(comment.id, {
                      logistics_company_id: companyId,
                      notes: selectNotes.trim() || null,
                      pickup_at: pickupIso,
                      install_date: installDate ? localToIso(installDate) : null,
                      install_address: installAddress.trim() || null,
                    });
                    if (res.comment) onUpdated(res.comment);
                    if (res.history_comment) onHistoryComment?.(res.history_comment);
                  });
                }}
              >
                {busy === 'select' ? (
                  <SpinningLoader color="#fff" size="small" />
                ) : (
                  <>
                    <Ionicons name="car-outline" size={16} color="#fff" />
                    <Text style={styles.primaryBtnTxt}>Chọn & bàn giao</Text>
                  </>
                )}
              </Pressable>
            </View>
          ) : (
            <View style={styles.infoBox}>
              <Text style={styles.hint}>
                Chỉ Sale CRM phụ trách deal hoặc admin mới được chọn công ty VC/LĐ và ngày lấy hàng.
              </Text>
            </View>
          )
        ) : null}

        {state === 'awaiting_date' ? (
          <View style={styles.formBox}>
            <Text style={styles.row}>
              <Text style={styles.muted}>Đã chọn: </Text>
              <Text style={styles.strong}>{String(md.logistics_company_name || '—')}</Text>
            </Text>
            {md.select_notes ? (
              <Text style={styles.row}>
                <Text style={styles.muted}>Ghi chú: </Text>
                {String(md.select_notes)}
              </Text>
            ) : null}
            {canAct ? (
              <>
                <Text style={styles.fieldLabel}>Ngày lấy hàng *</Text>
                <View style={styles.rowInputs}>
                  <TextInput
                    value={pickupParts.date}
                    onChangeText={setPickupDate}
                    placeholder="yyyy-mm-dd"
                    placeholderTextColor="#9CA3AF"
                    style={[styles.input, { flex: 1.4 }]}
                    autoCapitalize="none"
                  />
                  <TextInput
                    value={pickupParts.time}
                    onChangeText={setPickupTime}
                    placeholder="HH:mm"
                    placeholderTextColor="#9CA3AF"
                    style={[styles.input, { flex: 1 }]}
                    autoCapitalize="none"
                  />
                </View>
                <TextInput
                  value={pickupNotes}
                  onChangeText={setPickupNotes}
                  placeholder="Ghi chú (tuỳ chọn)"
                  placeholderTextColor="#9CA3AF"
                  style={styles.input}
                />
                {err ? <Text style={styles.err}>{err}</Text> : null}
                <Pressable
                  style={[styles.skyBtn, (!pickupAt || busy === 'schedule') && { opacity: 0.5 }]}
                  disabled={!pickupAt || busy === 'schedule'}
                  onPress={() => {
                    const pickupIso = localToIso(pickupAt);
                    if (!pickupIso) {
                      setErr('Ngày lấy hàng không hợp lệ.');
                      return;
                    }
                    void run('schedule', async () => {
                      const next = await scheduleVcHandoverComment(comment.id, {
                        pickup_at: pickupIso,
                        pickup_notes: pickupNotes.trim() || null,
                      });
                      if (next) onUpdated(next);
                    });
                  }}
                >
                  {busy === 'schedule' ? (
                    <SpinningLoader color="#fff" size="small" />
                  ) : (
                    <Text style={styles.primaryBtnTxt}>Tạo sự kiện lấy hàng</Text>
                  )}
                </Pressable>
              </>
            ) : (
              <Text style={styles.hint}>Chỉ Sale CRM phụ trách deal hoặc admin mới được chọn ngày lấy hàng.</Text>
            )}
          </View>
        ) : null}

        {(state === 'awaiting_confirm' || state === 'done') ? (
          <View style={styles.infoBox}>
            <Text style={styles.row}>
              <Text style={styles.muted}>Công ty: </Text>
              <Text style={styles.strong}>{String(md.logistics_company_name || '—')}</Text>
            </Text>
            {md.select_notes ? (
              <Text style={styles.row}>
                <Text style={styles.muted}>Ghi chú: </Text>
                {String(md.select_notes)}
              </Text>
            ) : null}
            <Text style={styles.row}>
              <Text style={styles.muted}>Ngày nhận hàng: </Text>
              <Text style={styles.strong}>{formatVcDateTime(md.pickup_at)}</Text>
            </Text>
            {md.install_date ? (
              <Text style={styles.row}>
                <Text style={styles.muted}>Ngày lắp đặt: </Text>
                <Text style={styles.strong}>{formatVcDateTime(md.install_date)}</Text>
              </Text>
            ) : null}
            <Text style={styles.rule}>CRM + Xưởng đã xác nhận mặc định. Chỉ người xác nhận VC/LĐ được bấm.</Text>

            <Pressable style={styles.calBtn} onPress={() => navigation.navigate('Events')}>
              <Ionicons name="calendar-outline" size={15} color="#9A3412" />
              <Text style={styles.calBtnTxt}>{eventsLabel}</Text>
            </Pressable>
          </View>
        ) : null}

        {state === 'done' ? (
          <View style={styles.doneBanner}>
            <Ionicons name="checkmark-circle" size={16} color="#047857" />
            <Text style={styles.doneTxt}>
              Đã xác nhận giữa Xưởng và VC/LĐ — ngày {formatVcDateTime(md.pickup_at)} giao nhận hàng.
            </Text>
          </View>
        ) : state === 'awaiting_confirm' ? (
          <View style={styles.sideRow}>
            {sides.map((s) => (
              <View key={s.side} style={[styles.sideBox, s.confirmed && styles.sideBoxConfirmed]}>
                <Text style={[styles.sideLabel, s.confirmed && styles.sideLabelConfirmed]}>{s.label}</Text>
                <Text
                  style={[styles.sidePerson, s.confirmed && styles.sidePersonConfirmed]}
                  numberOfLines={1}
                >
                  {s.personName || 'Chưa gán phụ trách'}
                </Text>
                {s.confirmed ? (
                  <View style={styles.confirmedRow}>
                    <Ionicons name="checkmark-circle" size={14} color="#047857" />
                    <Text style={styles.confirmedTxt}>Đã xác nhận</Text>
                  </View>
                ) : s.can ? (
                  <Pressable
                    style={styles.confirmBtn}
                    disabled={busy === `confirm-${s.side}`}
                    onPress={() => {
                      if (s.side === 'production' || s.side === 'logistics') void confirm(s.side);
                    }}
                  >
                    {busy === `confirm-${s.side}` ? (
                      <SpinningLoader color="#fff" size="small" />
                    ) : (
                      <>
                        <Ionicons name="checkmark" size={14} color="#fff" />
                        <Text style={styles.confirmBtnTxt}>Xác nhận</Text>
                      </>
                    )}
                  </Pressable>
                ) : (
                  <Text style={styles.waitTxt}>Chờ xác nhận</Text>
                )}
              </View>
            ))}
          </View>
        ) : null}

        {err && state !== 'awaiting_company' && state !== 'awaiting_date' ? (
          <Text style={styles.err}>{err}</Text>
        ) : null}
      </View>

      <Modal visible={companyPickerOpen} transparent animationType="fade" onRequestClose={() => setCompanyPickerOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setCompanyPickerOpen(false)}>
          <Pressable style={styles.modalSheet} onPress={() => {}}>
            <Text style={styles.modalTitle}>Chọn công ty VC/LĐ</Text>
            <FlatList
              data={companies}
              keyExtractor={(c) => c.id}
              style={{ maxHeight: 320 }}
              ListEmptyComponent={<Text style={styles.hint}>Không có công ty logistics.</Text>}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.modalRow}
                  onPress={() => {
                    setCompanyId(item.id);
                    setCompanyPickerOpen(false);
                  }}
                >
                  <Text style={styles.modalRowTxt}>{item.short_name || item.name}</Text>
                  {companyId === item.id ? <Ionicons name="checkmark" size={18} color="#EA580C" /> : null}
                </Pressable>
              )}
            />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function makeStyles(Colors: ThemeColors) {
  return StyleSheet.create({
    wrap: { marginBottom: 14, paddingHorizontal: 4 },
    card: {
      borderRadius: Radii.lg,
      borderWidth: 1,
      borderColor: '#FDBA74',
      backgroundColor: '#FFF7ED',
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
    iconCircle: {
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: '#FFEDD5',
      alignItems: 'center',
      justifyContent: 'center',
    },
    title: { color: '#9A3412', fontSize: 13, fontWeight: '800' },
    sub: { color: '#C2410C', fontSize: 11, marginTop: 1, fontWeight: '600' },
    rel: { color: '#C2410C', fontSize: 10, fontWeight: '600', opacity: 0.75 },
    formBox: { gap: 6 },
    infoBox: {
      backgroundColor: Colors.card || '#fff',
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: '#FFEDD5',
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 4,
    },
    infoInner: {
      marginTop: 4,
      backgroundColor: 'rgba(255,255,255,0.7)',
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: '#FFEDD5',
      padding: 10,
      gap: 6,
    },
    sectionTitle: {
      color: '#9A3412',
      fontSize: 10,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    fieldLabel: { color: '#4B5563', fontSize: 11, fontWeight: '700', marginTop: 4 },
    input: {
      height: 38,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: '#FDBA74',
      backgroundColor: '#fff',
      paddingHorizontal: 10,
      color: '#111827',
      fontSize: 13,
    },
    textarea: { height: 64, paddingTop: 8, textAlignVertical: 'top' },
    rowInputs: { flexDirection: 'row', gap: 8 },
    pickerBtn: {
      height: 38,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: '#FDBA74',
      backgroundColor: '#fff',
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    pickerTxt: { flex: 1, color: '#111827', fontSize: 13, fontWeight: '600' },
    pickerPlaceholder: { color: '#9CA3AF', fontWeight: '500' },
    previewBox: {
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: '#FFEDD5',
      backgroundColor: '#FFF7ED',
      padding: 8,
      gap: 2,
    },
    previewTitle: { color: '#9A3412', fontSize: 10, fontWeight: '800', marginBottom: 2 },
    previewRow: { color: '#374151', fontSize: 11, lineHeight: 16 },
    row: { color: '#374151', fontSize: 12, lineHeight: 18 },
    muted: { color: '#6B7280', fontWeight: '500' },
    strong: { color: '#111827', fontWeight: '800' },
    hint: { color: '#9A3412', fontSize: 12, lineHeight: 17 },
    rule: { color: '#C2410C', fontSize: 11, marginTop: 4, fontWeight: '600' },
    err: { color: '#DC2626', fontSize: 11, marginTop: 4 },
    primaryBtn: {
      marginTop: 8,
      height: 38,
      borderRadius: Radii.md,
      backgroundColor: '#EA580C',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    skyBtn: {
      marginTop: 8,
      height: 38,
      borderRadius: Radii.md,
      backgroundColor: '#0284C7',
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryBtnTxt: { color: '#fff', fontSize: 13, fontWeight: '800' },
    calBtn: {
      marginTop: 8,
      height: 34,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: '#FDBA74',
      backgroundColor: '#FFF7ED',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingHorizontal: 8,
    },
    calBtnTxt: { color: '#9A3412', fontSize: 12, fontWeight: '700', flexShrink: 1 },
    doneBanner: {
      marginTop: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: '#A7F3D0',
      backgroundColor: '#ECFDF5',
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    doneTxt: { flex: 1, color: '#065F46', fontSize: 12, fontWeight: '700', lineHeight: 17 },
    sideRow: { marginTop: 10, flexDirection: 'row', gap: 8 },
    sideBox: {
      flex: 1,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: '#FFEDD5',
      backgroundColor: '#fff',
      paddingHorizontal: 8,
      paddingVertical: 10,
      alignItems: 'center',
      minHeight: 88,
    },
    sideBoxConfirmed: { backgroundColor: '#D1FAE5', borderColor: '#6EE7B7' },
    sideLabel: { color: '#4B5563', fontSize: 11, fontWeight: '800' },
    sideLabelConfirmed: { color: '#065F46' },
    sidePerson: { color: '#6B7280', fontSize: 10, marginTop: 4, marginBottom: 8, textAlign: 'center' },
    sidePersonConfirmed: { color: '#047857', fontWeight: '700' },
    confirmedRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
    confirmedTxt: { color: '#047857', fontSize: 11, fontWeight: '800' },
    confirmBtn: {
      height: 32,
      borderRadius: Radii.md,
      backgroundColor: '#059669',
      paddingHorizontal: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      alignSelf: 'stretch',
    },
    confirmBtnTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
    waitTxt: { color: '#9CA3AF', fontSize: 11, fontWeight: '600' },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.4)',
      justifyContent: 'flex-end',
    },
    modalSheet: {
      backgroundColor: Colors.card || '#fff',
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 28,
    },
    modalTitle: { color: Colors.text, fontSize: 15, fontWeight: '800', marginBottom: 10 },
    modalRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: Colors.border,
    },
    modalRowTxt: { flex: 1, color: Colors.text, fontSize: 14, fontWeight: '600' },
  });
}
