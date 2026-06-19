import { PhoneIncoming, Video } from 'lucide-react';
import {
  extractCallLogPayloadFromMessage,
  getCallLogCardSubtitle,
  getCallLogCardTitle,
  resolveCallBackTarget,
} from '../lib/messengerCallLog';

export default function MessengerCallLogCard({
  message,
  viewerUserId,
  groupMeta,
  groupId,
  groupTitle = '',
  callBusy = false,
  onCallBack,
  className = '',
}) {
  const payload = extractCallLogPayloadFromMessage(message);
  if (!payload) return null;

  const title = getCallLogCardTitle(payload);
  const subtitle = getCallLogCardSubtitle(payload, viewerUserId);
  const target = resolveCallBackTarget(payload, message, viewerUserId, groupMeta, groupId, groupTitle);
  const canCallBack = !!target && !callBusy;
  const Icon = payload.kind === 'video' ? Video : PhoneIncoming;

  const handleCallBack = () => {
    if (!canCallBack || !onCallBack) return;
    onCallBack(target);
  };

  return (
    <div className={`w-[min(100%,240px)] rounded-2xl bg-slate-100/95 p-2.5 ${className}`.trim()}>
      <div className="flex items-center gap-2.5 mb-2">
        <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full bg-slate-200/90">
          <Icon className="h-4 w-4 text-slate-800" strokeWidth={2.25} aria-hidden />
        </div>
        <div className="min-w-0 text-left">
          <p className="text-[13px] font-semibold leading-tight text-slate-900">{title}</p>
          {subtitle ? (
            <p className="text-[12px] leading-tight text-slate-500 mt-0.5">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {target ? (
        <button
          type="button"
          onClick={handleCallBack}
          disabled={!canCallBack}
          className="w-full rounded-xl bg-slate-200/90 py-2 text-[13px] font-semibold text-slate-900 transition hover:bg-slate-300/90 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Gọi lại
        </button>
      ) : null}
    </div>
  );
}
