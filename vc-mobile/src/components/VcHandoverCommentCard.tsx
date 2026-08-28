import SpinningLoader from './SpinningLoader';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useMemo, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { formatApiError } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import {
  confirmVcHandoverComment,
  type ProjectComment,
} from '../lib/logisticsApi';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { Radii, Spacing, type AppColors } from '../theme';

type Props = {
  comment: ProjectComment;
  onUpdated: (next: ProjectComment) => void;
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

function formatInstallDatesLabel(md: Record<string, unknown>): string {
  const occ = Array.isArray(md.install_occurrence_dates)
    ? md.install_occurrence_dates.map((d) => String(d).slice(0, 10)).filter(Boolean)
    : [];
  if (occ.length > 1) {
    return occ.map((ymd) => {
      const [, m, d] = ymd.split('-');
      return `${d}/${m}`;
    }).join(', ');
  }
  return formatVcDateTime(md.install_date);
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

export default function VcHandoverCommentCard({ comment, onUpdated }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { user } = useAuth();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const md = (comment.metadata || {}) as Record<string, unknown>;
  const state = String(md.state || 'awaiting_company');
  const selfUid = String(user?.id || user?.userId || '');
  const canConfirmProduction = selfUid === String(md.production_person_id || '');
  const canConfirmLogistics = selfUid === String(md.logistics_person_id || '');
  const [busy, setBusy] = useState('');

  const projLabel = String(md.project_name || md.project_code || 'dự án');
  const skipLogistics = !!md.skip_logistics_module;
  const eventsLabel =
    md.events_mode === 'external' || (skipLogistics && Array.isArray(md.event_ids) && md.event_ids.length)
      ? 'Mở lịch sự kiện (Giao hàng xưởng + Lắp đặt)'
      : md.events_mode === 'triple' || (Array.isArray(md.event_ids) && md.event_ids.length >= 3)
      ? 'Mở lịch sự kiện (3 sự kiện: SX + VC + Lắp)'
      : md.events_mode === 'split'
        ? 'Mở lịch sự kiện VC/LĐ (2 sự kiện)'
        : 'Mở lịch sự kiện VC/LĐ';

  const confirm = async (side: 'production' | 'logistics') => {
    setBusy(`confirm-${side}`);
    try {
      const next = await confirmVcHandoverComment(comment.id, side);
      onUpdated(next);
    } catch (e) {
      Alert.alert('Lỗi', formatApiError(e));
    } finally {
      setBusy('');
    }
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
            <Text style={styles.title}>Bàn giao Lắp đặt</Text>
            <Text style={styles.sub} numberOfLines={1}>
              Dự án: {projLabel}
            </Text>
          </View>
          <Text style={styles.rel}>{relativeDays(comment.created_at)}</Text>
        </View>

        {state === 'awaiting_company' || state === 'awaiting_date' ? (
          <View style={styles.infoBox}>
            {md.logistics_company_name ? (
              <Text style={styles.row}>
                <Text style={styles.muted}>Công ty: </Text>
                <Text style={styles.strong}>{String(md.logistics_company_name)}</Text>
              </Text>
            ) : (
              <Text style={styles.hint}>
                Sale CRM đang chọn công ty VC/LĐ và ngày nhận hàng trên web.
              </Text>
            )}
            {md.select_notes ? (
              <Text style={styles.row}>
                <Text style={styles.muted}>Ghi chú: </Text>
                {String(md.select_notes)}
              </Text>
            ) : null}
          </View>
        ) : null}

        {(state === 'awaiting_confirm' || state === 'done') ? (
          <View style={styles.infoBox}>
            <Text style={styles.row}>
              <Text style={styles.muted}>Công ty: </Text>
              <Text style={styles.strong}>{String(md.logistics_company_name || '—')}</Text>
              {skipLogistics ? (
                <Text style={styles.hint}> · Bên ngoài, không vào bảng Lắp đặt</Text>
              ) : null}
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
            {(md.install_date || (Array.isArray(md.install_occurrence_dates) && md.install_occurrence_dates.length)) ? (
              <Text style={styles.row}>
                <Text style={styles.muted}>Ngày lắp đặt: </Text>
                <Text style={styles.strong}>{formatInstallDatesLabel(md as Record<string, unknown>)}</Text>
              </Text>
            ) : null}
            <Text style={styles.rule}>
              {skipLogistics
                ? 'Đối tác không dùng app. Sale/xưởng tự cập nhật tiến độ trên lịch sự kiện và kanban SX.'
                : 'Chỉ phụ trách chính Xưởng và VC/LĐ được xác nhận.'}
            </Text>

            <Pressable
              style={styles.calBtn}
              onPress={() => navigation.navigate('Events')}
            >
              <Ionicons name="calendar-outline" size={15} color="#9A3412" />
              <Text style={styles.calBtnTxt}>{eventsLabel}</Text>
            </Pressable>
          </View>
        ) : null}

        {state === 'done' ? (
          <View style={styles.doneBanner}>
            <Ionicons name="checkmark-circle" size={16} color="#047857" />
            <Text style={styles.doneTxt}>
              {skipLogistics
                ? `Đã ghi nhận thuê lắp đặt bên ngoài — ngày ${formatVcDateTime(md.pickup_at)}. Cập nhật tiến độ trên lịch / kanban SX.`
                : `Đã xác nhận giữa Xưởng và VC/LĐ — ngày ${formatVcDateTime(md.pickup_at)} giao nhận hàng.`}
            </Text>
          </View>
        ) : state === 'awaiting_confirm' && skipLogistics ? (
          <View style={styles.doneBanner}>
            <Ionicons name="information-circle" size={16} color="#B45309" />
            <Text style={styles.doneTxt}>
              Thuê ngoài — không chờ xác nhận VC/LĐ. Tự cập nhật tiến độ trên lịch / kanban SX.
            </Text>
          </View>
        ) : state === 'awaiting_confirm' ? (
          <View style={styles.sideRow}>
            {sides.map((s) => (
              <View
                key={s.side}
                style={[styles.sideBox, s.confirmed && styles.sideBoxConfirmed]}
              >
                <Text style={[styles.sideLabel, s.confirmed && styles.sideLabelConfirmed]}>
                  {s.label}
                </Text>
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
      </View>
    </View>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    wrap: { marginBottom: 14, paddingHorizontal: 2 },
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
    infoBox: {
      backgroundColor: colors.white,
      borderRadius: Radii.md,
      borderWidth: 1,
      borderColor: '#FFEDD5',
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 4,
    },
    row: { color: '#374151', fontSize: 12, lineHeight: 18 },
    muted: { color: '#6B7280', fontWeight: '500' },
    strong: { color: '#111827', fontWeight: '800' },
    hint: { color: '#9A3412', fontSize: 12, lineHeight: 17 },
    rule: { color: '#C2410C', fontSize: 11, marginTop: 4, fontWeight: '600' },
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
      backgroundColor: colors.white,
      paddingHorizontal: 8,
      paddingVertical: 10,
      alignItems: 'center',
      minHeight: 88,
    },
    sideBoxConfirmed: {
      backgroundColor: '#D1FAE5',
      borderColor: '#6EE7B7',
    },
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
  });
}
