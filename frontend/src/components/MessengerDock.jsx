import { Link } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { useMessengerDock } from '../context/MessengerDockContext';
import { LeadChatTab, MessengerGroupChatTab } from './LeadChatTabs';
import { MessageCircle, X, Minus, Maximize2 } from 'lucide-react';

const BUBBLE_W = 340;
const BUBBLE_GAP = 14;
const DOCK_W = 52;

export default function MessengerDock() {
  const { user, socket } = useAuth();
  const { windows, closeWindow, toggleMinimize, unreadByLeadId, unreadByGroupId } = useMessengerDock();
  if (!user) return null;
  const expanded = windows.filter((w) => !w.minimized);

  const totalUnread =
    Object.values(unreadByLeadId || {}).reduce((a, b) => a + (Number(b) || 0), 0) +
    Object.values(unreadByGroupId || {}).reduce((a, b) => a + (Number(b) || 0), 0);

  return (
    <>
      {expanded.map((w, i) => (
        <div
          key={w.windowKey}
          className="fixed z-[190] flex flex-col rounded-2xl border border-slate-200/80 bg-white shadow-2xl overflow-hidden ring-1 ring-black/5"
          style={{
            width: BUBBLE_W,
            height: 460,
            right: DOCK_W + BUBBLE_GAP + i * (BUBBLE_W + BUBBLE_GAP),
            bottom: 16,
          }}
        >
          <div className="shrink-0 flex items-center gap-2 px-3 py-2.5 bg-gradient-to-r from-sky-500 to-cyan-600 text-white">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-xs font-bold">
              {(w.code || w.title || '?').slice(0, 1)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold truncate">{w.title}</p>
              {w.chatType === 'lead' && w.code ? <p className="text-[10px] text-sky-100 truncate">{w.code}</p> : null}
              {w.chatType === 'messenger_group' ? (
                <p className="text-[10px] text-sky-100 truncate">Nhóm chat nội bộ</p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => toggleMinimize(w.windowKey)}
              className="p-1.5 rounded-lg hover:bg-white/15"
              title="Thu nhỏ"
            >
              <Minus className="h-4 w-4" />
            </button>
            {w.chatType === 'lead' && w.leadId ? (
              <Link
                to={`/crm/leads/${w.leadId}?tab=chat`}
                className="p-1.5 rounded-lg hover:bg-white/15"
                title="Mở Lead / Deal (CRM)"
              >
                <Maximize2 className="h-4 w-4" />
              </Link>
            ) : (
              <Link
                to="/crm/messenger"
                className="p-1.5 rounded-lg hover:bg-white/15"
                title="Mở trang Nhóm chat"
              >
                <Maximize2 className="h-4 w-4" />
              </Link>
            )}
            <button
              type="button"
              onClick={() => closeWindow(w.windowKey)}
              className="p-1.5 rounded-lg hover:bg-white/15"
              title="Đóng"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex-1 min-h-0 flex flex-col bg-slate-50">
            {w.chatType === 'messenger_group' && w.groupId ? (
              <MessengerGroupChatTab groupId={w.groupId} socket={socket} fillParent />
            ) : w.leadId ? (
              <LeadChatTab leadId={w.leadId} socket={socket} fillParent />
            ) : null}
          </div>
        </div>
      ))}

      <div
        className="fixed z-[200] flex flex-col items-center gap-2 py-3 px-1.5 rounded-l-2xl border border-slate-200 bg-white/95 shadow-lg backdrop-blur-sm"
        style={{ right: 0, top: '50%', transform: 'translateY(-50%)', width: DOCK_W }}
      >
        <Link
          to="/crm/messenger"
          className="relative w-10 h-10 rounded-full bg-gradient-to-br from-sky-500 to-cyan-600 text-white flex items-center justify-center shadow-md hover:opacity-95"
          title="Nhóm chat — Lead / Deal / nhóm nội bộ"
        >
          <MessageCircle className="h-5 w-5" />
          {totalUnread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center border-2 border-white">
              {totalUnread > 99 ? '99+' : totalUnread}
            </span>
          )}
        </Link>
        <div className="w-8 border-t border-slate-200 my-0.5" />
        {windows.map((w) => {
          const n =
            w.chatType === 'messenger_group' && w.groupId
              ? unreadByGroupId[w.groupId] || 0
              : w.leadId
                ? unreadByLeadId[w.leadId] || 0
                : 0;
          return (
            <button
              key={w.windowKey}
              type="button"
              title={w.title}
              onClick={() => toggleMinimize(w.windowKey)}
              className={`relative w-10 h-10 rounded-full border-2 flex items-center justify-center text-[11px] font-bold transition ${
                w.minimized ? 'border-slate-200 bg-slate-100 text-slate-600' : 'border-cyan-500 bg-cyan-50 text-cyan-800'
              }`}
            >
              {(w.code || w.title || '?').slice(0, 2)}
              {n > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center border border-white">
                  {n > 99 ? '…' : n}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </>
  );
}
