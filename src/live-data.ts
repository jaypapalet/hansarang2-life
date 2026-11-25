import { useEffect, useState } from 'react';

export const seoulTime = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit',
});

export function useLiveData<T>(endpoint: string | null, refreshMs: number) {
  const [state, setState] = useState<{ data: T | null; failed: boolean }>({ data: null, failed: false });

  useEffect(() => {
    if (!endpoint) return;
    const url = endpoint;
    const lifecycle = new AbortController();
    let timer: number | undefined;
    let pending = false;
    let lastAttempt = -Infinity;

    async function update() {
      if (lifecycle.signal.aborted || pending || document.hidden) return;
      window.clearTimeout(timer);
      pending = true;
      lastAttempt = Date.now();
      try {
        const response = await fetch(url, {
          cache: 'no-store',
          signal: AbortSignal.any([lifecycle.signal, AbortSignal.timeout(25_000)]),
        });
        if (!response.ok) throw new Error('Live data unavailable');
        const data: T = await response.json();
        if (!lifecycle.signal.aborted) setState({ data, failed: false });
      } catch {
        if (!lifecycle.signal.aborted) setState(previous => ({ ...previous, failed: true }));
      } finally {
        pending = false;
        if (!lifecycle.signal.aborted && !document.hidden) timer = window.setTimeout(update, refreshMs);
      }
    }

    function onVisibility() {
      window.clearTimeout(timer);
      if (!document.hidden && !pending) {
        const remaining = refreshMs - (Date.now() - lastAttempt);
        if (remaining <= 0) void update();
        else timer = window.setTimeout(update, remaining);
      }
    }

    document.addEventListener('visibilitychange', onVisibility);
    void update();
    return () => {
      lifecycle.abort();
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [endpoint, refreshMs]);

  return state;
}
