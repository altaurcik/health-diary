import AlarmSettings from './AlarmSettings.jsx';
import WelcomeForm from './WelcomeForm.jsx';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AppRoot, Button, Input } from '@telegram-apps/telegram-ui';
import { Activity, ArrowDownToLine, ArrowRight, Bell, Check, ChevronRight, Clock3, Heart, History, Home, Info, Moon, Plus, Scale, ShieldCheck, SlidersHorizontal, Sun, Trash2, UserRound, X, Monitor, Repeat2 } from 'lucide-react';
import { STORAGE_KEY, PERIODS, uid, number, dayKey, formTime, formatDate, formatTime, emptyState, loadState, saveState, sorted, selectRecords, stats, chartData, chartWindow, seriesMean, bmi, reminders, makeDemo, validZone, validateRecord, validateProfile, validateState, deviceZone, timeMetadata, recordTiming, localTimeCoordinate, sevenDaySummary, summaryCoverage } from './data.js';

const METRICS = { bp: { label: 'Давление', unit: 'мм рт. ст.', icon: Activity }, pulse: { label: 'Пульс', unit: 'уд/мин', icon: Heart }, weight: { label: 'Вес', unit: 'кг', icon: Scale } };
function readInitial() { try { return loadState(window.localStorage); } catch { return { data: null, error: 'Хранилище браузера недоступно. Личные записи пока нельзя сохранить.' }; } }
function readTheme(fallback) { try { const value = localStorage.getItem('healthnote.theme'); return ['light', 'dark', 'system'].includes(value) ? value : fallback; } catch { return fallback; } }
function Icon({ as: Component, ...props }) { return <Component size={21} strokeWidth={1.8} aria-hidden="true" {...props} />; }
function Field({ label, hint, id, ...props }) { return <div className="field"><label htmlFor={id}>{label}</label><Input id={id} className="diary-input" aria-describedby={hint ? `${id}-hint` : undefined} {...props} />{hint && <small id={`${id}-hint`}>{hint}</small>}</div>; }
function SelectField({ label, id, children, ...props }) { return <div className="field"><label htmlFor={id}>{label}</label><select id={id} {...props}>{children}</select></div>; }
function Choice({ value, options, onChange, label }) { return <div className="segmented" role="group" aria-label={label}>{options.map(([key, title]) => <button key={key} type="button" aria-pressed={value === key} className={value === key ? 'selected' : ''} onClick={() => onChange(key)}>{title}</button>)}</div>; }
function Empty({ title, text, action }) { return <div className="empty"><span className="empty-icon"><Icon as={Activity} size={28} /></span><h3>{title}</h3><p>{text}</p>{action}</div>; }

function RangeNavigator({ records, metric, period, zone, bounds, onChange }) {
  const drag = useRef(null);
  const points = useMemo(() => chartData(records, metric, period, zone), [records, metric, period, zone]);
  const whole = useMemo(() => chartWindow(records, zone), [records, zone]);
  const window = chartWindow(records, zone, bounds);
  const date = coordinate => formatDate(coordinate, 'UTC', { year: 'numeric' });
  const disabled = whole.start === whole.end;
  const values = points.flatMap(p => metric === 'bp' ? [p.value, p.lower] : [p.value]);
  const low = Math.min(...values), high = Math.max(...values);
  const x = point => disabled ? 500 : (localTimeCoordinate(point.at, zone) - whole.start) / (whole.end - whole.start) * 1000;
  const y = value => high === low ? 30 : 48 - (value - low) / (high - low) * 36;
  const line = key => points.map((point, i) => `${i ? 'L' : 'M'} ${x(point)} ${y(point[key])}`).join(' ');
  return <div className="range-navigator" role="group" aria-label="Окно диапазона истории">
    <div className="range-heading"><span>Диапазон на графике</span><button type="button" className="text-button" disabled={bounds[0] === 0 && bounds[1] === 1000} onClick={() => onChange([0, 1000])}>Весь период</button></div>
    <div className="range-track">
      <svg viewBox="0 0 1000 60" preserveAspectRatio="none" aria-hidden="true"><path d={line('value')} className="chart-line" />{metric === 'bp' && <path d={line('lower')} className="chart-line lower" />}{points.length === 1 && <circle cx="500" cy={y(points[0].value)} r="3" className="chart-dot" />}</svg>
      <div className="range-band" style={{ left: `calc(22px + (100% - 44px) * ${bounds[0] / 1000})`, right: `calc(22px + (100% - 44px) * ${1 - bounds[1] / 1000})` }}
        onPointerDown={event => { if (disabled) return; event.currentTarget.setPointerCapture(event.pointerId); drag.current = { x: event.clientX, bounds, width: event.currentTarget.parentElement.clientWidth - 44 }; }}
        onPointerMove={event => { if (!drag.current) return; const original = drag.current; const delta = Math.round((event.clientX - original.x) / original.width * 1000); const start = Math.max(0, Math.min(1000 - (original.bounds[1] - original.bounds[0]), original.bounds[0] + delta)); onChange([start, start + original.bounds[1] - original.bounds[0]]); }}
        onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }} />
      <input type="range" className="range-boundary" min="0" max="1000" step="1" disabled={disabled} value={bounds[0]} aria-label="Левая граница диапазона" aria-valuetext={date(window.start)} onChange={event => onChange([Math.min(Number(event.target.value), bounds[1] - 1), bounds[1]])} />
      <input type="range" className="range-boundary" min="0" max="1000" step="1" disabled={disabled} value={bounds[1]} aria-label="Правая граница диапазона" aria-valuetext={date(window.end)} onChange={event => onChange([bounds[0], Math.max(Number(event.target.value), bounds[0] + 1)])} />
    </div>
    <div className="range-dates"><span>{date(window.start)}</span><span>{date(window.end)}</span></div>
    <p className="range-help">{disabled ? 'Пока доступно одно время измерения.' : 'Двигайте края окна или перетаскивайте его целиком.'}</p>
  </div>;
}

function Chart({ records, overviewRecords, metric, period, zone, bounds, onRangeChange }) {
  if (!overviewRecords.length) return <Empty title="Здесь появится ваша динамика" text="Добавьте измерение или выберите другой период." />;
  const window = onRangeChange ? chartWindow(overviewRecords, zone, bounds) : null;
  const navigator = onRangeChange && <RangeNavigator records={overviewRecords} metric={metric} period={period} zone={zone} bounds={bounds} onChange={onRangeChange} />;
  return <ChartPlot records={records} metric={metric} period={period} zone={zone} window={window} navigator={navigator} />;
}

function ChartPlot({ records, metric, period, zone, window, navigator }) {
  const points = useMemo(() => chartData(records, metric, period, zone), [records, metric, period, zone]);
  const [selection, setSelection] = useState(null);
  if (!points.length) return <><div className="chart-empty" role="status">В этом диапазоне нет измерений. Раздвиньте границы окна.</div>{navigator}</>;
  const values = points.flatMap(p => p.lower == null ? [p.value] : [p.value, p.lower]);
  let low = Math.floor(Math.min(...values) - (metric === 'weight' ? .5 : 5));
  let high = Math.ceil(Math.max(...values) + (metric === 'weight' ? .5 : 5));
  if (high === low) high += 1;
  const W = 420, H = 185, left = 38, right = 12, top = 14, bottom = 28;
  const coordinates = points.map(point => localTimeCoordinate(point.at, zone));
  const start = window?.start ?? coordinates[0], end = window?.end ?? coordinates.at(-1);
  const x = i => start === end ? (W + left - right) / 2 : left + (coordinates[i] - start) / (end - start) * (W - left - right);
  const y = v => top + (high - v) / (high - low) * (H - top - bottom);
  const path = key => points.map((p, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(p[key])}`).join(' ');
  const found = points.findIndex(point => point.key === selection);
  const selectedIndex = found < 0 ? points.length - 1 : found;
  const selected = points[selectedIndex];
  const record = selected.record;
  const choose = index => setSelection(points[index].key);
  const indexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  return <div className="chart-wrap">
    <div className="chart-caption" aria-live="polite"><span>{formatDate(selected.at, zone, { year: 'numeric' })} · {formatTime(selected.at, zone)}</span><strong>{number(selected.value, metric === 'weight' ? 1 : 0)}{metric === 'bp' && ` / ${number(selected.lower)}`} <small>{METRICS[metric].unit}</small></strong></div>
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="group" tabIndex={0} aria-label={`График: ${METRICS[metric].label}, ${points.length} точек. Выбор стрелками влево и вправо или касанием графика.`}
      onClick={event => {
        const rect = event.currentTarget.getBoundingClientRect();
        const px = (event.clientX - rect.left) / rect.width * W;
        const py = (event.clientY - rect.top) / rect.height * H;
        const distance = i => Math.hypot(x(i) - px, Math.min(Math.abs(y(points[i].value) - py), metric === 'bp' ? Math.abs(y(points[i].lower) - py) : Infinity));
        let closest = 0; points.forEach((_, i) => { if (distance(i) < distance(closest)) closest = i; }); choose(closest);
      }}
      onKeyDown={event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault(); choose(event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 : Math.max(0, Math.min(points.length - 1, selectedIndex + (event.key === 'ArrowLeft' ? -1 : 1))));
      }}>
      {[0, 1, 2, 3].map(i => { const v = low + (high - low) * i / 3; return <g key={i}><line x1={left} x2={W - right} y1={y(v)} y2={y(v)} className="chart-grid" /><text x={left - 8} y={y(v) + 4} textAnchor="end" className="chart-label">{number(v, metric === 'weight' ? 1 : 0)}</text></g>; })}
      {points.length > 1 && <path d={`${path('value')} L ${x(points.length - 1)} ${H - bottom} L ${x(0)} ${H - bottom} Z`} className="chart-area" />}
      <path d={path('value')} className="chart-line" />
      {metric === 'bp' && <path d={path('lower')} className="chart-line lower" />}
      {points.map((p, i) => <g key={p.key}><circle cx={x(i)} cy={y(p.value)} r={3} className="chart-dot" />{metric === 'bp' && <circle cx={x(i)} cy={y(p.lower)} r={2.5} className="chart-dot lower" />}</g>)}
      <g className="chart-selection" aria-hidden="true">
        <line x1={x(selectedIndex)} x2={x(selectedIndex)} y1={top} y2={H - bottom} className="chart-cursor" />
        <circle cx={x(selectedIndex)} cy={y(selected.value)} r={7} className="chart-selected-dot" />
        {metric === 'bp' && <circle cx={x(selectedIndex)} cy={y(selected.lower)} r={7} className="chart-selected-dot lower" />}
      </g>
      {indexes.map(i => <text key={i} x={x(i)} y={H - 5} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} className="chart-label">{formatDate(points[i].at, zone, { day: 'numeric', month: 'numeric' })}</text>)}
    </svg>
    {metric === 'bp' && <div className="legend"><span><i />Верхнее</span><span><i className="lower" />Нижнее</span></div>}
    {navigator}
    <p className="chart-hint">Нажмите на точку, чтобы прочитать комментарий.</p>
    <div className="chart-navigation" role="group" aria-label="Выбор точки">
      <button type="button" onClick={() => choose(selectedIndex - 1)} disabled={selectedIndex === 0}>Раньше</button>
      <span>Замер {selectedIndex + 1} из {points.length}</span>
      <button type="button" onClick={() => choose(selectedIndex + 1)} disabled={selectedIndex === points.length - 1}>Позже</button>
    </div>
    <div className="chart-detail" aria-live="polite" aria-atomic="true">
      <>
        <h3>Выбранное измерение</h3>
        <p className="chart-detail-time">{formatDate(record.at, zone, { year: 'numeric' })} · {formatTime(record.at, zone)}</p>
        <p className="chart-detail-value">{record.kind === 'bp' ? `${record.systolic} / ${record.diastolic} мм рт. ст.${record.pulse != null ? ` · пульс ${record.pulse} уд/мин` : ''}` : `${number(record.weight, 1)} кг`}</p>
        <p className={`chart-comment${record.comment ? '' : ' muted'}`}>{record.comment || 'К этому измерению комментарий не добавлен.'}</p>
      </>
    </div>
  </div>;
}

function RecordRows({ records, zone, onEdit, limit }) {
  const list = limit ? sorted(records, zone).slice(0, limit) : sorted(records, zone);
  return <div className="record-list">{list.map(r => <button className="record-row" key={r.id} onClick={() => onEdit(r)}>
    <span className={`record-icon ${r.kind}`}><Icon as={METRICS[r.kind].icon} /></span>
    <span className="record-main"><strong>{r.kind === 'bp' ? `${r.systolic} / ${r.diastolic}` : number(r.weight, 1)} <small>{METRICS[r.kind].unit}</small></strong><span>{formatDate(r.at, zone)} · {formatTime(r.at, zone)}{r.seriesId ? ' · серия' : ''}</span>{r.comment && <span className="comment-preview">{r.comment}</span>}</span>
    {r.kind === 'bp' && r.pulse != null && <span className="row-pulse"><Icon as={Heart} size={13} />{r.pulse}</span>}<Icon as={ChevronRight} size={17} />
  </button>)}</div>;
}

function RecordForm({ kind, existing, seriesId, onSave, onDelete, onCancel }) {
  const [zone] = useState(deviceZone);
  const [initialAt] = useState(Date.now);
  const [fields, setFields] = useState(() => ({ systolic: existing?.systolic ?? '', diastolic: existing?.diastolic ?? '', pulse: existing?.pulse ?? '', weight: existing?.weight ?? '', at: formTime(existing?.at || initialAt, zone), comment: existing?.comment ?? '' }));
  const [error, setError] = useState(''); const [confirmDelete, setConfirmDelete] = useState(false); const errorRef = useRef(null);
  const update = key => e => { setFields(f => ({ ...f, [key]: e.target.value })); setError(''); };
  async function submit(e) {
    e.preventDefault(); let timing;
    try { timing = recordTiming({ localValue: fields.at, timeZone: zone, initialAt, existing }); } catch (err) { setError(err.message); requestAnimationFrame(() => errorRef.current?.focus()); return; }
    const parse = value => Number(String(value).replace(',', '.'));
    const record = { id: existing?.id || uid(), kind, ...timing, comment: fields.comment.trim(), ...(kind === 'bp' ? { systolic: parse(fields.systolic), diastolic: parse(fields.diastolic), pulse: fields.pulse === '' ? null : parse(fields.pulse), seriesId: existing?.seriesId || seriesId || null } : { weight: parse(fields.weight) }) };
    const result = await onSave(record);
    if (result) { setError(result); requestAnimationFrame(() => errorRef.current?.focus()); }
  }
  return <section className="page form-page"><div className="form-title"><h1>{existing ? 'Изменить запись' : kind === 'bp' ? (seriesId ? 'Повторное измерение' : 'Записать давление') : 'Записать вес'}</h1></div>
    <form onSubmit={submit}>
      {kind === 'bp' ? <>
        <div className="measurement-values">
          <Field id="systolic" label="Верхнее" placeholder="128" inputMode="numeric" required value={fields.systolic} onChange={update('systolic')} />
          <Field id="diastolic" label="Нижнее" placeholder="82" inputMode="numeric" required value={fields.diastolic} onChange={update('diastolic')} />
          <Field id="pulse" label="Пульс" placeholder="71" inputMode="numeric" value={fields.pulse} onChange={update('pulse')} />
        </div>
        <p className="measurement-units">Давление · мм рт. ст. <span>Пульс · уд/мин, необязательно</span></p>
      </> : <Field id="weight" label="Вес, кг" placeholder="76,4" inputMode="decimal" required value={fields.weight} onChange={update('weight')} />}

      <Field id="measurement-time" label="Местные дата и время" hint={`Время устройства · ${zone.replaceAll('_', ' ')}`} type="datetime-local" required value={fields.at} onChange={update('at')} />
      {existing?.timeZone && existing.timeZone !== zone && <p className="small-note">При измерении: {formatDate(existing.at, existing.timeZone)} в {formatTime(existing.at, existing.timeZone)} · {existing.timeZone.replaceAll('_', ' ')}.</p>}
      <div className="field"><label htmlFor="comment">Комментарий <span className="muted">· необязательно</span></label><textarea id="comment" rows={2} placeholder="Например, после прогулки" maxLength={300} value={fields.comment} onChange={update('comment')} /><small className="comment-count">{fields.comment.length}/300</small></div>
      {error && <div role="alert" tabIndex={-1} ref={errorRef} className="form-error">{error}</div>}
      <div className="record-actions"><Button className="primary-button" type="submit" size="l" stretched before={<Icon as={Check} />}>Сохранить</Button><button type="button" className="text-button" onClick={onCancel}>Отмена</button></div>
      {existing && <div className="delete-zone">{confirmDelete ? <><p>Удалить эту запись? Вернуть её будет нельзя.</p><div className="button-pair"><button type="button" className="text-button" onClick={() => setConfirmDelete(false)}>Оставить</button><button type="button" className="danger-button" onClick={async () => { const result = await onDelete(existing.id); if (result) setError(result); }}>Да, удалить</button></div></> : <button type="button" className="text-button danger" onClick={() => setConfirmDelete(true)}><Icon as={Trash2} size={17} />Удалить запись</button>}</div>}
    </form>
  </section>;
}

function ProfileForm({ state, onSave, onSchedulesChange, onImport, cloud, focusReminders, onExport, onTheme, theme }) {
  const [profile, setProfile] = useState({ ...state.profile });
  const [panel, setPanel] = useState(focusReminders ? 'alarms' : 'about');
  const headingRef = useRef(null);
  useEffect(() => { if (focusReminders) { setPanel('alarms'); requestAnimationFrame(() => headingRef.current?.focus()); } }, [focusReminders]);
  const [schedules, setSchedules] = useState(structuredClone(state.schedules));
  const [editingAlarm, setEditingAlarm] = useState(false);
  const [canMessage, setCanMessage] = useState(cloud?.canMessage);
  const [notice, setNotice] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const errorRef = useRef(null);
  const update = key => e => { setProfile(p => ({ ...p, [key]: e.target.value })); setError(''); };
  async function changeSchedules(next) {
    const failure = await onSchedulesChange(next);
    if (!failure) setSchedules(next);
    return failure;
  }
  async function submit(event) {
    event.preventDefault(); if (busy) return;
    let message = validateProfile(profile, schedules);
    const height = profile.height === '' ? '' : Number(String(profile.height).replace(',', '.'));
    if (!message) {
      setBusy(true);
      try { message = await onSave({ ...profile, height, theme }, schedules, null) || ''; }
      finally { setBusy(false); }
    }
    if (message) { setError(message); requestAnimationFrame(() => errorRef.current?.focus()); }
    else setNotice('Настройки сохранены.');
  }
  const zones = [...new Set([state.profile.timezone, deviceZone(), 'Europe/Moscow', 'UTC'])];
  return <section className="page profile-page compact-inputs">
    <div className="page-title"><h1 ref={headingRef} tabIndex={-1}>{editingAlarm ? 'Напоминание' : 'Профиль'}</h1></div>
    {!editingAlarm && <Choice value={panel} options={[["about", "О вас"], ["alarms", "Напоминания"], ["more", "Ещё"]]} label="Раздел профиля" onChange={value => { setPanel(value); setError(''); setNotice(''); }} />}
    {panel === 'about' && <form onSubmit={submit} className="profile-panel">
      <p className="small-note">Все поля необязательны.</p>
      <Field id="birth-date" label="Дата рождения" type="date" value={profile.birthDate} max={dayKey(Date.now(), validZone(profile.timezone) ? profile.timezone : state.profile.timezone)} min="1900-01-01" onChange={update('birthDate')} />
      <div className="two-fields"><SelectField id="sex" label="Пол" value={profile.sex} onChange={update('sex')}><option value="">Не указан</option><option value="female">Женский</option><option value="male">Мужской</option><option value="unspecified">Не указывать</option></SelectField><Field id="height" label="Рост, см" inputMode="decimal" placeholder="178" value={profile.height} onChange={update('height')} /></div>
      <details className="profile-timezone"><summary>Часовой пояс: {profile.timezone.replaceAll('_', ' ')}<Icon as={ChevronRight} size={16} /></summary>
      <div className="field"><label htmlFor="timezone">Часовой пояс напоминаний</label><input className="native-input" id="timezone" list="timezones" value={profile.timezone} onChange={update('timezone')} required spellCheck={false} /><datalist id="timezones">{zones.map(zone => <option key={zone} value={zone} />)}</datalist><small>Время записей определяется вашим устройством.</small></div>
      </details>
      {error && <div className="form-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</div>}
      <div className="record-actions profile-actions"><Button size="l" stretched className="primary-button" type="submit" disabled={busy} before={<Icon as={Check} />}>{busy ? 'Сохраняем…' : 'Сохранить'}</Button></div>
    </form>}
    {panel === 'alarms' && <div className="profile-panel alarms-section">
      {!editingAlarm && <p className="small-note">Выберите время и дни. Изменения сохраняются сразу.</p>}
      <AlarmSettings schedules={schedules} onChange={changeSchedules} onEditingChange={setEditingAlarm} />
      {!editingAlarm && <><p className="small-note reminder-foot">{cloud ? 'Сообщения приходят от @bpjournalbot, даже когда дневник закрыт.' : import.meta.env.PROD ? 'В демо сообщения не отправляются.' : 'Локальный режим: напоминания видны, пока сайт открыт.'}</p>{cloud && !canMessage && <button type="button" className="text-button" onClick={async () => { const allowed = await cloud.requestMessages(); setCanMessage(allowed); setNotice(allowed ? 'Сообщения от бота разрешены.' : 'Откройте @bpjournalbot и нажмите «Начать».'); }}>Разрешить сообщения от бота</button>}</>}
    </div>}
    {panel === 'more' && <div className="profile-panel">
      <section className="theme-panel"><h2>Оформление</h2><div className="theme-options">{[['system', 'Система', Monitor], ['dark', 'Тёмная', Moon], ['light', 'Светлая', Sun]].map(([value, label, icon]) => <button type="button" key={value} aria-pressed={theme === value} className={theme === value ? 'selected' : ''} onClick={() => onTheme(value)}><Icon as={icon} /><span>{label}</span></button>)}</div></section>
      <section className="profile-section"><h2>Ваши данные</h2><button className="settings-row" onClick={onExport}><Icon as={ArrowDownToLine} /><span>Скачать копию дневника<small>Все записи и настройки в JSON</small></span><Icon as={ChevronRight} size={17} /></button>
        {cloud && <div className="field"><label htmlFor="import-diary">Перенести записи из JSON-копии</label><input id="import-diary" className="native-input" type="file" accept="application/json,.json" onChange={async event => {
          const input = event.currentTarget, file = input.files?.[0]; if (!file) return;
          try { if (file.size > 4 * 1024 * 1024) throw new Error('Файл больше 4 МБ.'); const message = await onImport(validateState(JSON.parse(await file.text()))); if (message) throw new Error(message); setNotice('Записи из копии добавлены.'); } catch (error) { setError(error.message); } finally { input.value = ''; }
        }} /><small>Добавятся новые измерения; настройки не заменяются.</small></div>}
        <p className="small-note">{cloud ? 'Дневник хранится на сервере и привязан к Telegram-аккаунту.' : 'Дневник хранится в этом браузере. Очистка данных сайта удалит записи.'}</p>
      </section>{error && <div className="form-error" role="alert">{error}</div>}
    </div>}
    {notice && <p className="small-note" role="status">{notice}</p>}
  </section>;
}

export default function App({ cloud = null, previewOnly = false }) {
  const [initial] = useState(() => cloud ? { data: cloud.state, error: '' } : previewOnly ? { data: null, error: '' } : readInitial());
  const [data, setData] = useState(() => initial.data || makeDemo());
  const [demo, setDemo] = useState(!initial.data);
  const [view, setView] = useState(cloud?.isNew ? 'onboarding' : 'today');
  const [focusReminders, setFocusReminders] = useState(false);
  function openReminders() { setFocusReminders(true); setView('profile'); }
  const [theme, setTheme] = useState(() => readTheme(initial.data?.profile.theme || 'dark'));
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [metric, setMetric] = useState('bp'); const [period, setPeriod] = useState('7');
  const [rangeSelection, setRangeSelection] = useState(null);
  const [form, setForm] = useState(() => { const q = new URLSearchParams(location.search); return cloud && !cloud.isNew && ['bp','weight'].includes(q.get('record')) ? { kind: q.get('record'), reminderKey: q.get('reminder') || undefined } : null; }); const [toast, setToast] = useState(''); const [error, setError] = useState(initial.error);
  const saving = useRef(false);
  const [savedRecord, setSavedRecord] = useState(null); const [clock, setClock] = useState(Date.now());
  const appearance = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
  const zone = deviceZone();
  useEffect(() => { const m = matchMedia('(prefers-color-scheme: dark)'); const update = e => setSystemDark(e.matches); m.addEventListener('change', update); return () => m.removeEventListener('change', update); }, []);
  useEffect(() => { document.documentElement.dataset.theme = appearance; document.documentElement.style.colorScheme = appearance; document.querySelector('meta[name="theme-color"]').content = appearance === 'dark' ? '#101719' : '#f3f7f6'; }, [appearance]);
  useEffect(() => { const id = setInterval(() => setClock(Date.now()), 30000); return () => clearInterval(id); }, []);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 4500); return () => clearTimeout(id); }, [toast]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [view, form]);
  useEffect(() => { if (cloud) return; const onStorage = e => { if (e.key !== STORAGE_KEY || demo) return; const result = readInitial(); if (result.data) { setData(result.data); setToast('Дневник обновлён в другой вкладке'); } else setError(result.error || 'Данные удалены в другой вкладке. Перезагрузите страницу.'); }; window.addEventListener('storage', onStorage); return () => window.removeEventListener('storage', onStorage); }, [demo]);
  async function commit(next, forceReal = false) {
    if (cloud) {
      if (saving.current) return 'Дождитесь завершения сохранения.';
      saving.current = true;
      try { await cloud.save(next); setData(next); setError(''); return ''; }
      catch (e) { setError(e.message); return e.message; }
      finally { saving.current = false; }
    }
    if (!demo || forceReal) {
      if (initial.error) return initial.error;
      let result; try { result = saveState(localStorage, next); } catch { result = 'Хранилище браузера недоступно. Изменения не сохранены.'; }
      if (result) { setError(result); return result; }
    }
    setData(next); setError(''); return '';
  }
  function changeTheme(value) { setTheme(value); try { localStorage.setItem('healthnote.theme', value); } catch { setError('Тема применена, но браузер не разрешил сохранить выбор.'); } }
  function openRecord(kind, existing = null, extra = {}) { setSavedRecord(null); setForm({ kind, existing, ...extra }); }
  async function saveRecord(record) {
    const validation = validateRecord(record);
    if (validation) return validation;
    const next = { ...data, records: [...data.records.filter(r => r.id !== record.id), record] };
    if (form.seriesSource) next.records = next.records.map(r => r.id === form.seriesSource ? { ...r, seriesId: record.seriesId, updatedAt: record.updatedAt } : r);
    if (form.reminderKey) next.reminderActions = { ...data.reminderActions, [form.reminderKey]: 'done' };
    const failure = await commit(next); if (failure) return failure;
    setSavedRecord(record); setForm(null); setToast(demo ? 'Пример записи добавлен' : 'Измерение сохранено'); setClock(Date.now()); return '';
  }
  async function deleteRecord(id) { const failure = await commit({ ...data, records: data.records.filter(r => r.id !== id) }); if (failure) return failure; setForm(null); setToast('Запись удалена'); return ''; }
  async function saveProfile(profile, schedules, weight) {
    const onboarding = view === 'onboarding';
    const next = onboarding ? emptyState(theme) : { ...data };
    next.profile = profile; next.schedules = schedules;
    if (weight != null) {
      const timing = timeMetadata(Date.now());
      next.records = [...next.records, { id: uid(), kind: 'weight', weight, ...timing, createdAt: timing.at, updatedAt: timing.at, comment: '' }];
    }
    const failure = await commit(next, onboarding); if (failure) return failure;
    if (onboarding) { setDemo(false); setView('today'); setSavedRecord(null); }
    setToast(onboarding ? 'Ваш дневник готов к первой записи' : 'Настройки сохранены'); return '';
  }
  function saveSchedules(schedules) { return commit({ ...data, schedules }); }
  async function reminderAction(tasks, action) { if (!await commit({ ...data, reminderActions: { ...data.reminderActions, ...Object.fromEntries(tasks.map(task => [task.key, action])) } })) setToast(action === 'skip' ? 'Измерение пропущено' : 'Отложено на 30 минут'); }
  async function importData(imported) {
    const known = new Set(data.records.map(r => r.id));
    return commit({ ...data, records: [...data.records, ...imported.records.filter(r => !known.has(r.id))] });
  }
  useEffect(() => {
    const tg = cloud?.telegram; if (!tg) return;
    const back = () => { if (form) setForm(null); else setView('today'); };
    if (form || ['history','profile'].includes(view)) tg.BackButton.show(); else tg.BackButton.hide();
    tg.BackButton.onClick(back); return () => tg.BackButton.offClick(back);
  }, [cloud, form, view]);
  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `healthnote-${dayKey(Date.now(), zone)}${demo ? '-demo' : ''}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 500); setToast('Копия дневника подготовлена');
  }
  const latest = sorted(data.records, zone);
  // Latest measurement means the actual latest instant, even when clocks move back.
  const byInstant = [...data.records].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const weight = byInstant.find(r => r.kind === 'weight');
  const week = sevenDaySummary(data.records, zone, clock);
  const rangeContext = `${metric}-${period}-${zone}`;
  const bounds = view === 'history' && rangeSelection?.context === rangeContext ? rangeSelection.bounds : [0, 1000];
  const overviewRecords = useMemo(() => selectRecords(data.records, metric, period, zone, clock), [data.records, metric, period, zone, clock]);
  const chartRecords = view === 'history' ? chartWindow(overviewRecords, zone, bounds).records : overviewRecords;
  const summary = stats(chartRecords, metric);
  const due = reminders(data, clock);
  const todayCount = data.records.filter(r => dayKey(r.at, zone) === dayKey(clock, zone)).length;
  const series = savedRecord?.seriesId ? seriesMean(data.records, savedRecord.seriesId) : null;
  const activeView = form ? 'form' : view;
  return <AppRoot appearance={appearance} platform="ios" className={`healthnote ${appearance}`}>
    <div className={`app-shell${form || view === 'onboarding' || view === 'profile' ? ' has-record-form' : ''}`}><header className="app-header"><button className="brand" aria-label="Healthnote — на главную" onClick={() => { if (view === 'onboarding') return; setForm(null); setView('today'); }}><span className="brand-mark"><Icon as={Activity} size={23} /></span><span>healthnote<span className="brand-dot">.</span></span></button>{view === 'onboarding' ? null : activeView === 'form' ? <button className="icon-button" aria-label="Закрыть" onClick={() => { setForm(null); setView('today'); }}><Icon as={X} /></button> : <button className="icon-button" aria-label="Изменить тему" title="Изменить тему" onClick={() => changeTheme(appearance === 'dark' ? 'light' : 'dark')}><Icon as={appearance === 'dark' ? Sun : Moon} /></button>}</header>
      {demo && view !== 'onboarding' && <div className="demo-banner"><span><span className="status-dot" />Демо · вымышленные данные</span>{!previewOnly && <button onClick={() => { setForm(null); setView('onboarding'); }}>Начать свой<Icon as={ArrowRight} size={14} /></button>}</div>}
      {error && <div role="alert" className="persistent-error"><Icon as={Info} /><span>{error}</span></div>}
      <main id="main-content">
        {form ? <RecordForm key={form.existing?.id || `${form.kind}-${form.seriesId || 'new'}`} kind={form.kind} existing={form.existing} seriesId={form.seriesId} onSave={saveRecord} onDelete={deleteRecord} onCancel={() => setForm(null)} /> : view === 'onboarding' ? <WelcomeForm profile={emptyState(theme).profile} cloud={cloud} onSave={saveProfile} /> : view === 'profile' ? <ProfileForm key={`profile-${demo}`} state={data} onSave={saveProfile} onSchedulesChange={saveSchedules} onImport={importData} cloud={cloud} focusReminders={focusReminders} onExport={exportData} onTheme={changeTheme} theme={theme} /> : <div className="page">
          <div className="page-title"><div><h1>{view === 'today' ? 'Сегодня' : 'История'}</h1><p>{view === 'today' ? formatDate(clock, zone, { weekday: 'long', day: 'numeric', month: 'long' }) : 'Каждое измерение — часть картины.'}</p></div>{view === 'today' && <span className="day-count"><Check size={14} aria-hidden="true" />{todayCount ? `${todayCount} ${todayCount === 1 ? 'запись' : todayCount < 5 ? 'записи' : 'записей'}` : 'Новый день'}</span>}</div>
          {savedRecord?.kind === 'bp' && <div className="series-notice"><div><Icon as={Check} /><span>{series?.count > 1 ? `Среднее серии: ${number(series.avg)} / ${number(series.lower)} · ${series.count} замера` : 'Измерение записано'}</span><button className="icon-button" aria-label="Закрыть предложение повтора" onClick={() => setSavedRecord(null)}><Icon as={X} size={16} /></button></div><button className="text-button" onClick={() => openRecord('bp', null, { seriesId: savedRecord.seriesId || uid(), seriesSource: savedRecord.id })}><Icon as={Repeat2} size={16} />Добавить повторный замер</button></div>}
          {view === 'today' && <><section className="measurements" aria-label="Средние значения за последние 7 дней">
            <div className="pressure-summary">
              <div className="summary-label"><span><Icon as={Activity} size={18} />Среднее давление</span><span className="time-label">За 7 дней</span></div>
              <div className="pressure-value">{week.bp.count ? <>{number(week.bp.avg)}<span>/</span>{number(week.bp.lower)}</> : <span className="no-value">— / —</span>}</div>
              <div className="pressure-bottom"><span>мм рт. ст.</span><span>{summaryCoverage(week.bp)}</span></div>
            </div>
            <div className="secondary-measurements">
              <div><span className="summary-label"><Icon as={Heart} size={17} />Средний пульс</span><strong>{number(week.pulse.avg)} <small>уд/мин</small></strong><span className="time-label">{summaryCoverage(week.pulse)}</span></div>
              <div><span className="summary-label"><Icon as={Scale} size={17} />Средний вес</span><strong>{number(week.weight.avg, 1)} <small>кг</small></strong><span className="time-label">{summaryCoverage(week.weight)}</span></div>
            </div>
          </section>
            <div className="quick-actions"><Button size="l" className="primary-button" before={<Icon as={Plus} size={19} />} onClick={() => openRecord('bp')}>Давление</Button><Button size="l" className="secondary-button" before={<Icon as={Plus} size={19} />} onClick={() => openRecord('weight')}>Вес</Button></div>
            {!data.schedules.some(s => s.enabled) && <button className="reminder-setup-link" onClick={openReminders}><Icon as={Bell} size={17} /><span>{data.schedules.length ? 'Напоминания выключены — настроить' : 'Настроить напоминания об измерениях'}</span><Icon as={ChevronRight} size={16} /></button>}
          </>}
          <section className="trends-section"><div className="section-heading"><h2>{view === 'today' ? 'Ваша динамика' : 'Обзор измерений'}</h2>{view === 'today' && <button className="text-button" onClick={() => setView('history')}>Все записи<Icon as={ChevronRight} size={15} /></button>}</div><Choice value={metric} options={Object.entries(METRICS).map(([k, v]) => [k, v.label])} onChange={value => { setMetric(value); setRangeSelection(null); }} label="Показатель" /><div className="periods" role="group" aria-label="Период">{PERIODS.map(([key, label]) => <button key={key} aria-pressed={period === key} className={period === key ? 'selected' : ''} onClick={() => { setPeriod(key); setRangeSelection(null); }}>{label}</button>)}</div><Chart key={`${view}-${rangeContext}`} records={chartRecords} overviewRecords={overviewRecords} metric={metric} period={period} zone={zone} bounds={bounds} onRangeChange={view === 'history' ? bounds => setRangeSelection({ context: rangeContext, bounds }) : null} />
            <div className="statistics"><div><span>Среднее</span><strong>{number(summary.avg, metric === 'weight' ? 1 : 0)}{metric === 'bp' && <small> / {number(summary.lower)}</small>}</strong></div><div><span>Минимум{metric === 'bp' ? ' верх.' : ''}</span><strong>{number(summary.min, metric === 'weight' ? 1 : 0)}</strong></div><div><span>Максимум{metric === 'bp' ? ' верх.' : ''}</span><strong>{number(summary.max, metric === 'weight' ? 1 : 0)}</strong></div></div>
            {metric === 'weight' && weight && data.profile.height && <p className="bmi-note">Индекс массы тела: <strong>{number(bmi(weight.weight, data.profile.height), 1)}</strong> · по последнему весу и росту {data.profile.height} см</p>}
          </section>
          {view === 'history' ? <section><div className="section-heading"><h2>Записи <span className="count">{chartRecords.length}</span></h2><button className="text-button" onClick={() => openRecord(metric === 'weight' ? 'weight' : 'bp')}><Icon as={Plus} size={16} />Добавить</button></div>{chartRecords.length ? <RecordRows records={chartRecords} zone={zone} onEdit={r => openRecord(r.kind, r)} /> : <Empty title="За этот период записей нет" text="Выберите другой период или добавьте измерение." />}</section> : <>
            {data.schedules.some(s => s.enabled) && <section className="reminders-section"><div className="section-heading"><h2>Напоминания</h2><button className="icon-button" aria-label="Настроить напоминания" onClick={openReminders}><Icon as={SlidersHorizontal} size={18} /></button></div>
              {due.slice(0, 2).map(r => <div className="reminder" key={r.key}><div className="reminder-head"><span className="reminder-icon"><Icon as={Bell} size={19} /></span><div><strong>{r.tasks.length > 1 ? 'Давление и вес' : METRICS[r.tasks[0].kind].label}</strong><span>{dayKey(r.at, zone) === dayKey(clock, zone) ? 'Сегодня' : formatDate(r.at, zone)} в {formatTime(r.at, zone)}</span></div></div>
                <div className="reminder-measurements">{r.tasks.map(task => <button key={task.key} className="reminder-record" onClick={() => openRecord(task.kind, null, { reminderKey: task.key })}><Icon as={Plus} size={15} />{METRICS[task.kind].label}</button>)}</div>
                {r.overdue && <div className="reminder-options"><button onClick={() => reminderAction(r.tasks, Date.now() + 30 * 60000)}><Icon as={Clock3} size={13} />Через 30 мин</button><button onClick={() => reminderAction(r.tasks, 'skip')}>Пропустить</button></div>}
              </div>)}<p className="small-note reminder-foot"><Icon as={Bell} size={13} />{cloud ? 'Напоминания приходят от @bpjournalbot.' : previewOnly ? 'Демо: сообщения не отправляются.' : 'Напоминания здесь, пока сайт открыт.'}</p></section>}

            <section><div className="section-heading"><h2>Последние записи</h2><button className="text-button" onClick={() => setView('history')}><Icon as={ArrowRight} size={19} /><span className="sr-only">Открыть всю историю</span></button></div>{latest.length ? <RecordRows records={latest} zone={zone} limit={3} onEdit={r => openRecord(r.kind, r)} /> : <Empty title="Начните с одного измерения" text="Давление или вес — выбирайте, что записать сегодня." />}</section>
          </>}
          <footer className="page-footer"><Icon as={ShieldCheck} size={14} /><span>{demo ? 'Пример дневника · можно пробовать все функции' : cloud ? 'Ваш дневник сохранён в Telegram-аккаунте' : 'Ваши записи остаются в этом браузере'}</span></footer>
        </div>}
      </main>
      {!form && view !== 'onboarding' && <nav className="bottom-nav" aria-label="Основная навигация">{[['today', 'Сегодня', Home], ['history', 'История', History], ['profile', 'Профиль', UserRound]].map(([key, title, icon]) => <button key={key} aria-current={view === key ? 'page' : undefined} className={view === key ? 'active' : ''} onClick={() => { setFocusReminders(false); setView(key); setSavedRecord(null); }}><Icon as={icon} /><span>{title}</span></button>)}</nav>}
    </div><div className="toast" role="status" aria-live="polite" data-visible={Boolean(toast)}>{toast && <><Icon as={Check} size={17} />{toast}</>}</div>
  </AppRoot>;
}
