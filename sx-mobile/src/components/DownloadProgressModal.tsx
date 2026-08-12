import React, { useMemo } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { Radii, Spacing } from '../theme';

import SpinningLoader from './SpinningLoader';
export type DownloadProgressModalProps = {
  visible: boolean;
  fileName: string;
  /** 0..100 */
  percent: number;
  phase: 'downloading' | 'saving' | 'done' | 'error';
  error?: string;
  locationHint?: string;
  onClose: () => void;
};

export default function DownloadProgressModal({
  visible,
  fileName,
  percent,
  phase,
  error,
  locationHint,
  onClose,
}: DownloadProgressModalProps) {
  const { colors } = useTheme();
  const pct = Math.max(0, Math.min(100, Math.round(percent)));

  const title =
    phase === 'error' ? 'Tải thất bại'
      : phase === 'done' ? 'Đã tải xong'
        : phase === 'saving' ? 'Đang lưu file…'
          : 'Đang tải file…';

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.55)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: Spacing.lg,
        },
        card: {
          width: '100%',
          maxWidth: 360,
          borderRadius: Radii.xl,
          backgroundColor: colors.bgElevated,
          borderWidth: 1,
          borderColor: colors.border,
          padding: Spacing.lg,
          gap: 12,
        },
        title: { color: colors.text, fontSize: 16, fontWeight: '800' },
        name: { color: colors.textMuted, fontSize: 13, fontWeight: '600' },
        barTrack: {
          height: 10,
          borderRadius: Radii.full,
          backgroundColor: colors.cardAlt,
          overflow: 'hidden',
        },
        barFill: {
          height: '100%',
          borderRadius: Radii.full,
          backgroundColor: phase === 'error' ? colors.danger : colors.primary,
        },
        row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
        pct: { color: colors.text, fontSize: 20, fontWeight: '800', fontVariant: ['tabular-nums'] },
        hint: { color: colors.textFaint, fontSize: 12, lineHeight: 17 },
        err: { color: colors.danger, fontSize: 13, fontWeight: '600' },
        btn: {
          marginTop: 4,
          alignSelf: 'flex-end',
          paddingHorizontal: 16,
          paddingVertical: 10,
          borderRadius: Radii.md,
          backgroundColor: colors.primary,
        },
        btnTxt: { color: '#FFF', fontSize: 13, fontWeight: '800' },
      }),
    [colors, phase],
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.name} numberOfLines={2}>{fileName || 'file'}</Text>

          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${phase === 'error' ? 100 : pct}%` }]} />
          </View>

          <View style={styles.row}>
            <Text style={styles.pct}>
              {phase === 'error' ? '—' : `${pct}%`}
            </Text>
            {phase === 'downloading' || phase === 'saving' ? (
              <SpinningLoader color={colors.primary} />
            ) : null}
          </View>

          {phase === 'saving' ? (
            <Text style={styles.hint}>Đang ghi file vào thư mục trên máy…</Text>
          ) : null}
          {phase === 'done' && locationHint ? (
            <Text style={styles.hint}>Đã lưu tại: {locationHint}</Text>
          ) : null}
          {phase === 'error' && error ? (
            <Text style={styles.err}>{error}</Text>
          ) : null}

          {(phase === 'done' || phase === 'error') ? (
            <Pressable style={styles.btn} onPress={onClose}>
              <Text style={styles.btnTxt}>Đóng</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
