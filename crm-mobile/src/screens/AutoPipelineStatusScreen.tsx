import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { api } from '../api/client';
import { CrmColors, CrmRadii, CrmShadow } from '../theme/crmTheme';

type AutoState = {
  enabled?: boolean;
  running?: boolean;
  phase?: string | null;
  step?: number;
  totalSteps?: number;
  stepLabel?: string | null;
  cycleCount?: number;
  batchIndex?: number;
  totalBatches?: number;
  totalContacts?: number;
  batchOffset?: number;
  lastUpdatedAt?: string | null;
  startedAt?: string | null;
  kpi?: {
    messagesSynced?: number;
    contactsProcessed?: number;
    contactPhones?: number;
    customerPhones?: number;
    leadPhones?: number;
    errors?: number;
  };
  logs?: { text?: string; status?: string; ts?: number }[];
  pipelineConfig?: { engine?: string };
};

export default function AutoPipelineStatusScreen() {
  const [state, setState] = useState<AutoState | null>(null);
  const [err, setErr] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    setErr('');
    try {
      const { data } = await api.get<AutoState>('/facebook/auto-pipeline/status');
      setState(data && typeof data === 'object' ? data : {});
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { error?: string } } })?.response?.data?.error ||
        (e as Error)?.message ||
        'Không tải trạng thái';
      setErr(String(msg));
      setState(null);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 4000);
    return () => clearInterval(t);
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  };

  const running = !!state?.running;
  const engine = state?.pipelineConfig?.engine || '—';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.pad}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={CrmColors.blue600} />}
    >
      <Text style={styles.intro}>
        Giống web (BatchActionsBar / Auto pipeline): trạng thái chạy trên máy chủ, cập nhật định kỳ.
      </Text>
      {err ? <Text style={styles.err}>{err}</Text> : null}
      {!state && !err ? <ActivityIndicator color={CrmColors.blue600} style={{ marginTop: 24 }} /> : null}
      {state ? (
        <>
          <View style={[styles.card, CrmShadow.card]}>
            <Text style={styles.cardH}>Trạng thái</Text>
            <Row label="Đang chạy" value={running ? 'Có' : 'Không'} highlight={running} />
            <Row label="Bật (enabled)" value={state.enabled ? 'Có' : 'Không'} />
            <Row label="Phase" value={String(state.phase || '—')} />
            <Row label="Bước" value={`${state.step ?? '—'} / ${state.totalSteps ?? '—'}`} />
            <Row label="Engine cấu hình" value={String(engine)} />
            <Row label="Chu kỳ" value={String(state.cycleCount ?? 0)} />
            <Row label="Batch" value={`${state.batchIndex ?? 0} / ${state.totalBatches ?? 0}`} />
            <Row label="Contacts (ước)" value={String(state.totalContacts ?? 0)} />
            <Row label="Bắt đầu" value={state.startedAt ? new Date(state.startedAt).toLocaleString('vi-VN') : '—'} />
            <Row label="Cập nhật cuối" value={state.lastUpdatedAt ? new Date(state.lastUpdatedAt).toLocaleString('vi-VN') : '—'} />
          </View>

          {state.stepLabel ? (
            <View style={[styles.card, CrmShadow.card, running && styles.cardPulse]}>
              <Text style={styles.cardH}>Tiến trình</Text>
              <Text style={styles.stepLbl}>{state.stepLabel}</Text>
            </View>
          ) : null}

          <View style={[styles.card, CrmShadow.card]}>
            <Text style={styles.cardH}>KPI (tích lũy phiên)</Text>
            <Row label="Tin sync" value={String(state.kpi?.messagesSynced ?? 0)} />
            <Row label="Contacts xử lý" value={String(state.kpi?.contactsProcessed ?? 0)} />
            <Row label="SĐT (contact / KH / lead)" value={`${state.kpi?.contactPhones ?? 0} / ${state.kpi?.customerPhones ?? 0} / ${state.kpi?.leadPhones ?? 0}`} />
            <Row label="Lỗi" value={String(state.kpi?.errors ?? 0)} highlight={!!state.kpi?.errors} />
          </View>

          <Text style={styles.logH}>Nhật ký (mới nhất dưới)</Text>
          <View style={[styles.logBox, CrmShadow.card]}>
            {(state.logs || []).slice(-40).map((l, i) => (
              <Text key={`${l.ts}-${i}`} style={[styles.logLine, l.status === 'error' && styles.logErr]}>
                {l.text || '—'}
              </Text>
            ))}
            {(!state.logs || state.logs.length === 0) ? <Text style={styles.muted}>Chưa có log.</Text> : null}
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

function Row({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLbl}>{label}</Text>
      <Text style={[styles.rowVal, highlight && styles.rowValHi]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: CrmColors.pageBg },
  pad: { padding: 16, paddingBottom: 40 },
  intro: { fontSize: 13, color: CrmColors.gray600, marginBottom: 12, lineHeight: 19 },
  err: { color: CrmColors.red700, marginBottom: 12 },
  card: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 14,
    marginBottom: 12,
  },
  cardPulse: { borderColor: CrmColors.blue100 },
  cardH: { fontSize: 14, fontWeight: '800', color: CrmColors.gray900, marginBottom: 10 },
  stepLbl: { fontSize: 13, color: CrmColors.blue800, fontWeight: '600', lineHeight: 19 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingVertical: 6 },
  rowLbl: { fontSize: 13, color: CrmColors.gray600 },
  rowVal: { fontSize: 13, fontWeight: '700', color: CrmColors.gray900, maxWidth: '58%', textAlign: 'right' },
  rowValHi: { color: CrmColors.blue700 },
  logH: { fontSize: 13, fontWeight: '800', color: CrmColors.gray800, marginBottom: 8 },
  logBox: {
    backgroundColor: CrmColors.white,
    borderRadius: CrmRadii.lg,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
    padding: 12,
    maxHeight: 320,
  },
  logLine: { fontSize: 11, color: CrmColors.gray700, marginBottom: 6, lineHeight: 16 },
  logErr: { color: CrmColors.red700 },
  muted: { fontSize: 12, color: CrmColors.gray400 },
});
