import React, { useRef, useState } from 'react';
import { validateProfile } from './data.js';

export default function WelcomeForm({ profile, cloud, onSave }) {
  const [height, setHeight] = useState(''), [weight, setWeight] = useState('');
  const [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const errorRef = useRef(null);
  async function finish(skip = false) {
    if (busy) return;
    const parsedHeight = skip || !height ? '' : Number(height.replace(',', '.'));
    const parsedWeight = skip || !weight ? null : Number(weight.replace(',', '.'));
    const nextProfile = { ...profile, height: parsedHeight };
    let message = validateProfile(nextProfile, []);
    if (parsedWeight != null && (!Number.isFinite(parsedWeight) || parsedWeight < 10 || parsedWeight > 500)) message = 'Вес: число от 10 до 500 кг.';
    if (!message) {
      setBusy(true);
      try { message = await onSave(nextProfile, [], parsedWeight) || ''; }
      catch { message = 'Не удалось создать дневник. Попробуйте ещё раз.'; }
      finally { setBusy(false); }
    }
    if (message) { setError(message); requestAnimationFrame(() => errorRef.current?.focus()); }
  }
  return <section className="page welcome-page compact-inputs">
    <div className="welcome-heading"><h1>Ваш дневник</h1><button type="button" className="text-button" disabled={busy} onClick={() => finish(true)}>Пропустить</button></div>
    <p className="welcome-intro">Можно сразу перейти к измерениям. Рост и вес — по желанию.</p>
    <form onSubmit={event => { event.preventDefault(); finish(); }}>
      <div className="two-fields">
        <div className="field"><label htmlFor="welcome-height">Рост, см</label><input className="native-input" id="welcome-height" inputMode="decimal" placeholder="178" value={height} onChange={e => { setHeight(e.target.value); setError(''); }} /><small>Для расчёта ИМТ</small></div>
        <div className="field"><label htmlFor="welcome-weight">Вес, кг</label><input className="native-input" id="welcome-weight" inputMode="decimal" placeholder="76,4" value={weight} onChange={e => { setWeight(e.target.value); setError(''); }} /><small>Первая запись</small></div>
      </div>
      <p className="welcome-note">Остальные параметры можно заполнить позже в профиле.</p>
      <p className="welcome-storage">{cloud ? 'Данные сохраняются в вашем Telegram-аккаунте.' : 'Данные останутся в этом браузере. Копию можно скачать в профиле.'}</p>
      {error && <div className="form-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</div>}
      <div className="record-actions welcome-actions"><button type="submit" className="alarm-save" disabled={busy}>{busy ? 'Сохраняем…' : 'Начать'}</button></div>
    </form>
  </section>;
}
