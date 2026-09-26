import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, formTime, zonedIso, dayKey, selectRecords, stats, chartData, seriesMean, validateRecord, validateProfile, saveState, loadState, reminders, bmi, makeDemo, STORAGE_KEY, timeMetadata, recordTiming, sorted, localTimeCoordinate } from '../src/data.js';
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
test('charts and daily aggregation use display-local dates across midnight', () => {
  const rows = [bp('a', '2026-09-25T20:30:00Z'), bp('b', '2026-09-25T21:30:00Z')];
  const zone = 'Europe/Moscow';
  assert.equal(chartData(rows, 'bp', '90', zone).length, 2);
  assert.equal(chartData(rows, 'bp', '90', 'UTC').length, 1);
  assert.equal(localTimeCoordinate('2026-09-25T21:30:00Z', zone), Date.parse('2026-09-26T00:30:00Z'));
  assert.notEqual(localTimeCoordinate(rows[1].at, zone), Date.parse(rows[1].at));
});
test('optional pulse is not counted as zero and pressure summaries use actual samples', () => {
  const rows = [bp('a', '2026-09-25T10:00:00Z', 120, 80, 60), bp('b', '2026-09-26T10:00:00Z', 140, 90, null)];
  assert.equal(stats(rows, 'pulse').avg, 60);
  assert.deepEqual(stats(rows, 'bp'), { avg: 130, lower: 85, min: 120, max: 140, count: 2 });
});
test('aggregation uses chronological day groups, series keeps individual measurements', () => {
  const rows = [bp('b', '2026-09-26T10:00:00Z', 140, 90), bp('a', '2026-09-26T08:00:00Z', 120, 80)].map(r => ({ ...r, seriesId: 'series' }));
  const points = chartData(rows, 'bp', '90', 'Europe/Moscow');
  assert.equal(points.length, 1); assert.equal(points[0].value, 130); assert.equal(points[0].count, 2);
  assert.equal(seriesMean(rows, 'series').lower, 85);
  assert.equal(rows.length, 2);
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
test('reminders follow time zone, selected weekdays, skip and snooze', () => {
  const state = emptyState(); state.profile.timezone = 'Europe/Moscow'; state.schedules.weight.enabled = false;
  const first = reminders(state, now)[0]; assert.equal(first.at, '2026-09-26T05:00:00.000Z'); assert.equal(first.overdue, true);
  state.reminderActions[first.key] = now + 30 * 60000;
  assert.equal(reminders(state, now)[0].at, '2026-09-26T12:30:00.000Z');
  state.reminderActions[first.key] = 'skip'; assert.equal(reminders(state, now)[0].at, '2026-09-26T17:00:00.000Z');
  state.schedules.bp.frequency = 'weekly'; state.schedules.bp.days = [1];
  assert.equal(dayKey(reminders(state, now)[0].at, 'Europe/Moscow'), '2026-09-28');
});
test('BMI only calculated with height and weight; demo contains past synthetic records', () => {
  assert.equal(bmi(75, 0), null); assert.ok(Math.abs(bmi(75, 180) - 23.148148) < .0001);
  const demo = makeDemo(now); assert.ok(demo.records.length > 20); assert.ok(demo.records.every(r => Date.parse(r.at) <= now && r.id.startsWith('demo-')));
});
test('profile validation handles invalid time zones before date calculations', () => {
  const state = emptyState();
  assert.ok(validateProfile({ ...state.profile, birthDate: '1990-01-01', timezone: 'not-a-zone' }, state.schedules, now));
  assert.equal(validateProfile({ ...state.profile, height: '178,5' }, state.schedules, now), '');
  state.schedules.bp.frequency = 'weekly'; state.schedules.bp.days = [];
  assert.ok(validateProfile(state.profile, state.schedules, now));
});
