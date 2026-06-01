import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, AppState } from 'react-native';
import { useIsFocused } from '@react-navigation/native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { api } from '../api/client';
import { CrmColors, CrmShadow } from '../theme/crmTheme';

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
  const isFocused = useIsFocused();

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

  /**
   * Chỉ poll khi screen đang focus + app đang active. Trước đây poll mỗi 8s
   * cho cả vòng đời mount, kể cả khi user ở tab khác → mất CPU/mạng vô ích,
   * dễ làm app đơ trên máy yếu. Tần suất 15s vừa đủ với UX.
   */
  useEffect(() => {
    if (!isFocused) return;
    if (AppState.currentState !== 'active') return;
    void load();
    const t = setInterval(() => void load(), 15000);
    return () => clearInterval(t);
  }, [isFocused, load]);

  const running = !!state?.running;
  const disabled = state?.enabled === false;

  const dotColor = err
    ? '#f59e0b'
    : running
      ? '#22c55e'
      : disabled
        ? '#94a3b8'
        : '#22c55e';

  const text = err
    ? 'Không tải được trạng thái — chạm để thử lại'
    : running
      ? state?.stepLabel || state?.phase || 'Đang chạy công cụ tự động Facebook…'
      : disabled
        ? 'Công cụ tự động Facebook đang tắt'
        : 'Công cụ tự động Facebook đang rảnh';

  return (
    <TouchableOpacity
      style={[styles.wrap, CrmShadow.sm, running && styles.wrapRun, err && styles.wrapErr]}
      onPress={onPress}
      activeOpacity={0.88}
    >
      {state == null && !err ? (
        <ActivityIndicator size="small" color={CrmColors.blue600} />
      ) : (
        <>
          <View style={[styles.dotOuter, { backgroundColor: `${dotColor}26` }]}>
            <View style={[styles.dotInner, { backgroundColor: dotColor }]} />
          </View>
          <Text style={styles.txt} numberOfLines={1}>
            {text}
          </Text>
          <Ionicons name="chevron-forward" size={16} color={CrmColors.gray300} />
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
    marginHorizontal: 14,
    marginTop: 14,
    marginBottom: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: CrmColors.white,
    borderWidth: 1,
    borderColor: CrmColors.gray200,
  },
  wrapRun: {
    borderColor: '#86efac',
    backgroundColor: '#f0fdf4',
  },
  wrapErr: {
    borderColor: '#fed7aa',
    backgroundColor: '#fff7ed',
  },
  dotOuter: {
    width: 18,
    height: 18,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotInner: { width: 8, height: 8, borderRadius: 999 },
  txt: { flex: 1, fontSize: 13, fontWeight: '600', color: CrmColors.gray800 },
});
