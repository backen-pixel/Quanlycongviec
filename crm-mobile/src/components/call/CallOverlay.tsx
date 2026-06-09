import React from 'react';
import { Platform } from 'react-native';
import { useCall } from '../../context/CallContext';
import CallOverlayIos from './CallOverlay.ios';

/**
 * Android: UI cuộc gọi do IncomingCallActivity native (màn khóa / màn chờ / full-screen).
 * iOS: overlay trong app.
 */
export default function CallOverlay() {
  const { status } = useCall();

  if (status === 'idle') return null;
  if (Platform.OS === 'android') return null;

  return <CallOverlayIos />;
}
