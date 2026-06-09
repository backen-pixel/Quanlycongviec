import React from 'react';
import { useCall } from '../../context/CallContext';
import CallScreen from './CallScreen';

/** Giao diện cuộc gọi in-app (incoming + active) — thiết kế theo Messenger. */
export default function CallOverlay() {
  const { status } = useCall();
  if (status === 'idle') return null;
  return <CallScreen />;
}
