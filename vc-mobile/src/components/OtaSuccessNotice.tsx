import { useEffect, useMemo, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import {
  fetchOtaReleaseFromServer,
  getLocalOtaInfo,
  markOtaSuccessNoticeShown,
  shouldShowOtaSuccessNotice,
} from '../lib/otaUpdate';
import { Radii, Spacing } from '../theme';

export default function OtaSuccessNotice() {
  const { colors } = useTheme();
  const [visible, setVisible] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const [updateId, setUpdateId] = useState<string | null>(null);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        backdrop: {
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.45)',
          justifyContent: 'center',
          alignItems: 'center',
          padding: Spacing.lg,
        },
        card: {
          backgroundColor: colors.card,
          borderRadius: Radii.xl,
          padding: Spacing.lg,
          width: '100%',
          maxWidth: 400,
          alignItems: 'center',
          borderWidth: 1,
          borderColor: colors.border,
        },
        icon: { fontSize: 36, fontWeight: '900', color: colors.success, marginBottom: 8 },
        title: { fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'center' },
        version: {
          fontSize: 15,
          fontWeight: '700',
          color: colors.primary,
          marginTop: 10,
          textAlign: 'center',
          lineHeight: 22,
        },
        hint: {
          fontSize: 13,
          color: colors.textMuted,
          marginTop: 10,
          textAlign: 'center',
          lineHeight: 19,
        },
        btn: {
          backgroundColor: colors.primary,
          borderRadius: Radii.md,
          paddingVertical: 13,
          paddingHorizontal: 32,
          marginTop: 20,
          minWidth: 160,
          alignItems: 'center',
        },
        btnText: { color: colors.white, fontWeight: '800', fontSize: 15 },
      }),
    [colors],
  );

  useEffect(() => {
    let mounted = true;
    void (async () => {
      const local = getLocalOtaInfo();
      if (!local.enabled || local.isEmbeddedLaunch) return;

      const id = local.updateId;
      if (!id || !(await shouldShowOtaSuccessNotice(id))) return;

      const server = await fetchOtaReleaseFromServer(local.runtimeVersion);
      if (!mounted) return;

      setVersion(server.version || null);
      setUpdateId(id);
      setVisible(true);
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const onClose = () => {
    if (updateId) void markOtaSuccessNoticeShown(updateId);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={styles.icon}>✓</Text>
          <Text style={styles.title}>Đã cập nhật từ server</Text>
          <Text style={styles.version}>
            Phiên bản {version || 'mới'} đã được tải và áp dụng thành công.
          </Text>
          <Text style={styles.hint}>Nội dung app được phân phối qua máy chủ cập nhật (OTA).</Text>
          <TouchableOpacity style={styles.btn} onPress={onClose}>
            <Text style={styles.btnText}>Đã hiểu</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
