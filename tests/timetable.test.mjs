import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTimetable, weekDates } from '../lib/client/timetable.mjs';
const slot = (start) => ({ start, end: new Date(Date.parse(start) + 30 * 60000).toISOString() });
test('week dates cross months and the last partial booking week remains reachable', () => {
  assert.deepEqual(weekDates('2026-10-26', 0), ['2026-10-26','2026-10-27','2026-10-28','2026-10-29','2026-10-30','2026-10-31','2026-11-01']);
  assert.equal(weekDates('2026-10-26', 3)[0], '2026-11-16');
});
test('only actual slots appear in cells; unavailable starts stay empty and other weeks are excluded', () => {
  const dates = weekDates('2026-10-26', 0);
  const slots = [slot('2026-10-26T14:00:00Z'),slot('2026-10-26T15:00:00Z'),slot('2026-11-03T14:00:00Z')];
  const rows = buildTimetable(slots, 'America/New_York', dates);
  assert.equal(rows[0].minute, 600);
  assert.equal(rows[0].cells[0][0], slots[0]);
  assert.equal(rows.find(row => row.minute === 630).cells[0].length, 0);
  assert.equal(rows[0].cells[1].length, 0);
  assert.equal(rows.flatMap(row => row.cells.flat()).length, 2);
  assert.deepEqual(buildTimetable([], 'America/New_York', dates), []);
});
test('quarter-hour offsets keep their true wall times', () => {
  const rows = buildTimetable([slot('2026-10-26T14:00:00Z'),slot('2026-10-26T14:30:00Z')], 'Asia/Kathmandu', ['2026-10-26']);
  assert.deepEqual(rows.map(row=>row.minute), [19*60+45,20*60+15]);
});
test('DST repeated wall times retain both distinct instants in chronological order', () => {
  const a=slot('2026-11-01T05:30:00Z'), b=slot('2026-11-01T06:30:00Z');
  const rows=buildTimetable([b,a], 'America/New_York', ['2026-11-01']);
  assert.equal(rows.length,1);
  assert.deepEqual(rows[0].cells[0].map(s=>s.start),[a.start,b.start]);
});
test('timezone conversion assigns a slot to the visitor’s date', () => {
  const s=slot('2026-10-27T02:00:00Z');
  const rows=buildTimetable([s], 'Asia/Shanghai', ['2026-10-26','2026-10-27']);
  assert.equal(rows[0].cells[0].length,0);
  assert.equal(rows[0].cells[1][0],s);
});
