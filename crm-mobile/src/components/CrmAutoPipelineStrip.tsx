import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { api } from '../api/client';
import { CrmColors, CrmRadii } from '../theme/crmTheme';

type AutoState = {
  running?: boolean;
  enabled?: boolean;
  stepLabel?: string | null;
  phase?: string | null;
  lastUpdatedAt?: string | null;
};

type Props = {
  onPress: () => void;
};

export default function CrmAutoPipelineStrip({ onPress }: Props) {
  const [state, setState] = useState<AutoState | null>(null);
  const [err, setErr] = useState(false);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<AutoState>('/facebook/auto-pipeline/status');
      setState(data && typeof data === 'object' ? data : {});
      setErr(false);
    } catch {
      setErr(true);
      setState(null);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [load]);

  const running = !!state?.running;
  const line = running
    ? state?.stepLabel || state?.phase || 'Đang chạy công cụ tự động…'
    : state?.enabled === false
      ? 'Công cụ tự động đang tắt'
      : 'Công cụ tự động: rảnh';

  return (
    <TouchableOpacity
      style={[styles.wrap, running && styles.wrapRun, err && styles.wrapErr]}
      onPress={onPress}
      activeOpacity={0.88}
    >
      {state == null && !err ? (
        <ActivityIndicator size="small" color={CrmColors.blue600} />
      ) : (
        <>
          <Text style={styles.dot}>{running ? '●' : '○'}</Text>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.k}>Công cụ tự động Facebook</Text>
            <Text style={styles.t} numberOfLines={2}>
              {err ? 'Không tải được trạng thái — chạm để thử lại' : line}
            </Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </>
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: CrmRadii.md,
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  wrapRun: {
    borderColor: '#86efac',
    backgroundColor: '#f0fdf4',
  },
  wrapErr: {
    borderColor: CrmColors.gray200,
    backgroundColor: '#fff7ed',
  },
  dot: { fontSize: 12, color: '#16a34a', width: 14, textAlign: 'center' },
  k: { fontSize: 10, fontWeight: '800', color: CrmColors.gray500, textTransform: 'uppercase' },
  t: { fontSize: 13, fontWeight: '600', color: CrmColors.gray800, marginTop: 2 },
  chev: { fontSize: 18, color: CrmColors.gray300, fontWeight: '700' },
});
