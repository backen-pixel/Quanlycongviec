import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import { useCall } from '../../context/CallContext';
import {
  consumePendingIncomingCall,
  dismissIncomingCallNotification,
  parseIncomingCallData,
  storePendingIncomingCall,
  type IncomingCallPayload,
} from '../../lib/incomingCallNotifications';
import { consumeNativeCallIntent } from '../../lib/nativeCallNotification';
import { shouldSuppressIncomingRing } from '../../lib/callSessionGuard';

/** Bước 8–10: nhận intent từ native (Trả lời) → kết nối WebRTC. */
export default function CallNotificationBridge() {
  const { applyIncomingFromPush, handleNativeCallIntent, rejectCall, acceptCall } = useCall();

  useEffect(() => {
    void consumeNativeCallIntent().then((p) => {
      if (p) handleNativeCallIntent(p);
    });
    void consumePendingIncomingCall().then((p) => {
      if (p) applyIncomingFromPush(p);
    });

    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (!response) return;
      handleResponse(response, applyIncomingFromPush, rejectCall, acceptCall);
    });

    const subResponse = Notifications.addNotificationResponseReceivedListener((response) => {
      handleResponse(response, applyIncomingFromPush, rejectCall, acceptCall);
    });

    const subReceived = Notifications.addNotificationReceivedListener((notification) => {
      const payload = parseIncomingCallData(notification.request.content.data);
      if (!payload) return;
      if (shouldSuppressIncomingRing(payload.callId)) return;
      void storePendingIncomingCall(payload);
      applyIncomingFromPush(payload);
    });

    return () => {
      subResponse.remove();
      subReceived.remove();
    };
  }, [applyIncomingFromPush, handleNativeCallIntent, rejectCall, acceptCall]);

  return null;
}

function handleResponse(
  response: Notifications.NotificationResponse,
  applyIncomingFromPush: (payload: IncomingCallPayload) => void,
  rejectCall: () => void,
  acceptCall: () => Promise<void>,
) {
  const payload = parseIncomingCallData(response.notification.request.content.data);
  if (!payload) return;

  const action = response.actionIdentifier;
  if (action === 'reject_call') {
    void dismissIncomingCallNotification(payload.callId);
    rejectCall();
    return;
  }
  applyIncomingFromPush(payload);
  if (action === 'accept_call') {
    void acceptCall();
  }
}
