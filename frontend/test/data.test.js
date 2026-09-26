import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, formTime, zonedIso, dayKey, selectRecords, stats, chartData, chartWindow, seriesMean, validateRecord, validateProfile, saveState, loadState, reminders, bmi, makeDemo, STORAGE_KEY, timeMetadata, recordTiming, sorted, localTimeCoordinate, sevenDaySummary, summaryCoverage, newSchedule, validateSchedules } from '../src/data.js';
const now = Date.parse('2026-09-26T12:00:00Z');
const bp = (id, at, systolic = 128, diastolic = 82, pulse = null) => ({ id, kind: 'bp', at, systolic, diastolic, pulse, comment: '' });

test('time conversion preserves selected zone, including half-hour offsets', () => {
  for (const zone of ['Europe/Moscow', 'Asia/Kolkata', 'America/New_York']) {
    const input = '2026-09-26T10:35';
    assert.equal(formTime(zonedIso(input, zone), zone), input);
  }
  assert.equal(zonedIso('2026-09-26T10:35', 'Europe/Moscow'), '2026-09-26T07:35:00.000Z');
  assert.throws(() => zonedIso('2026-03-08T02:30', 'America/New_York'));
});
test('calendar windows honor the supplied display time zone and include first day', () => {
  const rows = [bp('a', '2026-09-19T20:59:00Z'), bp('b', '2026-09-19T21:00:00Z'), bp('c', '2026-09-26T10:00:00Z')];
  assert.deepEqual(selectRecords(rows, 'bp', '7', 'Europe/Moscow', now).map(r => r.id), ['c', 'b']);
  assert.equal(selectRecords(rows, 'pulse', 'all', 'Europe/Moscow', now).length, 0);
});
test('local device wall time and UTC timestamp identify the same exact instant', () => {
  const instant = '2026-09-26T22:30:45.123Z';
  const moscow = timeMetadata(instant, 'Europe/Moscow');
  assert.deepEqual(moscow, { at: instant, timestamp: Date.parse(instant), localDateTime: '2026-09-27T01:30:45.123', timeZone: 'Europe/Moscow', utcOffsetMinutes: 180 });
  const india = timeMetadata(instant, 'Asia/Kolkata');
  assert.equal(india.localDateTime, '2026-09-27T04:00:45.123');
  assert.equal(india.utcOffsetMinutes, 330);
  assert.equal(india.timestamp, moscow.timestamp);
});
test('new records keep exact device time while backdated records have separate creation time', () => {
  const initialAt = Date.parse('2026-09-26T09:30:45.123Z');
  const savedAt = initialAt + 90000;
  const current = recordTiming({ localValue: '2026-09-26T12:30', timeZone: 'Europe/Moscow', initialAt, savedAt });
  assert.equal(current.timestamp, initialAt);
  assert.equal(current.createdAt, new Date(savedAt).toISOString());
  assert.equal(current.updatedAt, current.createdAt);
  const backdated = recordTiming({ localValue: '2026-09-25T08:00', timeZone: 'Europe/Moscow', initialAt, savedAt });
  assert.equal(backdated.at, '2026-09-25T05:00:00.000Z');
  assert.equal(backdated.createdAt, current.createdAt);
});
test('editing only readings during travel preserves original instant and local metadata', () => {
  const original = { ...timeMetadata('2026-09-26T10:20:35.777Z', 'Europe/Moscow'), createdAt: '2026-09-26T10:22:00.000Z' };
  const changed = recordTiming({ localValue: formTime(original.at, 'Asia/Tokyo'), timeZone: 'Asia/Tokyo', existing: original, savedAt: now });
  for (const key of ['at', 'timestamp', 'localDateTime', 'timeZone', 'utcOffsetMinutes', 'createdAt']) assert.equal(changed[key], original[key]);
  assert.equal(changed.updatedAt, new Date(now).toISOString());
  const rescheduled = recordTiming({ localValue: '2026-09-26T20:00', timeZone: 'Asia/Tokyo', existing: original, savedAt: now });
  assert.equal(rescheduled.at, '2026-09-26T11:00:00.000Z');
  assert.equal(rescheduled.timeZone, 'Asia/Tokyo');
  assert.equal(rescheduled.createdAt, original.createdAt);
});
test('both occurrences of a repeated DST hour retain their distinct timestamp on edit', () => {
  for (const [at, offset] of [['2026-11-01T05:30:25.123Z', -240], ['2026-11-01T06:30:25.123Z', -300]]) {
    const original = timeMetadata(at, 'America/New_York');
    assert.equal(original.utcOffsetMinutes, offset);
    assert.equal(original.localDateTime, '2026-11-01T01:30:25.123');
    const edited = recordTiming({ existing: original, localValue: '2026-11-01T01:30', timeZone: 'America/New_York', savedAt: Date.parse('2026-11-01T08:00:00Z') });
    assert.equal(edited.at, at);
  }
});
test('legacy records gain timestamp without guessing their original local time or writing storage', () => {
  const state = emptyState(); state.records = [bp('legacy', '2026-09-25T10:20:35.123Z')];
  let writes = 0;
  const storage = { getItem: () => JSON.stringify(state), setItem: () => { writes++; } };
  const loaded = loadState(storage);
  assert.equal(loaded.error, ''); assert.equal(writes, 0);
  assert.equal(loaded.data.records[0].timestamp, Date.parse(state.records[0].at));
  assert.equal(loaded.data.records[0].timeZone, undefined);
  const edited = recordTiming({ existing: loaded.data.records[0], localValue: '2026-09-25T13:20', timeZone: 'Europe/Moscow', savedAt: now });
  assert.equal(edited.at, state.records[0].at);
  assert.equal(edited.createdAt, null);
  assert.equal(edited.localDateTime, undefined);
});
test('inconsistent timestamp/local offsets are rejected and metadata survives storage', () => {
  const record = { ...bp('a', '2026-09-26T10:00:00Z'), ...timeMetadata('2026-09-26T10:00:00Z', 'Europe/Moscow') };
  assert.equal(validateRecord(record, now), '');
  assert.ok(validateRecord({ ...record, timestamp: record.timestamp + 1 }, now));
  assert.ok(validateRecord({ ...record, utcOffsetMinutes: 0 }, now));
  assert.ok(validateRecord({ ...record, timeZone: undefined }, now));
  const state = emptyState(); state.records = [record];
  let json = ''; const storage = { getItem: () => json, setItem: (_, value) => { json = value; } };
  assert.equal(saveState(storage, state), '');
  assert.deepEqual(loadState(storage).data.records[0], record);
});
test('user-facing order follows local wall time with UTC as a tie-breaker across a DST fold', () => {
  const rows = [bp('before', '2026-11-01T05:50:00Z'), bp('after', '2026-11-01T06:10:00Z'), bp('same-before', '2026-11-01T05:10:00Z')];
  const zone = 'America/New_York';
  assert.deepEqual(sorted(rows, zone).map(r => r.id), ['before', 'after', 'same-before']);
  assert.deepEqual(sorted(rows, 'UTC').map(r => r.id), ['after', 'before', 'same-before']);
  const points = chartData(rows, 'bp', '7', zone);
  assert.deepEqual(points.map(p => formTime(p.at, zone)), ['2026-11-01T01:10', '2026-11-01T01:10', '2026-11-01T01:50']);
});
test('charts keep every source sample for every period, including duplicate timestamps', () => {
  const rows = Array.from({ length: 80 }, (_, i) => ({ ...bp(`sample-${i}`, '2026-03-26T12:00:00Z', 120 + i % 10), comment: `Комментарий ${i}` }));
  for (const period of ['7', '30', '90', '365', 'all']) {
    const points = chartData(rows, 'bp', period, 'Europe/Moscow');
    assert.equal(points.length, 80);
    assert.equal(new Set(points.map(p => p.key)).size, 80);
    for (const point of points) {
      assert.equal(point.record, rows.find(r => r.id === point.key));
      assert.equal(point.value, point.record.systolic);
      assert.ok(point.record.comment);
    }
  }
});
test('range window uses local time, inclusive edges and handles gaps or one instant', () => {
  const rows = [bp('a', '2026-03-01T12:00:00Z'), bp('b', '2026-03-06T12:00:00Z'), bp('c', '2026-03-11T12:00:00Z')];
  assert.deepEqual(chartWindow(rows, 'Europe/Moscow', [0, 500]).records.map(r => r.id), ['a', 'b']);
  assert.deepEqual(chartWindow(rows, 'Europe/Moscow', [500, 1000]).records.map(r => r.id), ['b', 'c']);
  assert.equal(chartWindow(rows, 'Europe/Moscow', [100, 400]).records.length, 0);
  assert.equal(chartWindow(rows, 'Europe/Moscow').start, Date.parse('2026-03-01T15:00:00Z'));
  assert.deepEqual(chartWindow([rows[0]], 'UTC', [100, 400]).records, [rows[0]]);
  assert.deepEqual(chartWindow([], 'UTC'), { records: [], start: null, end: null });
  const fold = [bp('before', '2026-11-01T05:50:00Z'), bp('after', '2026-11-01T06:10:00Z')];
  assert.equal(chartWindow(fold, 'America/New_York', [0, 500]).records[0].id, 'after');
});
test('optional pulse is not counted as zero and pressure summaries use actual samples', () => {
  const rows = [bp('a', '2026-09-25T10:00:00Z', 120, 80, 60), bp('b', '2026-09-26T10:00:00Z', 140, 90, null)];
  assert.equal(stats(rows, 'pulse').avg, 60);
  assert.deepEqual(stats(rows, 'bp'), { avg: 130, lower: 85, min: 120, max: 140, count: 2 });
});
test('chart order and series preserve separate source measurements', () => {
  const rows = [bp('b', '2026-09-26T10:00:00Z', 140, 90), bp('a', '2026-09-26T08:00:00Z', 120, 80)].map(r => ({ ...r, seriesId: 'series' }));
  const points = chartData(rows, 'bp', '365', 'Europe/Moscow');
  assert.deepEqual(points.map(p => p.key), ['a', 'b']);
  assert.deepEqual(points.map(p => p.value), [120, 140]);
  assert.equal(seriesMean(rows, 'series').lower, 85);
});
test('invalid numbers, reversed pressure and future dates are rejected', () => {
  assert.equal(validateRecord(bp('a', '2026-09-26T10:00:00Z'), now), '');
  for (const row of [bp('a', '2026-09-26T10:00:00Z', NaN), bp('a', '2026-09-26T10:00:00Z', 80, 120), bp('a', '2030-01-01T10:00:00Z'), { id: 'b', kind: 'weight', weight: Infinity, at: '2026-09-26T10:00:00Z' }]) assert.ok(validateRecord(row, now));
});
test('storage reports quota failures and preserves unreadable original data', () => {
  let writes = 0; const broken = { getItem: () => '{broken', setItem: () => { writes++; } };
  assert.ok(loadState(broken).error); assert.equal(writes, 0);
  assert.ok(saveState({ setItem() { throw new Error('QuotaExceeded'); } }, emptyState()));
  const memory = new Map(); const storage = { getItem: k => memory.get(k), setItem: (k, v) => memory.set(k, v) };
  const state = emptyState(); assert.equal(saveState(storage, state), ''); assert.deepEqual(loadState(storage).data, state); assert.ok(memory.has(STORAGE_KEY));
});
test('alarms follow zone, repeat, skip and snooze independently', () => {
  const state = emptyState(); state.profile.timezone = 'Europe/Moscow';
  state.schedules = [{ ...newSchedule(), id: 'a', kind: 'bp' }];
  const first = reminders(state, now)[0]; assert.equal(first.at, '2026-09-26T05:00:00.000Z'); assert.equal(first.overdue, true);
  const key = first.tasks[0].key;
  state.reminderActions[key] = now + 30 * 60000;
  assert.equal(reminders(state, now)[0].at, '2026-09-26T12:30:00.000Z');
  state.reminderActions[key] = 'skip';
  assert.equal(reminders(state, now)[0].at, '2026-09-27T05:00:00.000Z');
  state.schedules[0].frequency = 'weekly'; state.schedules[0].days = [1];
  assert.equal(dayKey(reminders(state, now)[0].at, 'Europe/Moscow'), '2026-09-28');
});
test('all alarm retains weight reminder after pressure is completed; duplicate times are independent', () => {
  const state = emptyState(); state.profile.timezone = 'UTC';
  state.schedules = [{ ...newSchedule(), id: 'a' }, { ...newSchedule(), id: 'b', kind: 'weight' }];
  const first = reminders(state, now).find(r => r.scheduleId === 'a');
  assert.deepEqual(first.tasks.map(t => t.kind), ['bp', 'weight']);
  state.reminderActions[first.tasks[0].key] = 'done';
  const next = reminders(state, now);
  assert.deepEqual(next.find(r => r.scheduleId === 'a').tasks.map(t => t.kind), ['weight']);
  assert.equal(next.find(r => r.scheduleId === 'b').tasks.length, 1);
  state.reminderActions[first.tasks[1].key] = 'skip';
  assert.equal(reminders(state, now).find(r => r.scheduleId === 'a').at, '2026-09-27T08:00:00.000Z');
});
test('new diary has no alarms; disabled and deleted alarms produce no reminders', () => {
  const state = emptyState(); assert.deepEqual(reminders(state, now), []);
  state.schedules = [{ ...newSchedule(), enabled: false }];
  assert.deepEqual(reminders(state, now), []);
  state.schedules = []; assert.deepEqual(reminders(state, now), []);
});
test('snoozed alarm survives crossing midnight and DST nonexistent time is skipped', () => {
  const state = emptyState(); state.profile.timezone = 'UTC';
  state.schedules = [{ ...newSchedule(), id: 'late', kind: 'weight', time: '23:50' }];
  const previous = Date.parse('2026-09-25T23:55:00Z');
  const key = reminders(state, previous)[0].tasks[0].key;
  state.reminderActions[key] = previous + 30 * 60000;
  assert.equal(reminders(state, Date.parse('2026-09-26T00:10:00Z'))[0].at, '2026-09-26T00:25:00.000Z');
  state.profile.timezone = 'America/New_York'; state.schedules[0].time = '02:30'; state.reminderActions = {};
  assert.equal(dayKey(reminders(state, Date.parse('2026-03-08T08:00:00Z'))[0].at, state.profile.timezone), '2026-03-09');
});
test('legacy schedules migrate without writes or losing records and completed actions', () => {
  const legacy = { ...emptyState(), version: 1, records: [bp('legacy', '2026-09-25T08:00:00Z')], schedules: {
    bp: { enabled: true, frequency: 'daily', days: [1], monthDay: 1, times: ['08:00', '20:00'] },
    weight: { enabled: false, frequency: 'weekly', days: [], monthDay: 1, times: ['08:30'] },
  }, reminderActions: { 'bp:2026-09-26:08:00': 'done', 'bp:2026-09-26:20:00': now + 1000 } };
  let writes = 0; const loaded = loadState({ getItem: () => JSON.stringify(legacy), setItem: () => writes++ });
  assert.equal(loaded.error, ''); assert.equal(writes, 0); assert.equal(loaded.data.version, 2);
  assert.deepEqual(loaded.data.schedules.map(s => [s.kind, s.time, s.enabled]), [['bp', '08:00', true], ['bp', '20:00', true], ['weight', '08:30', false]]);
  assert.equal(loaded.data.reminderActions['legacy-bp-0800:2026-09-26:08:00:bp'], 'done');
  assert.equal(loaded.data.reminderActions['legacy-bp-2000:2026-09-26:20:00:bp'], now + 1000);
  assert.equal(loaded.data.records[0].id, 'legacy'); assert.equal(legacy.version, 1);
  let saved; saveState({ setItem: (_, value) => saved = value }, loaded.data);
  assert.deepEqual(loadState({ getItem: () => saved }).data, loaded.data);
  legacy.schedules.bp.times = ['25:00'];
  assert.ok(loadState({ getItem: () => JSON.stringify(legacy) }).error);
});
test('invalid alarm drafts are rejected before saving', () => {
  const alarm = newSchedule(); assert.equal(validateSchedules([alarm]), '');
  for (const patch of [{ time: '' }, { time: '25:00' }, { kind: 'unknown' }, { frequency: 'weekly', days: [] }, { frequency: 'monthly' }]) assert.ok(validateSchedules([{ ...alarm, ...patch }]));
  assert.ok(validateSchedules([alarm, alarm]));
});
test('BMI only calculated with height and weight; demo contains past synthetic records', () => {
  assert.equal(bmi(75, 0), null); assert.ok(Math.abs(bmi(75, 180) - 23.148148) < .0001);
  const demo = makeDemo(now); assert.ok(demo.records.length > 20); assert.ok(demo.records.every(r => Date.parse(r.at) <= now && r.id.startsWith('demo-')));
});
test('profile validation handles invalid time zones before date calculations', () => {
  const state = emptyState();
  assert.ok(validateProfile({ ...state.profile, birthDate: '1990-01-01', timezone: 'not-a-zone' }, state.schedules, now));
  assert.equal(validateProfile({ ...state.profile, height: '178,5' }, state.schedules, now), '');
  state.schedules = [{ ...newSchedule(), frequency: 'weekly', days: [] }];
  assert.ok(validateProfile(state.profile, state.schedules, now));
});
test('home summary averages the last seven local calendar days, independently per metric', () => {
  const rows = [
    bp('outside', '2026-09-19T20:59:00Z', 200, 120, 110),
    bp('first-day', '2026-09-19T21:00:00Z', 120, 80, 60),
    bp('today-1', '2026-09-26T08:00:00Z', 140, 90, null),
    bp('today-2', '2026-09-26T09:00:00Z', 130, 85, 80),
    bp('future', '2026-09-26T13:00:00Z', 200, 120, 110),
    { id: 'w1', kind: 'weight', at: '2026-09-24T07:00:00Z', weight: 75 },
    { id: 'w2', kind: 'weight', at: '2026-09-26T07:00:00Z', weight: 77 },
  ];
  const result = sevenDaySummary(rows, 'Europe/Moscow', now);
  assert.deepEqual(result.bp, { avg: 130, lower: 85, min: 120, max: 140, count: 3, days: 2 });
  assert.equal(result.pulse.avg, 70); assert.equal(result.pulse.count, 2); assert.equal(result.pulse.days, 2);
  assert.equal(result.weight.avg, 76); assert.equal(result.weight.count, 2); assert.equal(result.weight.days, 2);
});
test('home summary does not fall back to stale readings or fill missing days with zero', () => {
  const old = bp('old', '2026-08-01T10:00:00Z');
  const empty = sevenDaySummary([old], 'Europe/Moscow', now);
  assert.equal(empty.bp.avg, null); assert.equal(empty.bp.count, 0); assert.equal(empty.weight.avg, null);
  const partial = sevenDaySummary([old, bp('only', '2026-09-26T10:00:00Z', 126, 81, 68)], 'Europe/Moscow', now);
  assert.equal(partial.bp.avg, 126); assert.equal(partial.bp.lower, 81); assert.equal(partial.bp.days, 1);
  assert.equal(summaryCoverage(partial.bp), '1 замер · 1 день');
  assert.equal(summaryCoverage({ count: 14, days: 7 }), '14 замеров · 7 дней');
  assert.equal(summaryCoverage({ count: 0, days: 0 }), 'Пока нет измерений');
});

test('monthly legacy alarms are disabled for choosing weekdays, never silently changed to daily', () => {
  const state = emptyState(); state.schedules = [{ ...newSchedule(), frequency: 'monthly', monthDay: 15 }];
  const loaded = loadState({ getItem: () => JSON.stringify(state) });
  assert.equal(loaded.error, ''); assert.equal(loaded.data.schedules[0].enabled, false);
  assert.deepEqual(loaded.data.schedules[0].days, []);
  assert.equal(loaded.data.schedules[0].frequency, 'weekly');
  assert.deepEqual(reminders(loaded.data, now), []);
});
