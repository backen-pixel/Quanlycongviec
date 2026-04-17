import React, { useMemo } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { WebView } from 'react-native-webview';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { MoreStackParamList } from '../navigation/types';
import { WEB_APP_ORIGIN } from '../config';
import { CrmColors } from '../theme/crmTheme';

type Props = NativeStackScreenProps<MoreStackParamList, 'CrmEmbeddedWeb'>;

export default function CrmEmbeddedWebScreen({ route }: Props) {
  const { path } = route.params;
  const uri = useMemo(() => {
    const base = WEB_APP_ORIGIN;
    if (!base) return '';
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${base}${p}`;
  }, [path]);

  React.useEffect(() => {
    if (!WEB_APP_ORIGIN) {
      Alert.alert(
        'Chưa cấu hình web',
        'Thêm EXPO_PUBLIC_WEB_APP_URL trong .env để mở trang trong app.',
      );
    }
  }, []);

  if (!uri) {
    return (
      <View style={styles.center}>
        <Text style={styles.err}>Thiếu EXPO_PUBLIC_WEB_APP_URL</Text>
      </View>
    );
  }

  return <WebView source={{ uri }} style={styles.flex} startInLoadingState setSupportMultipleWindows={false} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: CrmColors.white },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  err: { color: CrmColors.gray600, textAlign: 'center' },
});
