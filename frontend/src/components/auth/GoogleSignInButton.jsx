import { useEffect, useRef, useState } from 'react';
import api from '../../lib/api';

let scriptPromise = null;

function loadGoogleScript() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });
  return scriptPromise;
}

/** @param {'signin'|'signup'} mode — signup dùng nút "Đăng ký bằng Google" */
export default function GoogleSignInButton({
  onSuccess,
  onError,
  hintEmail,
  className = '',
  mode = 'signin',
}) {
  const btnRef = useRef(null);
  const [status, setStatus] = useState('loading'); // loading | ready | disabled | error
  const [statusHint, setStatusHint] = useState('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data } = await api.get('/auth/google-config');
        if (cancelled) return;
        if (!data?.enabled || !data?.clientId) {
          setStatus('disabled');
          setStatusHint('Google Sign-In chưa bật trên server');
          return;
        }

        await loadGoogleScript();
        if (cancelled || !btnRef.current) return;

        const isSignup = mode === 'signup';
        window.google.accounts.id.initialize({
          client_id: data.clientId,
          callback: (response) => {
            if (response?.credential) onSuccess?.(response.credential);
            else onError?.('Không nhận được token Google');
          },
          auto_select: false,
          context: isSignup ? 'signup' : 'signin',
          ux_mode: 'popup',
          login_hint: hintEmail || undefined,
        });

        btnRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(btnRef.current, {
          type: 'standard',
          theme: isSignup ? 'filled_blue' : 'outline',
          size: 'large',
          text: isSignup ? 'signup_with' : 'signin_with',
          shape: 'rectangular',
          width: 320,
          locale: 'vi',
        });
        setStatus('ready');
      } catch (e) {
        if (cancelled) return;
        setStatus('error');
        setStatusHint(e.response?.data?.error || e.message || 'Không tải được Google Sign-In');
      }
    })();

    return () => { cancelled = true; };
  }, [hintEmail, mode, onSuccess, onError]);

  return (
    <div className={className}>
      <div
        ref={btnRef}
        className={`flex justify-center min-h-[44px] ${status === 'ready' ? '' : 'hidden'}`}
      />
      {status === 'loading' && (
        <p className="text-center text-xs text-slate-400 py-2">
          {mode === 'signup' ? 'Đang tải đăng ký Google…' : 'Đang tải đăng nhập Google…'}
        </p>
      )}
      {(status === 'disabled' || status === 'error') && statusHint && (
        <p className="text-center text-xs text-amber-600 py-2">{statusHint}</p>
      )}
    </div>
  );
}
