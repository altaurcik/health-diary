export const STORAGE_KEY = 'healthnote.diary.v1';
export const PERIODS = [['7', '7 дней'], ['30', '30 дней'], ['90', '3 мес.'], ['365', '1 год'], ['all', 'Всё']];
export const uid = () => crypto.randomUUID();
export const mean = values => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
export const number = (value, digits = 0) => value == null ? '—' : new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(value);
export const deviceZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
export function validZone(zone) { try { new Intl.DateTimeFormat('en', { timeZone: zone }).format(); return true; } catch { return false; } }
export function parts(at, zone) {
  return Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(at)).map(p => [p.type, p.value]));
}
export function dayKey(at, zone) { const p = parts(at, zone); return `${p.year}-${p.month}-${p.day}`; }
export function formTime(at, zone) { const p = parts(at, zone); return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`; }
export function shiftDay(day, amount) { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + amount); return d.toISOString().slice(0, 10); }
export function zonedIso(value, zone) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value) || !validZone(zone)) throw new Error('Проверьте дату и время.');
  const nominal = Date.parse(`${value}:00Z`);
  if (!Number.isFinite(nominal)) throw new Error('Проверьте дату и время.');
  let guess = nominal;
  for (let i = 0; i < 4; i++) { const local = Date.parse(`${formTime(guess, zone)}:00Z`); guess += nominal - local; }
  if (formTime(guess, zone) !== value) throw new Error('Такого времени нет в выбранном часовом поясе. Выберите другое.');
  return new Date(guess).toISOString();
}
export function timeMetadata(at, timeZone = deviceZone()) {
  const timestamp = new Date(at).getTime();
  if (!Number.isFinite(timestamp) || !validZone(timeZone)) throw new Error('Проверьте дату и часовой пояс.');
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3, hourCycle: 'h23',
  }).formatToParts(timestamp).map(part => [part.type, part.value]));
  const localDateTime = `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.${p.fractionalSecond}`;
  return { at: new Date(timestamp).toISOString(), timestamp, localDateTime, timeZone,
    utcOffsetMinutes: (Date.parse(`${localDateTime}Z`) - timestamp) / 60000 };
}
export function recordTiming({ localValue, timeZone, initialAt, existing, savedAt = Date.now() }) {
  const savedIso = new Date(savedAt).toISOString();
  // An unchanged minute field must not truncate seconds or move a repeated DST hour.
  if (existing && localValue === formTime(existing.at, timeZone)) {
    const result = { at: existing.at, timestamp: Date.parse(existing.at), createdAt: existing.createdAt ?? null, updatedAt: savedIso };
    for (const key of ['localDateTime', 'timeZone', 'utcOffsetMinutes']) {
      if (existing[key] !== undefined) result[key] = existing[key];
    }
    return result;
  }
  const at = !existing && localValue === formTime(initialAt, timeZone)
    ? initialAt : zonedIso(localValue, timeZone);
  return { ...timeMetadata(at, timeZone), createdAt: existing ? existing.createdAt ?? null : savedIso, updatedAt: savedIso };
}
export function formatDate(at, zone, options = {}) { return new Intl.DateTimeFormat('ru-RU', { timeZone: zone, day: 'numeric', month: 'short', ...options }).format(new Date(at)); }
export function formatTime(at, zone) { return new Intl.DateTimeFormat('ru-RU', { timeZone: zone, hour: '2-digit', minute: '2-digit' }).format(new Date(at)); }
export function emptyState(theme = 'dark') {
  return { version: 2, profile: { birthDate: '', sex: '', height: '', timezone: deviceZone(), theme }, records: [],
    schedules: [], reminderActions: {} };
}
export function validateRecord(input, now = Date.now()) {
  if (!['bp', 'weight'].includes(input.kind)) return 'Неизвестный тип записи.';
  if (!Number.isFinite(Date.parse(input.at)) || Date.parse(input.at) > now + 120000) return 'Укажите корректное время, не позже текущего.';
  if (input.timestamp !== undefined && input.timestamp !== Date.parse(input.at)) return 'Не удалось проверить время записи.';
  if (['localDateTime', 'timeZone', 'utcOffsetMinutes'].some(key => input[key] !== undefined)) {
    if (typeof input.timeZone !== 'string' || !validZone(input.timeZone)
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/.test(input.localDateTime)
      || !Number.isFinite(input.utcOffsetMinutes)
      || Date.parse(`${input.localDateTime}Z`) - input.utcOffsetMinutes * 60000 !== Date.parse(input.at)) return 'Некорректное местное время записи.';
  }
  if (String(input.comment || '').length > 300) return 'Комментарий — до 300 символов.';
  if (input.kind === 'weight') {
    if (!Number.isFinite(input.weight) || input.weight < 10 || input.weight > 500) return 'Введите вес от 10 до 500 кг.';
  } else {
    if (!Number.isInteger(input.systolic) || input.systolic < 30 || input.systolic > 300) return 'Верхнее давление: целое число от 30 до 300.';
    if (!Number.isInteger(input.diastolic) || input.diastolic < 20 || input.diastolic > 200) return 'Нижнее давление: целое число от 20 до 200.';
    if (input.systolic <= input.diastolic) return 'Верхнее давление должно быть больше нижнего.';
    if (input.pulse != null && (!Number.isInteger(input.pulse) || input.pulse < 20 || input.pulse > 250)) return 'Пульс: целое число от 20 до 250 или пустое поле.';
  }
  return '';
}
export function newSchedule() {
  return { id: uid(), kind: 'all', enabled: true, time: '08:00', frequency: 'weekly', days: [1, 2, 3, 4, 5, 6, 0] };
}
export function validateSchedules(schedules) {
  if (!Array.isArray(schedules)) return 'Не удалось прочитать расписания.';
  if (new Set(schedules.map(s => s?.id)).size !== schedules.length) return 'Расписания должны иметь разные идентификаторы.';
  for (const s of schedules) {
    if (!s || typeof s.id !== 'string' || !s.id || !['all', 'bp', 'weight'].includes(s.kind) || typeof s.enabled !== 'boolean') return 'Проверьте тип напоминания.';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(s.time)) return 'Укажите время напоминания.';
    if (!['daily', 'weekly'].includes(s.frequency) || !Array.isArray(s.days) || s.days.some(d => !Number.isInteger(d) || d < 0 || d > 6)) return 'Проверьте повтор напоминания.';
    if (new Set(s.days).size !== s.days.length) return 'Дни недели не должны повторяться.';
    if (s.enabled && s.frequency === 'weekly' && !s.days.length) return 'Выберите хотя бы один день недели.';
  }
  return '';
}
function normalizeSchedule(schedule) {
  if (!schedule) return schedule;
  const { monthDay, ...rest } = schedule;
  if (schedule.frequency === 'monthly') return { ...rest, frequency: 'weekly', days: [], enabled: false };
  if (schedule.frequency === 'daily') return { ...rest, frequency: 'weekly', days: [1, 2, 3, 4, 5, 6, 0] };
  return rest;
}
function migrateSchedules(value) {
  if (value.version === 2) return { ...value, schedules: value.schedules.map(normalizeSchedule) };
  const schedules = [], reminderActions = {};
  for (const kind of ['bp', 'weight']) {
    const old = value.schedules?.[kind];
    if (!old || !Array.isArray(old.times) || !old.times.length) throw new Error('Не удалось прочитать старое расписание.');
    for (const time of old.times) {
      const id = `legacy-${kind}-${String(time).replace(':', '')}`;
      schedules.push({ id, kind, enabled: old.enabled, time, frequency: old.frequency, days: old.days, monthDay: Number(old.monthDay) });
      for (const [key, action] of Object.entries(value.reminderActions || {})) {
        const match = key.match(/^(bp|weight):(\d{4}-\d{2}-\d{2}):(\d{2}:\d{2})$/);
        if (match && match[1] === kind && match[3] === time) reminderActions[`${id}:${match[2]}:${time}:${kind}`] = action;
      }
    }
  }
  return { ...value, version: 2, schedules: schedules.map(normalizeSchedule), reminderActions };
}
export function validateState(value) {
  if (!value || ![1, 2].includes(value.version) || !value.profile || !validZone(value.profile.timezone) || !['light', 'dark', 'system'].includes(value.profile.theme) || !Array.isArray(value.records) || !value.schedules || !value.reminderActions) throw new Error('Формат сохранённого дневника не поддерживается.');
  if (new Set(value.records.map(r => r.id)).size !== value.records.length || value.records.some(r => typeof r.id !== 'string' || validateRecord(r))) throw new Error('В сохранённых записях есть ошибка.');
  const migrated = migrateSchedules(value);
  const error = validateSchedules(migrated.schedules);
  if (error) throw new Error(error);
  // Migration is in memory; storage is only written on the next successful user edit.
  return { ...migrated, records: value.records.map(record => ({ ...record, timestamp: Date.parse(record.at) })) };
}
export function validateProfile(profile, schedules, now = Date.now()) {
  if (!validZone(profile.timezone)) return 'Выберите корректный часовой пояс.';
  const height = profile.height === '' ? '' : Number(String(profile.height).replace(',', '.'));
  if (height !== '' && (!Number.isFinite(height) || height < 50 || height > 250)) return 'Рост: число от 50 до 250 см.';
  if (profile.birthDate && (!/^\d{4}-\d{2}-\d{2}$/.test(profile.birthDate) || profile.birthDate > dayKey(now, profile.timezone) || profile.birthDate < '1900-01-01')) return 'Проверьте дату рождения.';
  return validateSchedules(schedules);
}
export function loadState(storage) {
  try { const text = storage.getItem(STORAGE_KEY); return { data: text ? validateState(JSON.parse(text)) : null, error: '' }; }
  catch { return { data: null, error: 'Не удалось прочитать дневник. Исходные данные не изменены. Проверьте доступ к хранилищу браузера.' }; }
}
export function saveState(storage, value) {
  try { storage.setItem(STORAGE_KEY, JSON.stringify(value)); return ''; }
  catch { return 'Не удалось сохранить запись. Возможно, хранилище браузера заполнено или недоступно. Данные в форме сохранены.'; }
}
// A wall-clock coordinate for display only; never store it as the UTC instant.
export function localTimeCoordinate(at, zone = deviceZone()) {
  return Date.parse(`${timeMetadata(at, zone).localDateTime}Z`);
}
export function sorted(records, zone = deviceZone()) {
  return records.map(record => ({ record, local: localTimeCoordinate(record.at, zone) }))
    .sort((a, b) => b.local - a.local || Date.parse(b.record.at) - Date.parse(a.record.at))
    .map(({ record }) => record);
}
export function selectRecords(records, metric, period, zone, now = Date.now()) {
  const kind = metric === 'weight' ? 'weight' : 'bp';
  const start = period === 'all' ? null : shiftDay(dayKey(now, zone), 1 - Number(period));
  return sorted(records.filter(r => r.kind === kind && (metric !== 'pulse' || r.pulse != null) && Date.parse(r.at) <= now && (!start || dayKey(r.at, zone) >= start)), zone);
}
export function valuesFor(records, metric) { return records.map(r => metric === 'bp' ? r.systolic : metric === 'pulse' ? r.pulse : r.weight).filter(v => v != null); }
export function stats(records, metric) { const values = valuesFor(records, metric); return { avg: mean(values), min: values.length ? Math.min(...values) : null, max: values.length ? Math.max(...values) : null, lower: metric === 'bp' ? mean(records.map(r => r.diastolic)) : null, count: values.length }; }
export function sevenDaySummary(records, zone = deviceZone(), now = Date.now()) {
  return Object.fromEntries(['bp', 'pulse', 'weight'].map(metric => {
    const selected = selectRecords(records, metric, '7', zone, now);
    return [metric, { ...stats(selected, metric), days: new Set(selected.map(record => dayKey(record.at, zone))).size }];
  }));
}
export function summaryCoverage(summary) {
  if (!summary.count) return 'Пока нет измерений';
  const plural = (n, forms) => forms[n % 100 >= 11 && n % 100 <= 14 ? 2 : n % 10 === 1 ? 0 : n % 10 >= 2 && n % 10 <= 4 ? 1 : 2];
  return `${summary.count} ${plural(summary.count, ['замер', 'замера', 'замеров'])} · ${summary.days} ${plural(summary.days, ['день', 'дня', 'дней'])}`;
}
// Every point keeps its source record, even for year/all-time views.
export function chartData(records, metric, _period, zone) {
  return sorted(records, zone).reverse().map(record => ({ key: record.id, at: record.at,
    value: valuesFor([record], metric)[0], lower: metric === 'bp' ? record.diastolic : null,
    record }));
}
export function chartWindow(records, zone, bounds = [0, 1000]) {
  const coordinates = records.map(record => localTimeCoordinate(record.at, zone));
  if (!coordinates.length) return { records: [], start: null, end: null };
  const first = Math.min(...coordinates), last = Math.max(...coordinates);
  const start = first + (last - first) * bounds[0] / 1000;
  const end = first + (last - first) * bounds[1] / 1000;
  return { start, end, records: records.filter((_, i) => coordinates[i] >= start && coordinates[i] <= end) };
}
export function seriesMean(records, seriesId) { return stats(records.filter(r => r.kind === 'bp' && r.seriesId === seriesId), 'bp'); }
export function bmi(weight, height) { return weight > 0 && height > 0 ? weight / ((height / 100) ** 2) : null; }
export function reminders(state, now = Date.now()) {
  const zone = state.profile.timezone, today = dayKey(now, zone), result = [];
  for (const schedule of state.schedules) {
    if (!schedule.enabled) continue;
    let occurrences = 0;
    for (let d = -1; d < 35 && occurrences < 2; d++) {
      const day = shiftDay(today, d), date = new Date(`${day}T12:00Z`);
      if (schedule.frequency === 'weekly' && !schedule.days.includes(date.getUTCDay())) continue;
      let scheduledAt; try { scheduledAt = zonedIso(`${day}T${schedule.time}`, zone); } catch { continue; }
      const key = `${schedule.id}:${day}:${schedule.time}`;
      const groups = new Map();
      for (const kind of schedule.kind === 'all' ? ['bp', 'weight'] : [schedule.kind]) {
        const taskKey = `${key}:${kind}`, action = state.reminderActions[taskKey];
        if (action === 'skip' || action === 'done' || (d < 0 && typeof action !== 'number')) continue;
        const at = typeof action === 'number' ? new Date(action).toISOString() : scheduledAt;
        if (!groups.has(at)) groups.set(at, []);
        groups.get(at).push({ kind, key: taskKey });
      }
      for (const [at, tasks] of groups) result.push({ key: `${key}:${at}`, scheduleId: schedule.id, at, tasks, overdue: Date.parse(at) <= now });
      if (groups.size) occurrences++;
    }
  }
  return result.sort((a, b) => Date.parse(a.at) - Date.parse(b.at) || a.key.localeCompare(b.key)).slice(0, 3);
}
export function makeDemo(now = Date.now()) {
  const state = emptyState(); state.profile.height = 178; state.profile.sex = 'male'; state.profile.birthDate = '1990-05-15';
  state.schedules = [{ ...newSchedule(), id: 'demo-morning', time: '08:00', kind: 'all' }, { ...newSchedule(), id: 'demo-evening', time: '20:00', kind: 'bp' }];
  const zone = state.profile.timezone; const today = dayKey(now, zone);
  for (let d = 29; d >= 0; d--) {
    const day = shiftDay(today, -d); const at = zonedIso(`${day}T08:15`, zone);
    if (Date.parse(at) <= now) {
      state.records.push({ id: `demo-bp-${d}`, kind: 'bp', ...timeMetadata(at, zone), systolic: 121 + ((d * 7) % 13), diastolic: 76 + ((d * 3) % 8), pulse: 64 + ((d * 5) % 13), comment: d === 0 ? 'Утреннее измерение, после отдыха' : '', seriesId: null });
      if (d % 3 === 0) state.records.push({ id: `demo-weight-${d}`, kind: 'weight', ...timeMetadata(at, zone), weight: Math.round((76.4 + d * .025 + Math.sin(d) * .2) * 10) / 10, comment: '' });
    }
  }
  return state;
}
