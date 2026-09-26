import React, { useEffect, useState } from 'react';
import App from './App.jsx';
import { telegramLaunch, openBot, BOT_LINK } from './telegram.js';
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
  const [launch, setLaunch] = useState(() => telegramLaunch(window));
  const { tg, initData } = launch;
  const telegram = Boolean(initData);
  useEffect(() => {
    const refresh = () => setLaunch(current => {
      const next = telegramLaunch(window);
      return current.tg === next.tg && current.initData === next.initData && current.hasContext === next.hasContext ? current : next;
    });
    // Recover late bridge initialization or a restored Mini App without requiring a React rerender.
    const interval = setInterval(refresh, 250);
    const stop = setTimeout(() => clearInterval(interval), 5000);
    window.addEventListener('pageshow', refresh); window.addEventListener('hashchange', refresh);
    return () => { clearInterval(interval); clearTimeout(stop); window.removeEventListener('pageshow', refresh); window.removeEventListener('hashchange', refresh); };
  }, [attempt]);
  useEffect(() => {
    setCloud(null);
    if (!telegram) return;
    let cancelled = false;
    tg?.ready?.(); tg?.expand?.();
    const viewport = () => {
      const safe = tg?.contentSafeAreaInset || {}, device = tg?.safeAreaInset || {};
      document.documentElement.style.setProperty('--tg-safe-top', `${(safe.top || 0) + (device.top || 0)}px`);
      document.documentElement.style.setProperty('--tg-safe-bottom', `${(safe.bottom || 0) + (device.bottom || 0)}px`);
    };
    viewport(); tg?.onEvent?.('contentSafeAreaChanged', viewport); tg?.onEvent?.('safeAreaChanged', viewport);
    (async () => {
      setError('');
      try {
        const { token } = await request('/api/auth', null, { initData });
        const snapshot = await request('/api/state', token);
        const adapter = {
          sessionKey: token,
          state: snapshot.state ? validateState(snapshot.state) : emptyState(), isNew: !snapshot.state, revision: snapshot.revision,
          canMessage: snapshot.canMessage, telegram: tg,
          async save(state) {
            const result = await request('/api/state', token, { state, revision: adapter.revision }, 'PUT');
            adapter.revision = result.revision;
          },
          requestMessages() {
            return new Promise(resolve => {
              if (tg?.requestWriteAccess) tg.requestWriteAccess(granted => resolve(granted));
              else { openBot(window); resolve(false); }
            });
          },
        };
        if (!cancelled) setCloud(adapter);
      } catch (e) { if (!cancelled) setError(e.message); }
    })();
    return () => { cancelled = true; tg?.offEvent?.('contentSafeAreaChanged', viewport); tg?.offEvent?.('safeAreaChanged', viewport); };
  }, [initData, tg, attempt]);
  if (cloud) return <App key={cloud.sessionKey} cloud={cloud} />;
  if (!import.meta.env.PROD && !telegram && !launch.hasContext) return <App />;
  if (demo) return <App previewOnly />;
  const launchProblem = !launch.sdkAvailable || launch.hasContext;
  return <main className="cloud-gate"><h1>{launchProblem && !telegram ? 'Не удалось войти в дневник' : 'Дневник здоровья'}</h1>
    {telegram ? <><p role={error ? 'alert' : 'status'}>{error || 'Открываем ваш дневник…'}</p>{error && <button onClick={() => setAttempt(value => value + 1)}>Попробовать снова</button>}</> : <>
      <p>{!launch.sdkAvailable ? 'Не удалось загрузить подключение к Telegram. Попробуйте перезагрузить приложение.' : launch.hasContext ? 'Telegram не передал данные входа. Закройте это окно и запустите дневник кнопкой «Открыть дневник» в чате с ботом.' : 'Запустите дневник кнопкой «Открыть дневник» в чате с ботом. Обычная ссылка на сайт не передаёт данные входа.'}</p>
      {launchProblem && <button onClick={() => window.location.reload()}>Перезагрузить приложение</button>}
      <a href={BOT_LINK} onClick={event => { if (launchProblem) { event.preventDefault(); openBot(window); } }}>Перейти в чат с ботом</a>
      <p className="small-note">Профиль и записи привязаны к Telegram-аккаунту. Повторно создавать профиль на другом устройстве не нужно.</p>
      {!launchProblem && <button onClick={() => setDemo(true)}>Посмотреть демо</button>}
    </>}
  </main>;
}
