import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import {
  Modal,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ZoomableImage from '../ZoomableImage';

type Props = {
  uri: string | null;
  onClose: () => void;
};

export default function ImageLightbox({ uri, onClose }: Props) {
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={!!uri} transparent animationType="fade" onRequestClose={onClose}>
      <StatusBar barStyle="light-content" />
      <View style={styles.backdrop}>
        {uri ? <ZoomableImage uri={uri} /> : null}
        <Pressable
          style={[styles.closeBtn, { top: insets.top + 8 }]}
          onPress={onClose}
          hitSlop={12}
        >
          <Ionicons name="close" size={26} color="#fff" />
        </Pressable>
        <Text style={[styles.hint, { top: insets.top + 54 }]} pointerEvents="none">
          Chụm để phóng to · Kéo để xem phần bị che
        </Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
  },
  closeBtn: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  hint: {
    position: 'absolute',
    left: 16,
    right: 64,
    color: 'rgba(255,255,255,0.55)',
    fontSize: 12,
    zIndex: 2,
  },
});
