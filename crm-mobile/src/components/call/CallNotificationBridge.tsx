import { useEffect } from 'react';
import { AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import { useCall } from '../../context/CallContext';
import {
  consumePendingIncomingCall,
  dismissIncomingCallNotification,
  parseIncomingCallData,
  showIncomingCallNotification,
  storePendingIncomingCall,
  type IncomingCallPayload,
} from '../../lib/incomingCallNotifications';
import { consumeNativeCallIntent } from '../../lib/nativeCallNotification';

/** Lắng nghe push/local notification cuộc gọi — mở app → hiện CallOverlay. */
export default function CallNotificationBridge() {
  const { applyIncomingFromPush, rejectCall, acceptCall } = useCall();

  useEffect(() => {
    void consumeNativeCallIntent().then((p) => {
      if (!p) return;
      applyIncomingFromPush(p);
      if (p.callAction === 'accept') {
        void acceptCall();
      }
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
      void storePendingIncomingCall(payload);
      if (AppState.currentState !== 'active') {
        void showIncomingCallNotification(payload);
        applyIncomingFromPush(payload);
      }
    });

    return () => {
      subResponse.remove();
      subReceived.remove();
    };
  }, [applyIncomingFromPush, rejectCall, acceptCall]);

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
