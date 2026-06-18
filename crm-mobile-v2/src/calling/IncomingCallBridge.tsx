/**
 * Presentation — cầu nối native/FCM → controller cuộc gọi.
 * - Tiêu thụ intent native khi app boot từ màn cuộc gọi đến (Accept/Reject lúc app bị kill).
 * - Tiêu thụ pending incoming lưu lúc nhận FCM.
 * - Lắng nghe expo-notifications (foreground/response).
 */
import { useEffect } from 'react';
import * as Notifications from 'expo-notifications';
import {
  consumePendingIncomingCall, dismissIncomingCallNotification,
  parseCallDismissData, parseIncomingCallData, storePendingIncomingCall, type IncomingCallPayload,
} from '../lib/incomingCallNotifications';
import { consumeNativeCallIntent } from '../lib/nativeCallNotification';
import { shouldSuppressIncomingRing } from '../lib/callSessionGuard';
import { useCall } from './CallProvider';

export default function IncomingCallBridge() {
  const {
    applyIncomingFromPush, handleNativeCallIntent, rejectCall, acceptCall, dismissIncomingSilently,
  } = useCall();

  useEffect(() => {
    void consumeNativeCallIntent().then((p) => { if (p) handleNativeCallIntent(p); });
    void consumePendingIncomingCall().then((p) => { if (p) applyIncomingFromPush(p); });

    void Notifications.getLastNotificationResponseAsync().then((r) => {
      if (r) handleResponse(r, applyIncomingFromPush, rejectCall, acceptCall);
    });
    const subResponse = Notifications.addNotificationResponseReceivedListener((r) =>
      handleResponse(r, applyIncomingFromPush, rejectCall, acceptCall));
    const subReceived = Notifications.addNotificationReceivedListener((n) => {
      const dismissId = parseCallDismissData(n.request.content.data);
      if (dismissId) {
        dismissIncomingSilently(dismissId);
        return;
      }
      const payload = parseIncomingCallData(n.request.content.data);
      if (!payload || shouldSuppressIncomingRing(payload.callId)) return;
      void storePendingIncomingCall(payload);
      applyIncomingFromPush(payload);
    });

    return () => { subResponse.remove(); subReceived.remove(); };
  }, [applyIncomingFromPush, handleNativeCallIntent, rejectCall, acceptCall, dismissIncomingSilently]);

  return null;
}

function handleResponse(
  response: Notifications.NotificationResponse,
  applyIncomingFromPush: (p: IncomingCallPayload) => void,
  rejectCall: () => void,
  acceptCall: () => Promise<void>,
) {
  const payload = parseIncomingCallData(response.notification.request.content.data);
  if (!payload) return;
  applyIncomingFromPush(payload);
  const action = response.actionIdentifier;
  if (action === 'reject_call') {
    void dismissIncomingCallNotification(payload.callId);
    setTimeout(() => rejectCall(), 0);
  } else if (action === 'accept_call') {
    setTimeout(() => { void acceptCall(); }, 0);
  }
}
