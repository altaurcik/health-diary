import React, { useEffect, useRef, useState } from 'react';
import { AppRoot, Button, Input } from '@telegram-apps/telegram-ui';
import { Activity, ArrowDownToLine, ArrowRight, Bell, Check, ChevronRight, Clock3, Heart, History, Home, Info, Moon, Plus, Scale, ShieldCheck, SlidersHorizontal, Sun, Trash2, UserRound, X, Monitor, Repeat2 } from 'lucide-react';
import { STORAGE_KEY, PERIODS, uid, number, dayKey, formTime, formatDate, formatTime, emptyState, loadState, saveState, sorted, selectRecords, stats, chartData, seriesMean, bmi, reminders, makeDemo, validZone, validateRecord, validateProfile, deviceZone, timeMetadata, recordTiming, localTimeCoordinate } from './data.js';

const METRICS = { bp: { label: 'Давление', unit: 'мм рт. ст.', icon: Activity }, pulse: { label: 'Пульс', unit: 'уд/мин', icon: Heart }, weight: { label: 'Вес', unit: 'кг', icon: Scale } };
const DAYS = [[1, 'Пн'], [2, 'Вт'], [3, 'Ср'], [4, 'Чт'], [5, 'Пт'], [6, 'Сб'], [0, 'Вс']];
function readInitial() { try { return loadState(window.localStorage); } catch { return { data: null, error: 'Хранилище браузера недоступно. Личные записи пока нельзя сохранить.' }; } }
function readTheme(fallback) { try { const value = localStorage.getItem('healthnote.theme'); return ['light', 'dark', 'system'].includes(value) ? value : fallback; } catch { return fallback; } }
function Icon({ as: Component, ...props }) { return <Component size={21} strokeWidth={1.8} aria-hidden="true" {...props} />; }
function Field({ label, hint, id, ...props }) { return <div className="field"><label htmlFor={id}>{label}</label><Input id={id} className="diary-input" aria-describedby={hint ? `${id}-hint` : undefined} {...props} />{hint && <small id={`${id}-hint`}>{hint}</small>}</div>; }
function SelectField({ label, id, children, ...props }) { return <div className="field"><label htmlFor={id}>{label}</label><select id={id} {...props}>{children}</select></div>; }
function Choice({ value, options, onChange, label }) { return <div className="segmented" role="group" aria-label={label}>{options.map(([key, title]) => <button key={key} type="button" aria-pressed={value === key} className={value === key ? 'selected' : ''} onClick={() => onChange(key)}>{title}</button>)}</div>; }
function Empty({ title, text, action }) { return <div className="empty"><span className="empty-icon"><Icon as={Activity} size={28} /></span><h3>{title}</h3><p>{text}</p>{action}</div>; }

function Chart({ records, metric, period, zone }) {
  const points = chartData(records, metric, period, zone);
  const [selection, setSelection] = useState(null);
  useEffect(() => setSelection(null), [records, metric, period]);
  if (!points.length) return <Empty title="Здесь появится ваша динамика" text="Добавьте измерение, чтобы начать историю." />;
  const values = points.flatMap(p => p.lower == null ? [p.value] : [p.value, p.lower]);
  let low = Math.floor(Math.min(...values) - (metric === 'weight' ? .5 : 5));
  let high = Math.ceil(Math.max(...values) + (metric === 'weight' ? .5 : 5));
  if (high === low) high += 1;
  const W = 420, H = 185, left = 38, right = 12, top = 14, bottom = 28;
  const coordinates = points.map(point => localTimeCoordinate(point.at, zone));
  const start = coordinates[0], end = coordinates.at(-1);
  const x = i => start === end ? (W + left - right) / 2 : left + (coordinates[i] - start) / (end - start) * (W - left - right);
  const y = v => top + (high - v) / (high - low) * (H - top - bottom);
  const path = key => points.map((p, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(p[key])}`).join(' ');
  const selected = selection == null ? points.at(-1) : points[selection];
  const indexes = [...new Set([0, Math.floor((points.length - 1) / 2), points.length - 1])];
  return <div className="chart-wrap">
    <div className="chart-caption" aria-live="polite"><span>{formatDate(selected.at, zone)}{selected.aggregate ? ` · среднее за ${selected.aggregate}` : ` · ${formatTime(selected.at, zone)}`}</span><strong>{number(selected.value, metric === 'weight' ? 1 : 0)}{metric === 'bp' && ` / ${number(selected.lower)}`} <small>{METRICS[metric].unit}</small></strong></div>
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="group" tabIndex={0} aria-label={`График: ${METRICS[metric].label}, ${points.length} точек. Выбор стрелками влево и вправо или касанием графика.`}
      onPointerDown={event => { const rect = event.currentTarget.getBoundingClientRect(); const px = (event.clientX - rect.left) / rect.width * W; let closest = 0; points.forEach((_, i) => { if (Math.abs(x(i) - px) < Math.abs(x(closest) - px)) closest = i; }); setSelection(closest); }}
      onKeyDown={event => { if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return; event.preventDefault(); const current = selection ?? points.length - 1; setSelection(event.key === 'Home' ? 0 : event.key === 'End' ? points.length - 1 : Math.max(0, Math.min(points.length - 1, current + (event.key === 'ArrowLeft' ? -1 : 1)))); }}>
      {[0, 1, 2, 3].map(i => { const v = low + (high - low) * i / 3; return <g key={i}><line x1={left} x2={W - right} y1={y(v)} y2={y(v)} className="chart-grid" /><text x={left - 8} y={y(v) + 4} textAnchor="end" className="chart-label">{number(v, metric === 'weight' ? 1 : 0)}</text></g>; })}
      {points.length > 1 && <path d={`${path('value')} L ${x(points.length - 1)} ${H - bottom} L ${x(0)} ${H - bottom} Z`} className="chart-area" />}
      <path d={path('value')} className="chart-line" />
      {metric === 'bp' && <path d={path('lower')} className="chart-line lower" />}
      {points.map((p, i) => <g key={`${p.at}-${i}`}><circle cx={x(i)} cy={y(p.value)} r={selection === i ? 5 : 3} className="chart-dot" />{metric === 'bp' && <circle cx={x(i)} cy={y(p.lower)} r={2.5} className="chart-dot lower" />}</g>)}
      {indexes.map(i => <text key={i} x={x(i)} y={H - 5} textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'} className="chart-label">{formatDate(points[i].at, zone, { day: 'numeric', month: 'numeric' })}</text>)}
    </svg>
    {metric === 'bp' && <div className="legend"><span><i />Верхнее</span><span><i className="lower" />Нижнее</span></div>}
    {points.some(p => p.aggregate) && <p className="small-note">На графике — средние по {points[0].aggregate === 'неделя' ? 'неделям' : 'дням'}.</p>}
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
  function submit(e) {
    e.preventDefault(); let timing;
    try { timing = recordTiming({ localValue: fields.at, timeZone: zone, initialAt, existing }); } catch (err) { setError(err.message); requestAnimationFrame(() => errorRef.current?.focus()); return; }
    const parse = value => Number(String(value).replace(',', '.'));
    const record = { id: existing?.id || uid(), kind, ...timing, comment: fields.comment.trim(), ...(kind === 'bp' ? { systolic: parse(fields.systolic), diastolic: parse(fields.diastolic), pulse: fields.pulse === '' ? null : parse(fields.pulse), seriesId: existing?.seriesId || seriesId || null } : { weight: parse(fields.weight) }) };
    const result = onSave(record);
    if (result) { setError(result); requestAnimationFrame(() => errorRef.current?.focus()); }
  }
  return <section className="page form-page"><div className="form-title"><span className={`large-icon ${kind}`}><Icon as={METRICS[kind].icon} size={27} /></span><h1>{existing ? 'Изменить запись' : kind === 'bp' ? (seriesId ? 'Повторное измерение' : 'Записать давление') : 'Записать вес'}</h1><p>{kind === 'bp' ? 'Показания вашего тонометра' : 'Небольшой шаг к полной картине'}</p></div>
    <form onSubmit={submit}>
      {kind === 'bp' ? <><div className="pressure-inputs"><Field id="systolic" label="Верхнее" placeholder="128" inputMode="numeric" required value={fields.systolic} onChange={update('systolic')} /><span className="input-slash">/</span><Field id="diastolic" label="Нижнее" placeholder="82" inputMode="numeric" required value={fields.diastolic} onChange={update('diastolic')} /></div><p className="unit-caption">мм рт. ст.</p><Field id="pulse" label="Пульс" hint="Необязательно · уд/мин" placeholder="71" inputMode="numeric" value={fields.pulse} onChange={update('pulse')} /></> : <Field id="weight" label="Вес, кг" placeholder="76,4" inputMode="decimal" required value={fields.weight} onChange={update('weight')} />}
      <Field id="measurement-time" label="Местные дата и время" hint={`Время устройства · ${zone.replaceAll('_', ' ')}`} type="datetime-local" required value={fields.at} onChange={update('at')} />
      {existing?.timeZone && existing.timeZone !== zone && <p className="small-note">При измерении: {formatDate(existing.at, existing.timeZone)} в {formatTime(existing.at, existing.timeZone)} · {existing.timeZone.replaceAll('_', ' ')}.</p>}
      <div className="field"><label htmlFor="comment">Комментарий <span className="muted">· необязательно</span></label><textarea id="comment" rows={3} placeholder="Например, после прогулки" maxLength={300} value={fields.comment} onChange={update('comment')} /><small>{fields.comment.length}/300</small></div>
      {error && <div role="alert" tabIndex={-1} ref={errorRef} className="form-error">{error}</div>}
      <Button className="primary-button" type="submit" size="l" stretched before={<Icon as={Check} />}>Сохранить измерение</Button>
      {existing && <div className="delete-zone">{confirmDelete ? <><p>Удалить эту запись? Вернуть её будет нельзя.</p><div className="button-pair"><button type="button" className="text-button" onClick={() => setConfirmDelete(false)}>Оставить</button><button type="button" className="danger-button" onClick={() => { const result = onDelete(existing.id); if (result) setError(result); }}>Да, удалить</button></div></> : <button type="button" className="text-button danger" onClick={() => setConfirmDelete(true)}><Icon as={Trash2} size={17} />Удалить запись</button>}</div>}
      <button type="button" className="text-button full" onClick={onCancel}>Отмена</button>
    </form>
  </section>;
}

function ScheduleFields({ kind, value, onChange }) {
  const patch = v => onChange({ ...value, ...v });
  return <div className="schedule-fields"><div className="section-heading"><h3><Icon as={METRICS[kind].icon} />{METRICS[kind].label}</h3><label className="switch"><input aria-label={`Расписание: ${METRICS[kind].label}`} type="checkbox" checked={value.enabled} onChange={e => patch({ enabled: e.target.checked })} /><span /></label></div>
    {value.enabled && <><SelectField id={`frequency-${kind}`} label="Повторять" value={value.frequency} onChange={e => patch({ frequency: e.target.value })}><option value="daily">Каждый день</option><option value="weekly">По дням недели</option><option value="monthly">Раз в месяц</option></SelectField>
      {value.frequency === 'weekly' && <div className="days" role="group" aria-label={`Дни: ${METRICS[kind].label}`}>{DAYS.map(([n, label]) => <button type="button" key={n} className={value.days.includes(n) ? 'selected' : ''} aria-pressed={value.days.includes(n)} onClick={() => patch({ days: value.days.includes(n) ? value.days.filter(d => d !== n) : [...value.days, n] })}>{label}</button>)}</div>}
      {value.frequency === 'monthly' && <SelectField id={`monthday-${kind}`} label="День месяца" value={value.monthDay} onChange={e => patch({ monthDay: Number(e.target.value) })}>{Array.from({ length: 28 }, (_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}</SelectField>}
      <div className="time-fields">{value.times.map((time, i) => <Field key={i} id={`${kind}-time-${i}`} label={i === 0 ? 'Время' : 'Второе измерение'} type="time" required value={time} onChange={e => patch({ times: value.times.map((t, j) => j === i ? e.target.value : t) })} />)}</div>
      {kind === 'bp' && <button className="text-button" type="button" onClick={() => patch({ times: value.times.length > 1 ? [value.times[0]] : [value.times[0], '20:00'] })}>{value.times.length > 1 ? 'Оставить одно измерение в день' : '+ Второе измерение в день'}</button>}
    </>}
  </div>;
}

function ProfileForm({ state, onboarding, onSave, onCancel, onExport, onTheme, theme }) {
  const [profile, setProfile] = useState({ ...state.profile });
  const [weight, setWeight] = useState('');
  const [schedules, setSchedules] = useState(structuredClone(state.schedules));
  const [error, setError] = useState(''); const errorRef = useRef(null);
  const update = key => e => setProfile(p => ({ ...p, [key]: e.target.value }));
  const zoneOptions = [...new Set([state.profile.timezone, 'Europe/Moscow', 'Europe/Kaliningrad', 'Europe/Samara', 'Asia/Yekaterinburg', 'Asia/Novosibirsk', 'Asia/Irkutsk', 'Asia/Vladivostok', 'Europe/Berlin', 'Asia/Tbilisi', 'Asia/Dubai', 'UTC'])];
  function submit(e) {
    e.preventDefault(); let message = validateProfile(profile, schedules);
    const height = profile.height === '' ? '' : Number(String(profile.height).replace(',', '.'));
    const parsedWeight = weight === '' ? null : Number(weight.replace(',', '.'));
    if (parsedWeight != null && (!Number.isFinite(parsedWeight) || parsedWeight < 10 || parsedWeight > 500)) message = 'Вес: число от 10 до 500 кг.';
    if (!message) message = onSave({ ...profile, height, theme }, schedules, parsedWeight) || '';
    if (message) { setError(message); requestAnimationFrame(() => errorRef.current?.focus()); }
  }
  return <section className="page profile-page"><div className="page-title"><h1>{onboarding ? 'Ваш дневник' : 'Профиль'}</h1><p>{onboarding ? 'Настроим его под ваш ритм.' : 'Всё самое важное — под рукой.'}</p></div>
    {onboarding && <div className="privacy-note"><Icon as={ShieldCheck} /><p>Записи хранятся только в этом браузере. Синхронизации пока нет. Экспортируйте копию, чтобы не потерять историю при очистке браузера.</p></div>}
    <section className="theme-panel"><h2>Оформление</h2><div className="theme-options">{[['system', 'Система', Monitor], ['dark', 'Тёмная', Moon], ['light', 'Светлая', Sun]].map(([value, label, icon]) => <button type="button" key={value} aria-pressed={theme === value} className={theme === value ? 'selected' : ''} onClick={() => onTheme(value)}><Icon as={icon} /><span>{label}</span></button>)}</div></section>
    <form onSubmit={submit}><section className="profile-section"><h2>О вас</h2><p className="small-note">Можно заполнить сейчас или позже.</p><Field id="birth-date" label="Дата рождения" type="date" value={profile.birthDate} max={dayKey(Date.now(), validZone(profile.timezone) ? profile.timezone : state.profile.timezone)} min="1900-01-01" onChange={update('birthDate')} />
      <div className="two-fields"><SelectField id="sex" label="Пол" value={profile.sex} onChange={update('sex')}><option value="">Не указан</option><option value="female">Женский</option><option value="male">Мужской</option><option value="unspecified">Не указывать</option></SelectField><Field id="height" label="Рост, см" inputMode="decimal" placeholder="178" value={profile.height} onChange={update('height')} /></div>
      {onboarding && <Field id="initial-weight" label="Текущий вес, кг" hint="Станет первой записью в дневнике" inputMode="decimal" placeholder="76,4" value={weight} onChange={e => setWeight(e.target.value)} />}
      <div className="field"><label htmlFor="timezone">Часовой пояс расписания</label><input className="native-input" id="timezone" list="timezones" value={profile.timezone} onChange={update('timezone')} required spellCheck={false} /><datalist id="timezones">{zoneOptions.map(z => <option key={z} value={z} />)}</datalist><small>Расписание следует этому поясу. Записи и история используют местное время устройства.</small></div>
    </section><section className="profile-section"><h2>Ритм измерений</h2><p className="small-note">Сайт покажет расписание, пока открыт. Сообщения в Telegram подключим на следующем этапе.</p>{['bp', 'weight'].map(kind => <ScheduleFields kind={kind} value={schedules[kind]} key={kind} onChange={s => setSchedules(v => ({ ...v, [kind]: s }))} />)}</section>
      {error && <div className="form-error" role="alert" tabIndex={-1} ref={errorRef}>{error}</div>}
      <Button size="l" stretched className="primary-button" type="submit" before={<Icon as={Check} />}>{onboarding ? 'Начать вести дневник' : 'Сохранить настройки'}</Button>
      {onboarding && <button className="text-button full" type="button" onClick={onCancel}>Вернуться к примеру</button>}
    </form>
    {!onboarding && <section className="profile-section"><h2>Ваши данные</h2><button className="settings-row" onClick={onExport}><Icon as={ArrowDownToLine} /><span>Скачать копию дневника<small>Все записи и настройки в JSON</small></span><Icon as={ChevronRight} size={17} /></button><p className="small-note">Хранится на этом устройстве, в этом браузере. Очистка данных сайта удалит историю.</p></section>}
  </section>;
}

export default function App() {
  const [initial] = useState(readInitial);
  const [data, setData] = useState(() => initial.data || makeDemo());
  const [demo, setDemo] = useState(!initial.data);
  const [view, setView] = useState('today');
  const [theme, setTheme] = useState(() => readTheme(initial.data?.profile.theme || 'dark'));
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  const [metric, setMetric] = useState('bp'); const [period, setPeriod] = useState('7');
  const [form, setForm] = useState(null); const [toast, setToast] = useState(''); const [error, setError] = useState(initial.error);
  const [savedRecord, setSavedRecord] = useState(null); const [clock, setClock] = useState(Date.now());
  const appearance = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
  const zone = deviceZone();
  useEffect(() => { const m = matchMedia('(prefers-color-scheme: dark)'); const update = e => setSystemDark(e.matches); m.addEventListener('change', update); return () => m.removeEventListener('change', update); }, []);
  useEffect(() => { document.documentElement.dataset.theme = appearance; document.documentElement.style.colorScheme = appearance; document.querySelector('meta[name="theme-color"]').content = appearance === 'dark' ? '#101719' : '#f3f7f6'; }, [appearance]);
  useEffect(() => { const id = setInterval(() => setClock(Date.now()), 30000); return () => clearInterval(id); }, []);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(''), 4500); return () => clearTimeout(id); }, [toast]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [view, form]);
  useEffect(() => { const onStorage = e => { if (e.key !== STORAGE_KEY || demo) return; const result = readInitial(); if (result.data) { setData(result.data); setToast('Дневник обновлён в другой вкладке'); } else setError(result.error || 'Данные удалены в другой вкладке. Перезагрузите страницу.'); }; window.addEventListener('storage', onStorage); return () => window.removeEventListener('storage', onStorage); }, [demo]);
  function commit(next, forceReal = false) {
    if (!demo || forceReal) {
      if (initial.error) return initial.error;
      let result; try { result = saveState(localStorage, next); } catch { result = 'Хранилище браузера недоступно. Изменения не сохранены.'; }
      if (result) { setError(result); return result; }
    }
    setData(next); setError(''); return '';
  }
  function changeTheme(value) { setTheme(value); try { localStorage.setItem('healthnote.theme', value); } catch { setError('Тема применена, но браузер не разрешил сохранить выбор.'); } }
  function openRecord(kind, existing = null, extra = {}) { setSavedRecord(null); setForm({ kind, existing, ...extra }); }
  function saveRecord(record) {
    const validation = validateRecord(record);
    if (validation) return validation;
    const next = { ...data, records: [...data.records.filter(r => r.id !== record.id), record] };
    if (form.seriesSource) next.records = next.records.map(r => r.id === form.seriesSource ? { ...r, seriesId: record.seriesId, updatedAt: record.updatedAt } : r);
    if (form.reminderKey) next.reminderActions = { ...data.reminderActions, [form.reminderKey]: 'done' };
    const failure = commit(next); if (failure) return failure;
    setSavedRecord(record); setForm(null); setToast(demo ? 'Пример записи добавлен' : 'Измерение сохранено'); setClock(Date.now()); return '';
  }
  function deleteRecord(id) { const failure = commit({ ...data, records: data.records.filter(r => r.id !== id) }); if (failure) return failure; setForm(null); setToast('Запись удалена'); return ''; }
  function saveProfile(profile, schedules, weight) {
    const onboarding = view === 'onboarding';
    const next = onboarding ? emptyState(theme) : { ...data };
    next.profile = profile; next.schedules = schedules;
    if (weight != null) {
      const timing = timeMetadata(Date.now());
      next.records = [...next.records, { id: uid(), kind: 'weight', weight, ...timing, createdAt: timing.at, updatedAt: timing.at, comment: '' }];
    }
    const failure = commit(next, onboarding); if (failure) return failure;
    if (onboarding) { setDemo(false); setView('today'); setSavedRecord(null); }
    setToast(onboarding ? 'Ваш дневник готов к первой записи' : 'Настройки сохранены'); return '';
  }
  function reminderAction(key, action) { if (!commit({ ...data, reminderActions: { ...data.reminderActions, [key]: action } })) setToast(action === 'skip' ? 'Измерение пропущено' : 'Отложено на 30 минут'); }
  function exportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = `healthnote-${dayKey(Date.now(), zone)}${demo ? '-demo' : ''}.json`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 500); setToast('Копия дневника подготовлена');
  }
  const latest = sorted(data.records, zone);
  // Latest measurement means the actual latest instant, even when clocks move back.
  const byInstant = [...data.records].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const pressure = byInstant.find(r => r.kind === 'bp'); const pulse = byInstant.find(r => r.kind === 'bp' && r.pulse != null); const weight = byInstant.find(r => r.kind === 'weight');
  const chartRecords = selectRecords(data.records, metric, period, zone, clock);
  const summary = stats(chartRecords, metric);
  const due = reminders(data, clock);
  const todayCount = data.records.filter(r => dayKey(r.at, zone) === dayKey(clock, zone)).length;
  const series = savedRecord?.seriesId ? seriesMean(data.records, savedRecord.seriesId) : null;
  const activeView = form ? 'form' : view;
  return <AppRoot appearance={appearance} platform="ios" className={`healthnote ${appearance}`}>
    <div className="app-shell"><header className="app-header"><button className="brand" aria-label="Healthnote — на главную" onClick={() => { setForm(null); setView('today'); }}><span className="brand-mark"><Icon as={Activity} size={23} /></span><span>healthnote<span className="brand-dot">.</span></span></button>{activeView === 'form' || view === 'onboarding' ? <button className="icon-button" aria-label="Закрыть" onClick={() => { setForm(null); setView('today'); }}><Icon as={X} /></button> : <button className="icon-button" aria-label="Изменить тему" title="Изменить тему" onClick={() => changeTheme(appearance === 'dark' ? 'light' : 'dark')}><Icon as={appearance === 'dark' ? Sun : Moon} /></button>}</header>
      {demo && <div className="demo-banner"><span><span className="status-dot" />Демо · вымышленные данные</span><button onClick={() => { setForm(null); setView('onboarding'); }}>Начать свой<Icon as={ArrowRight} size={14} /></button></div>}
      {error && <div role="alert" className="persistent-error"><Icon as={Info} /><span>{error}</span></div>}
      <main id="main-content">
        {form ? <RecordForm key={form.existing?.id || `${form.kind}-${form.seriesId || 'new'}`} kind={form.kind} existing={form.existing} seriesId={form.seriesId} onSave={saveRecord} onDelete={deleteRecord} onCancel={() => setForm(null)} /> : view === 'profile' || view === 'onboarding' ? <ProfileForm key={`${view}-${demo}`} state={view === 'onboarding' ? emptyState(theme) : data} onboarding={view === 'onboarding'} onSave={saveProfile} onCancel={() => setView('today')} onExport={exportData} onTheme={changeTheme} theme={theme} /> : <div className="page">
          <div className="page-title"><div><h1>{view === 'today' ? 'Сегодня' : 'История'}</h1><p>{view === 'today' ? formatDate(clock, zone, { weekday: 'long', day: 'numeric', month: 'long' }) : 'Каждое измерение — часть картины.'}</p></div>{view === 'today' && <span className="day-count"><Check size={14} aria-hidden="true" />{todayCount ? `${todayCount} ${todayCount === 1 ? 'запись' : todayCount < 5 ? 'записи' : 'записей'}` : 'Новый день'}</span>}</div>
          {savedRecord?.kind === 'bp' && <div className="series-notice"><div><Icon as={Check} /><span>{series?.count > 1 ? `Среднее серии: ${number(series.avg)} / ${number(series.lower)} · ${series.count} замера` : 'Измерение записано'}</span><button className="icon-button" aria-label="Закрыть предложение повтора" onClick={() => setSavedRecord(null)}><Icon as={X} size={16} /></button></div><button className="text-button" onClick={() => openRecord('bp', null, { seriesId: savedRecord.seriesId || uid(), seriesSource: savedRecord.id })}><Icon as={Repeat2} size={16} />Добавить повторный замер</button></div>}
          {view === 'today' && <><section className="measurements" aria-label="Последние измерения"><div className="pressure-summary"><div className="summary-label"><span><Icon as={Activity} size={18} />Давление</span><span className="time-label">{pressure ? `${dayKey(pressure.at, zone) === dayKey(clock, zone) ? 'Сегодня' : formatDate(pressure.at, zone)} · ${formatTime(pressure.at, zone)}` : 'Первое измерение'}</span></div><div className="pressure-value">{pressure ? <>{pressure.systolic}<span>/</span>{pressure.diastolic}</> : <span className="no-value">— / —</span>}</div><div className="pressure-bottom"><span>мм рт. ст.</span><span>Последняя запись</span></div></div><div className="secondary-measurements"><div><span className="summary-label"><Icon as={Heart} size={17} />Пульс</span><strong>{pulse ? pulse.pulse : '—'} <small>уд/мин</small></strong><span className="time-label">{pulse ? `${formatDate(pulse.at, zone)} · ${formatTime(pulse.at, zone)}` : 'Добавьте с давлением'}</span></div><div><span className="summary-label"><Icon as={Scale} size={17} />Вес</span><strong>{weight ? number(weight.weight, 1) : '—'} <small>кг</small></strong><span className="time-label">{weight ? `${formatDate(weight.at, zone)} · ${formatTime(weight.at, zone)}` : 'Первое взвешивание'}</span></div></div></section>
            <div className="quick-actions"><Button size="l" className="primary-button" before={<Icon as={Plus} size={19} />} onClick={() => openRecord('bp')}>Давление</Button><Button size="l" className="secondary-button" before={<Icon as={Plus} size={19} />} onClick={() => openRecord('weight')}>Вес</Button></div></>}
          <section className="trends-section"><div className="section-heading"><h2>{view === 'today' ? 'Ваша динамика' : 'Обзор измерений'}</h2>{view === 'today' && <button className="text-button" onClick={() => setView('history')}>Все записи<Icon as={ChevronRight} size={15} /></button>}</div><Choice value={metric} options={Object.entries(METRICS).map(([k, v]) => [k, v.label])} onChange={setMetric} label="Показатель" /><div className="periods" role="group" aria-label="Период">{PERIODS.map(([key, label]) => <button key={key} aria-pressed={period === key} className={period === key ? 'selected' : ''} onClick={() => setPeriod(key)}>{label}</button>)}</div><Chart records={chartRecords} metric={metric} period={period} zone={zone} />
            <div className="statistics"><div><span>Среднее</span><strong>{number(summary.avg, metric === 'weight' ? 1 : 0)}{metric === 'bp' && <small> / {number(summary.lower)}</small>}</strong></div><div><span>Минимум{metric === 'bp' ? ' верх.' : ''}</span><strong>{number(summary.min, metric === 'weight' ? 1 : 0)}</strong></div><div><span>Максимум{metric === 'bp' ? ' верх.' : ''}</span><strong>{number(summary.max, metric === 'weight' ? 1 : 0)}</strong></div></div>
            {metric === 'weight' && weight && data.profile.height && <p className="bmi-note">Индекс массы тела: <strong>{number(bmi(weight.weight, data.profile.height), 1)}</strong> · по последнему весу и росту {data.profile.height} см</p>}
          </section>
          {view === 'history' ? <section><div className="section-heading"><h2>Записи <span className="count">{chartRecords.length}</span></h2><button className="text-button" onClick={() => openRecord(metric === 'weight' ? 'weight' : 'bp')}><Icon as={Plus} size={16} />Добавить</button></div>{chartRecords.length ? <RecordRows records={chartRecords} zone={zone} onEdit={r => openRecord(r.kind, r)} /> : <Empty title="За этот период записей нет" text="Выберите другой период или добавьте измерение." />}</section> : <>
            <section className="reminders-section"><div className="section-heading"><h2>Ваш ритм</h2><button className="icon-button" aria-label="Настроить расписание" onClick={() => setView('profile')}><Icon as={SlidersHorizontal} size={18} /></button></div>{due.length ? due.slice(0, 2).map(r => <div className="reminder" key={r.key}><div className="reminder-head"><span className="reminder-icon"><Icon as={r.kind === 'bp' ? Activity : Scale} size={19} /></span><div><strong>{METRICS[r.kind].label}</strong><span>{dayKey(r.at, zone) === dayKey(clock, zone) ? 'Сегодня' : formatDate(r.at, zone)} в {formatTime(r.at, zone)}</span></div><button className="reminder-record" onClick={() => openRecord(r.kind, null, { reminderKey: r.key })}>{r.overdue ? 'Записать' : 'Добавить'}<Icon as={Plus} size={15} /></button></div>{r.overdue && <div className="reminder-options"><button onClick={() => reminderAction(r.key, Date.now() + 30 * 60000)}><Icon as={Clock3} size={13} />Через 30 мин</button><button onClick={() => reminderAction(r.key, 'skip')}>Пропустить</button></div>}</div>) : <p className="small-note">Расписание выключено. Его можно включить в профиле.</p>}<p className="small-note reminder-foot"><Icon as={Bell} size={13} />Напоминания здесь, пока сайт открыт.</p></section>
            <section><div className="section-heading"><h2>Последние записи</h2><button className="text-button" onClick={() => setView('history')}><Icon as={ArrowRight} size={19} /><span className="sr-only">Открыть всю историю</span></button></div>{latest.length ? <RecordRows records={latest} zone={zone} limit={3} onEdit={r => openRecord(r.kind, r)} /> : <Empty title="Начните с одного измерения" text="Давление или вес — выбирайте, что записать сегодня." />}</section>
          </>}
          <footer className="page-footer"><Icon as={ShieldCheck} size={14} /><span>{demo ? 'Пример дневника · можно пробовать все функции' : 'Ваши записи остаются в этом браузере'}</span></footer>
        </div>}
      </main>
      {!form && view !== 'onboarding' && <nav className="bottom-nav" aria-label="Основная навигация">{[['today', 'Сегодня', Home], ['history', 'История', History], ['profile', 'Профиль', UserRound]].map(([key, title, icon]) => <button key={key} aria-current={view === key ? 'page' : undefined} className={view === key ? 'active' : ''} onClick={() => { setView(key); setSavedRecord(null); }}><Icon as={icon} /><span>{title}</span></button>)}</nav>}
    </div><div className="toast" role="status" aria-live="polite" data-visible={Boolean(toast)}>{toast && <><Icon as={Check} size={17} />{toast}</>}</div>
  </AppRoot>;
}
