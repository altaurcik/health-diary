import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyState, formTime, zonedIso, dayKey, selectRecords, stats, chartData, seriesMean, validateRecord, validateProfile, saveState, loadState, reminders, bmi, makeDemo, STORAGE_KEY } from '../src/data.js';
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
test('calendar windows honor the profile time zone and include first day', () => {
  const rows = [bp('a', '2026-09-19T20:59:00Z'), bp('b', '2026-09-19T21:00:00Z'), bp('c', '2026-09-26T10:00:00Z')];
  assert.deepEqual(selectRecords(rows, 'bp', '7', 'Europe/Moscow', now).map(r => r.id), ['c', 'b']);
  assert.equal(selectRecords(rows, 'pulse', 'all', 'Europe/Moscow', now).length, 0);
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
