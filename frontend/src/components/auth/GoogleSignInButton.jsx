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

export default function GoogleSignInButton({ onSuccess, onError, hintEmail, className = '' }) {
  const btnRef = useRef(null);
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.get('/auth/google-config');
        if (cancelled || !data?.enabled || !data?.clientId) return;
        await loadGoogleScript();
        if (cancelled || !btnRef.current) return;

        window.google.accounts.id.initialize({
          client_id: data.clientId,
          callback: (response) => {
            if (response?.credential) onSuccess?.(response.credential);
            else onError?.('Không nhận được token Google');
          },
          auto_select: false,
          context: 'signin',
          ux_mode: 'popup',
          login_hint: hintEmail || undefined,
        });

        btnRef.current.innerHTML = '';
        window.google.accounts.id.renderButton(btnRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text: 'signin_with',
          shape: 'rectangular',
          width: 320,
          locale: 'vi',
        });
        setEnabled(true);
        setReady(true);
      } catch (e) {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, [hintEmail, onSuccess, onError]);

  if (!ready) return null;
  if (!enabled) return null;

  return (
    <div className={className}>
      <div ref={btnRef} className="flex justify-center min-h-[44px]" />
    </div>
  );
}
