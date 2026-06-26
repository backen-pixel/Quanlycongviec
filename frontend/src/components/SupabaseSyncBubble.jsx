/**

 * Bong bóng góc màn hình — tiến trình đồng bộ Supabase (kiểu Drive transfer).

 * Giữ khi đổi trang, thu nhỏ / mở rộng, poll server khi quay lại.

 */

import { useEffect, useRef, useState } from 'react';

import { createPortal } from 'react-dom';

import { Link } from 'react-router-dom';

import {

  ChevronDown, ChevronUp, X, Loader2, CheckCircle2, AlertCircle, Database,

} from 'lucide-react';

import { useAuth } from '../lib/auth';

import { connectSocket, getSocket } from '../lib/socket';

import api from '../lib/api';

import { useSupabaseSync } from '../lib/useSupabaseSync';

import {

  startSupabaseSync,

  appendSupabaseSyncLog,

  finishSupabaseSync,

  clearSupabaseSync,

  hydrateFromPublicStatus,

} from '../lib/supabaseSyncStore';
import { formatSwitchRoute } from '../lib/supabaseSwitchLabels';

function routeLabel(active) {
  if (active.direction) return active.direction;
  if (active.from && active.target) return formatSwitchRoute(active.from, active.target);
  return '';
}



function SyncStepList({ steps }) {

  if (!steps?.length) return null;

  return (

    <ul className="px-3 py-2 space-y-1 border-b border-slate-100 bg-slate-50/80 max-h-36 overflow-y-auto">

      {steps.map((s) => (

        <li key={s.id} className="flex items-start gap-2 text-[11px] text-slate-700">

          {s.running ? (

            <Loader2 className="w-3.5 h-3.5 text-teal-600 shrink-0 mt-0.5 animate-spin" />

          ) : s.ok ? (

            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />

          ) : s.ok === false ? (

            <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />

          ) : (

            <span className="w-3.5 h-3.5 rounded-full border border-slate-300 shrink-0 mt-0.5" />

          )}

          <span className="leading-snug">{s.label}</span>

        </li>

      ))}

    </ul>

  );

}



function SyncLogList({ logs }) {

  if (!logs?.length) {

    return <div className="text-xs text-slate-400 px-3 py-2">Chờ log chi tiết từ server…</div>;

  }

  return (

    <ul className="max-h-56 overflow-y-auto bg-slate-900 text-slate-100 font-mono text-[11px]">

      {logs.map((entry, i) => (

        <li key={`${entry.at}-${i}`} className="px-3 py-1 border-b border-slate-800 last:border-0 whitespace-pre-wrap break-all">

          {entry.line}

        </li>

      ))}

    </ul>

  );

}



function SupabaseSyncBubbleInner() {

  const { active } = useSupabaseSync();

  const [minimized, setMinimized] = useState(false);

  const [dismissed, setDismissed] = useState(false);

  const logEndRef = useRef(null);



  const running = active?.status === 'running';

  const done = active?.status === 'done';

  const failed = active?.status === 'error';



  useEffect(() => {

    if (active) setDismissed(false);

  }, [active?.id]);



  useEffect(() => {

    if (running) {

      setMinimized(false);

      setDismissed(false);

    }

  }, [running, active?.id]);



  useEffect(() => {

    if (!running) return undefined;

    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });

  }, [active?.logs?.length, running]);



  useEffect(() => {

    connectSocket();

    const socket = getSocket();

    if (!socket) return undefined;



    const onBackupStart = (payload) => {

      startSupabaseSync({

        type: 'backup',

        title: 'Đồng bộ Supabase Backup',

        message: payload?.message || 'Đang đồng bộ Chính → Dự phòng…',
        direction: 'Chính → Dự phòng',

        syncParts: ['DB', 'Storage/bucket'],

        at: payload?.at,

      });

    };



    const onBackupProgress = (payload) => {

      if (payload?.line) appendSupabaseSyncLog(payload.line, payload.at);

    };



    const onBackupDone = (payload) => {

      finishSupabaseSync({ ok: payload?.ok !== false, error: payload?.error, at: payload?.at });

    };



    const onSwitchPrepareStart = (payload) => {
      startSupabaseSync({
        type: 'switch',
        title: 'Chuẩn bị chuyển database',
        message: payload?.message || 'Đang chuẩn bị chuyển database…',
        direction: payload?.direction,
        from: payload?.from,
        target: payload?.target,
        phase: 'health',
        at: payload?.at,
      });
    };

    const onSwitchPrepareUpdate = (payload) => {
      if (!payload) return;
      startSupabaseSync({
        type: 'switch',
        title: 'Chuẩn bị chuyển database',
        message: payload.message,
        direction: payload.direction,
        from: payload.from,
        target: payload.target,
        phase: payload.phase,
        steps: payload.steps,
        syncParts: payload.sync_parts,
        at: payload.at,
      });
    };

    const onSwitchStart = (payload) => {
      startSupabaseSync({
        type: 'switch',
        title: payload?.post_sync ? 'Đồng bộ sau chuyển database' : 'Chuẩn bị chuyển database',
        message: payload?.message || 'Đang đồng bộ dữ liệu…',
        direction: payload?.direction,
        from: payload?.from,
        target: payload?.target,
        phase: 'full_sync',
        at: payload?.at,
      });
    };



    const onSwitchProgress = (payload) => {

      if (payload?.line) appendSupabaseSyncLog(payload.line, payload.at);

    };



    const onSwitchDone = () => {

      finishSupabaseSync({ ok: true });

    };



    const onSwitchError = (payload) => {

      finishSupabaseSync({ ok: false, error: payload?.error, at: payload?.at });

    };



    socket.on('supabase:backup-sync-start', onBackupStart);

    socket.on('supabase:backup-sync-progress', onBackupProgress);

    socket.on('supabase:backup-sync-done', onBackupDone);

    socket.on('supabase:switch-prepare-start', onSwitchPrepareStart);
    socket.on('supabase:switch-prepare-update', onSwitchPrepareUpdate);
    socket.on('supabase:switch-full-sync-start', onSwitchStart);

    socket.on('supabase:switch-full-sync-progress', onSwitchProgress);

    socket.on('supabase:switch-full-sync-done', onSwitchDone);

    socket.on('supabase:switch-full-sync-error', onSwitchError);



    return () => {

      socket.off('supabase:backup-sync-start', onBackupStart);

      socket.off('supabase:backup-sync-progress', onBackupProgress);

      socket.off('supabase:backup-sync-done', onBackupDone);

      socket.off('supabase:switch-prepare-start', onSwitchPrepareStart);
      socket.off('supabase:switch-prepare-update', onSwitchPrepareUpdate);
      socket.off('supabase:switch-full-sync-start', onSwitchStart);

      socket.off('supabase:switch-full-sync-progress', onSwitchProgress);

      socket.off('supabase:switch-full-sync-done', onSwitchDone);

      socket.off('supabase:switch-full-sync-error', onSwitchError);

    };

  }, []);



  useEffect(() => {

    let cancelled = false;

    const poll = async () => {

      try {

        const { data } = await api.get('/production/backup-sync/sync/public-status');

        if (cancelled) return;

        hydrateFromPublicStatus(data);

      } catch { /* ignore */ }

    };

    void poll();

    const ms = running ? 2500 : 8000;

    const id = setInterval(poll, ms);

    return () => { cancelled = true; clearInterval(id); };

  }, [running, active?.id]);



  if (!active || dismissed) return null;



  const progress = active.progress ?? 0;

  const header = running

    ? `${active.title} · ${progress}%`

    : failed

      ? `${active.title} · Lỗi`

      : `${active.title} · Xong`;



  function handleClose() {

    if (running) {

      setMinimized(true);

      return;

    }

    clearSupabaseSync();

    setDismissed(true);

  }



  const route = routeLabel(active);



  const panel = (

    <div

      className={`fixed z-[10035] w-[min(100vw-1.5rem,400px)] bg-white shadow-2xl border border-teal-200 overflow-hidden transition-all ${

        minimized

          ? 'bottom-0 right-4 rounded-t-xl border-b-0'

          : 'bottom-20 right-4 rounded-xl'

      }`}

      role="region"

      aria-label="Tiến trình đồng bộ Supabase"

    >

      <div

        className={`flex items-center gap-2 px-3 py-2.5 bg-teal-50/80 ${minimized ? '' : 'border-b border-teal-100'} ${minimized ? 'cursor-pointer select-none' : ''}`}

        onClick={() => { if (minimized) setMinimized(false); }}

        onKeyDown={(e) => { if (minimized && (e.key === 'Enter' || e.key === ' ')) setMinimized(false); }}

        role={minimized ? 'button' : undefined}

        tabIndex={minimized ? 0 : undefined}

        title={minimized ? 'Bấm để mở rộng' : undefined}

      >

        {running && <Loader2 size={16} className="animate-spin text-teal-700 shrink-0" />}

        {done && !failed && <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />}

        {failed && <AlertCircle size={16} className="text-red-600 shrink-0" />}

        {!running && !done && !failed && <Database size={16} className="text-teal-700 shrink-0" />}

        <span className="flex-1 text-sm font-medium text-slate-800 truncate">{header}</span>

        {minimized && running && (

          <span className="text-xs text-teal-700 shrink-0 tabular-nums font-semibold">{progress}%</span>

        )}

        <button

          type="button"

          onClick={(e) => { e.stopPropagation(); setMinimized((v) => !v); }}

          className="p-1 rounded hover:bg-teal-100 text-slate-500"

          aria-label={minimized ? 'Mở rộng' : 'Thu nhỏ'}

        >

          {minimized ? <ChevronUp size={16} /> : <ChevronDown size={16} />}

        </button>

        <button

          type="button"

          onClick={(e) => { e.stopPropagation(); handleClose(); }}

          className="p-1 rounded hover:bg-teal-100 text-slate-500"

          aria-label="Đóng"

        >

          <X size={16} />

        </button>

      </div>



      {minimized && running && (

        <div className="h-0.5 bg-teal-100">

          <div className="h-full bg-teal-600 transition-all" style={{ width: `${progress}%` }} />

        </div>

      )}



      {!minimized && (

        <>

          <div className="px-3 py-2 text-xs text-slate-600 bg-white border-b border-slate-100 space-y-1.5">

            <p className="font-medium text-slate-800 truncate" title={active.message}>

              {active.message}

            </p>

            {route && (
              <p className="text-teal-800 font-semibold text-sm">{route}</p>
            )}

            {active.syncParts?.length > 0 && (

              <div className="flex flex-wrap gap-1">

                {active.syncParts.map((p) => (

                  <span key={p} className="px-1.5 py-0.5 rounded bg-teal-100 text-teal-800 text-[10px] font-semibold">

                    {p}

                  </span>

                ))}

              </div>

            )}

            {running && (

              <div className="mt-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">

                <div className="h-full bg-teal-600 transition-all" style={{ width: `${progress}%` }} />

              </div>

            )}

            {failed && active.error && (

              <p className="text-red-600">{active.error}</p>

            )}

            {done && !failed && (

              <p className="text-emerald-700 font-medium">Đã đồng bộ xong</p>

            )}

          </div>

          <SyncStepList steps={active.steps} />

          <SyncLogList logs={active.logs} />

          <div ref={logEndRef} />

          <div className="px-3 py-2 bg-slate-50 border-t border-slate-100 text-right">

            <Link

              to="/management/backup-sync"

              className="text-xs text-teal-700 hover:underline font-medium"

            >

              Mở trang Giám sát Supabase

            </Link>

          </div>

        </>

      )}

    </div>

  );



  return createPortal(panel, document.body);

}



export default function SupabaseSyncBubble() {

  const { user } = useAuth();

  if (!user) return null;

  return <SupabaseSyncBubbleInner />;

}


