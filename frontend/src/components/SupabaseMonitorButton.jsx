import { Link } from 'react-router-dom';
import { Database } from 'lucide-react';

/** Nút mở trang giám sát Supabase (yêu cầu mật khẩu tại trang đích). */
export default function SupabaseMonitorButton({ className = '' }) {
  return (
    <Link
      to="/management/backup-sync"
      className={`h-9 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-sm font-medium inline-flex items-center gap-1.5 text-slate-700 shrink-0 ${className}`}
      title="Giám sát Supabase Primary / Backup"
    >
      <Database className="h-4 w-4 text-teal-700" />
      Giám sát Supabase
    </Link>
  );
}
