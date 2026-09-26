import React, { useEffect, useState } from 'react';
import App from './App.jsx';
import { emptyState, validateState } from './data.js';

async function request(path, token, body, method = 'POST') {
  let response;
  try {
    response = await fetch(path, { method: body === undefined ? 'GET' : method,
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(20000) });
  } catch { throw new Error('Не удалось связаться с сервером. Проверьте соединение и попробуйте снова.'); }
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Не удалось сохранить данные.');
  return result;
}

export default function CloudGate() {
  const [cloud, setCloud] = useState(null), [error, setError] = useState(''), [attempt, setAttempt] = useState(0);
  const [demo, setDemo] = useState(false);
  const tg = window.Telegram?.WebApp;
  const telegram = Boolean(tg?.initData);
  useEffect(() => {
    if (!telegram) return;
    let cancelled = false;
    tg.ready(); tg.expand();
    const viewport = () => {
      const safe = tg.contentSafeAreaInset || {}, device = tg.safeAreaInset || {};
      document.documentElement.style.setProperty('--tg-safe-top', `${(safe.top || 0) + (device.top || 0)}px`);
      document.documentElement.style.setProperty('--tg-safe-bottom', `${(safe.bottom || 0) + (device.bottom || 0)}px`);
    };
    viewport(); tg.onEvent('contentSafeAreaChanged', viewport); tg.onEvent('safeAreaChanged', viewport);
    (async () => {
      setError('');
      try {
        const { token } = await request('/api/auth', null, { initData: tg.initData });
        const snapshot = await request('/api/state', token);
        const adapter = {
          state: snapshot.state ? validateState(snapshot.state) : emptyState(), isNew: !snapshot.state, revision: snapshot.revision,
          canMessage: snapshot.canMessage, telegram: tg,
          async save(state) {
            const result = await request('/api/state', token, { state, revision: adapter.revision }, 'PUT');
            adapter.revision = result.revision;
          },
          requestMessages() {
            return new Promise(resolve => {
              if (tg.requestWriteAccess) tg.requestWriteAccess(granted => resolve(granted));
              else { tg.openTelegramLink('https://t.me/bpjournalbot?start=reminders'); resolve(false); }
            });
          },
        };
        if (!cancelled) setCloud(adapter);
      } catch (e) { if (!cancelled) setError(e.message); }
    })();
    return () => { cancelled = true; tg.offEvent('contentSafeAreaChanged', viewport); tg.offEvent('safeAreaChanged', viewport); };
  }, [telegram, attempt]);
  if (cloud) return <App cloud={cloud} />;
  if (!import.meta.env.PROD && !telegram) return <App />;
  if (demo) return <App previewOnly />;
  return <main className="cloud-gate"><h1>Дневник здоровья</h1>
    {telegram ? <><p role={error ? 'alert' : 'status'}>{error || 'Открываем ваш дневник…'}</p>{error && <button onClick={() => setAttempt(value => value + 1)}>Попробовать снова</button>}</> : <><p>Откройте дневник в Telegram, чтобы ваши измерения и напоминания сохранялись в аккаунте.</p><a href="https://t.me/bpjournalbot?start=app">Открыть @bpjournalbot</a><button onClick={() => setDemo(true)}>Посмотреть демо</button></>}
  </main>;
}
