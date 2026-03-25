import { useEffect, useState } from 'react';

/**
 * NotificationToast — floating toast for realtime notifications
 * Shows for 5 seconds then auto-fades (no framer-motion dependency)
 */
export default function NotificationToast({ notification, onDismiss, onNavigate }) {
  const [phase, setPhase] = useState('enter'); // 'enter' | 'visible' | 'exit'

  useEffect(() => {
    // Trigger enter animation
    requestAnimationFrame(() => setPhase('visible'));
    
    const timer = setTimeout(() => {
      setPhase('exit');
      setTimeout(onDismiss, 300);
    }, 5000);

    return () => clearTimeout(timer);
  }, [onDismiss]);

  if (!notification) return null;

  const ICONS = {
    task_assigned: '📌', task_updated: '📝', task_completed: '✅',
    deadline_warning: '⏰', deadline_overdue: '🚨',
    comment_added: '💬', stage_changed: '🎯',
    deal_won: '🏆', approval_request: '📋',
    checklist_completed: '📋', lead_assigned: '👤',
    order_confirmed: '📦', invoice_overdue: '💰',
    project_stage_changed: '🎉', project_assigned: '📁',
  };

  const COLORS = {
    task_assigned: 'bg-blue-50 border-blue-200',
    task_completed: 'bg-green-50 border-green-200',
    deadline_warning: 'bg-amber-50 border-amber-200',
    deadline_overdue: 'bg-red-50 border-red-200',
    comment_added: 'bg-purple-50 border-purple-200',
    deal_won: 'bg-emerald-50 border-emerald-200',
    approval_request: 'bg-orange-50 border-orange-200',
    checklist_completed: 'bg-lime-50 border-lime-200',
    order_confirmed: 'bg-orange-50 border-orange-200',
    invoice_overdue: 'bg-red-50 border-red-200',
  };

  const handleClick = () => {
    setPhase('exit');
    setTimeout(() => {
      onDismiss();
      onNavigate?.(notification);
    }, 300);
  };

  const handleClose = (e) => {
    e.stopPropagation();
    setPhase('exit');
    setTimeout(onDismiss, 300);
  };

  const translateX = phase === 'visible' ? '0' : '120%';
  const opacity = phase === 'exit' ? 0 : 1;

  return (
    <div
      onClick={handleClick}
      style={{
        transform: `translateX(${translateX})`,
        opacity,
        transition: 'transform 0.3s ease-out, opacity 0.3s ease-out',
      }}
      className={`fixed top-4 right-4 z-[9999] w-80 p-4 rounded-xl shadow-xl border cursor-pointer ${COLORS[notification.type] || 'bg-gray-50 border-gray-200'} hover:shadow-2xl`}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl mt-0.5 shrink-0">{ICONS[notification.type] || '🔔'}</span>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-gray-900 text-sm truncate">{notification.title}</h3>
          <p className="text-gray-700 text-xs mt-1 line-clamp-2">{notification.message}</p>
        </div>
        <button onClick={handleClose} className="shrink-0 text-gray-400 hover:text-gray-600 text-sm mt-0.5">✕</button>
      </div>
    </div>
  );
}
