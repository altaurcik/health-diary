import React, { useRef, useState } from 'react';
import { Plus, Trash2, ChevronRight, Check } from 'lucide-react';
import { newSchedule, validateSchedules } from './data.js';

const TYPES = { all: 'Всё', bp: 'Давление', weight: 'Вес' };
const DAYS = [[1, 'Пн'], [2, 'Вт'], [3, 'Ср'], [4, 'Чт'], [5, 'Пт'], [6, 'Сб'], [0, 'Вс']];
function repeatLabel(alarm) {
  const days = alarm.frequency === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : alarm.days;
  if (days.length === 7) return 'Каждый день';
  if (!days.length) return 'Выберите дни повтора';
  return DAYS.filter(([day]) => days.includes(day)).map(([, label]) => label).join(', ');
}

export default function AlarmSettings({ schedules, onChange }) {
  const [draft, setDraft] = useState(null);
  const [error, setError] = useState('');
  const [removed, setRemoved] = useState(null);
  const editorRef = useRef(null), addRef = useRef(null), errorRef = useRef(null);
  function report(message) { setError(message); requestAnimationFrame(() => errorRef.current?.focus()); }
  async function apply(next) {
    const message = validateSchedules(next) || await onChange(next) || '';
    if (message) { report(message); return false; }
    setError(''); return true;
  }
  function edit(alarm) {
    setError(''); setDraft({ ...alarm, frequency: 'weekly', days: alarm.frequency === 'daily' ? [1, 2, 3, 4, 5, 6, 0] : [...alarm.days] });
    requestAnimationFrame(() => { editorRef.current?.scrollIntoView({ block: 'nearest' }); editorRef.current?.focus(); });
  }
  async function save() {
    const exists = schedules.some(s => s.id === draft.id);
    const next = exists ? schedules.map(s => s.id === draft.id ? draft : s) : [...schedules, draft];
    if (await apply(next)) { setDraft(null); requestAnimationFrame(() => addRef.current?.focus()); }
  }
  async function remove(alarm) {
    if (await apply(schedules.filter(s => s.id !== alarm.id))) {
      setRemoved(alarm); if (draft?.id === alarm.id) setDraft(null);
      requestAnimationFrame(() => addRef.current?.focus());
    }
  }
  const patch = value => setDraft(current => ({ ...current, ...value }));
  return <div className="alarm-settings">
    {schedules.length ? <div className="alarm-list">{schedules.slice().sort((a, b) => a.time.localeCompare(b.time)).map(alarm => <div className={`alarm-row${alarm.enabled ? '' : ' is-off'}`} key={alarm.id}>
      <button type="button" className="alarm-open" aria-label={`Изменить напоминание ${alarm.time}, ${TYPES[alarm.kind]}`} onClick={() => edit(alarm)}>
        <span className="alarm-time">{alarm.time}</span><span className="alarm-description"><strong>{TYPES[alarm.kind]}</strong><span>{repeatLabel(alarm)}{!alarm.enabled && ' · выключено'}</span></span><ChevronRight size={17} aria-hidden="true" />
      </button>
      <div className="alarm-controls"><label className="switch"><input type="checkbox" aria-label={`Включить напоминание ${alarm.time}, ${TYPES[alarm.kind]}`} checked={alarm.enabled} onChange={async event => { const enabled = event.target.checked; if (await apply(schedules.map(s => s.id === alarm.id ? { ...s, enabled } : s)) && draft?.id === alarm.id) patch({ enabled }); }} /><span /></label>
        <button type="button" className="icon-button danger" aria-label={`Удалить напоминание ${alarm.time}, ${TYPES[alarm.kind]}`} onClick={() => remove(alarm)}><Trash2 size={18} aria-hidden="true" /></button></div>
    </div>)}</div> : <p className="alarm-empty">Напоминаний пока нет. Добавьте первое, когда вам удобно измерять давление или вес.</p>}
    {removed && <div className="alarm-undo" role="status"><span>Напоминание удалено</span><button type="button" className="text-button" onClick={async () => { if (await apply([...schedules, removed])) setRemoved(null); }}>Вернуть</button></div>}
    {draft ? <div className="alarm-editor" ref={editorRef} tabIndex={-1}>
      <h3>{schedules.some(s => s.id === draft.id) ? 'Изменить напоминание' : 'Новое напоминание'}</h3>
      <div className="field"><label htmlFor="alarm-time">Время напоминания</label><input id="alarm-time" className="native-input alarm-time-input" type="time" value={draft.time} onInput={event => patch({ time: event.currentTarget.value })} onChange={event => patch({ time: event.target.value })} /></div>
      <div className="field"><label htmlFor="alarm-kind">Что измерять</label><select id="alarm-kind" value={draft.kind} onChange={event => patch({ kind: event.target.value })}>{Object.entries(TYPES).map(([key, label]) => <option value={key} key={key}>{label}</option>)}</select><small>{draft.kind === 'all' ? 'Давление и вес в одном напоминании.' : draft.kind === 'bp' ? 'Давление и, при желании, пульс.' : 'Только вес.'}</small></div>
      <div className="alarm-days-heading"><span>Дни повтора</span><button type="button" className="text-button" onClick={() => patch({ days: draft.days.length === 7 ? [] : [1, 2, 3, 4, 5, 6, 0] })}>{draft.days.length === 7 ? 'Снять все' : 'Все дни'}</button></div>
      <div className="days alarm-days" role="group" aria-label="Дни напоминания">{DAYS.map(([day, label]) => <button type="button" key={day} aria-pressed={draft.days.includes(day)} className={draft.days.includes(day) ? 'selected' : ''} onClick={() => patch({ days: draft.days.includes(day) ? draft.days.filter(d => d !== day) : [...draft.days, day] })}>{label}</button>)}</div>
      <p className="alarm-repeat-summary">{repeatLabel(draft)}</p>
      <div className="alarm-editor-actions"><button type="button" className="alarm-save" onClick={save}><Check size={18} aria-hidden="true" />Сохранить напоминание</button><button type="button" className="text-button" onClick={() => { setDraft(null); setError(''); requestAnimationFrame(() => addRef.current?.focus()); }}>Отмена</button></div>
    </div> : <button type="button" ref={addRef} className="text-button alarm-add" onClick={() => edit(newSchedule())}><Plus size={19} aria-hidden="true" />Добавить напоминание</button>}
    {error && <div className="form-error" role="alert" ref={errorRef} tabIndex={-1}>{error}</div>}
  </div>;
}
