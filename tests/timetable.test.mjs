import test from 'node:test';
import assert from 'node:assert/strict';
import * as timetable from '../lib/client/timetable.mjs';
const { buildTimetable, weekDates } = timetable;
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

test('elapsed and closed times are not presented as calendar occupancy', () => {
  const dates = ['2026-10-26','2026-10-27','2026-10-28'];
  const now = Date.parse('2026-10-26T16:15:00Z'); // 12:15 New York
  const slots = [slot('2026-10-27T14:00:00Z'), slot('2026-10-27T17:30:00Z')];
  const busy = [slot('2026-10-26T14:00:00Z'),slot('2026-10-26T17:00:00Z')];
  const rows = buildTimetable(slots, 'America/New_York', dates, {busy,now});
  assert.equal(rows.find(r=>r.minute===600).states?.[0], 'past');
  assert.equal(rows.find(r=>r.minute===720).states?.[0], 'past');
  assert.equal(rows.find(r=>r.minute===780).states?.[0], 'busy');
  assert.equal(rows.find(r=>r.minute===810).states?.[0], 'unavailable');
  assert.equal(rows.find(r=>r.minute===600).states?.[1], 'available');
  assert.equal(rows.find(r=>r.minute===780).states?.[2], 'unavailable');
});

test('a slot that expires while the page is open is no longer selectable', () => {
  const slots = [slot('2026-10-26T14:00:00Z'),slot('2026-10-26T14:30:00Z')];
  const rows = buildTimetable(slots, 'America/New_York', ['2026-10-26'], {
    now: Date.parse('2026-10-26T14:00:00Z'),
  });
  assert.equal(rows[0].cells[0].length,0);
  assert.equal(rows[0].states?.[0],'past');
  assert.equal(rows[1].cells[0][0],slots[1]);
});

test('a 60-minute start blocked by a later meeting does not invent an extra busy half-hour', () => {
  const slots = [{start:'2026-10-27T14:00:00Z',end:'2026-10-27T15:00:00Z'},
    {start:'2026-10-27T16:00:00Z',end:'2026-10-27T17:00:00Z'}];
  const rows = buildTimetable(slots, 'America/New_York', ['2026-10-27'], {
    now: Date.parse('2026-10-26T20:00:00Z'),
    busy: [{start:'2026-10-27T15:00:00Z',end:'2026-10-27T16:00:00Z'}],
  });
  assert.equal(rows.find(r=>r.minute===630).states?.[0], 'unavailable'); // 10:30 cannot fit an hour
  assert.equal(rows.find(r=>r.minute===660).states?.[0], 'busy');
  assert.equal(rows.find(r=>r.minute===690).states?.[0], 'busy');
  assert.equal(rows.find(r=>r.minute===720).states?.[0], 'available'); // touching end is not overlap
});

test('busy blocks use absolute overlap in quarter-hour timezones and across midnight', () => {
  const rows = buildTimetable([slot('2026-10-26T18:00:00Z'),slot('2026-10-26T19:00:00Z'),slot('2026-10-27T18:30:00Z')],
    'Asia/Kathmandu', ['2026-10-26','2026-10-27','2026-10-28'], {
      now: Date.parse('2026-10-26T17:00:00Z'),
      busy: [{start:'2026-10-26T18:40:00Z',end:'2026-10-26T18:50:00Z'}],
    });
  assert.equal(rows.find(r=>r.minute===15).states?.[1], 'busy');
  assert.equal(rows.find(r=>r.minute===15).states?.[0], 'past');
});

test('a later DST occurrence remains available after the first wall-time occurrence expires', () => {
  const first = slot('2026-11-01T05:30:00Z'), second = slot('2026-11-01T06:30:00Z');
  const rows = buildTimetable([first, second], 'America/New_York', ['2026-11-01'], {
    now: Date.parse('2026-11-01T05:45:00Z'), busy:[first],
  });
  assert.deepEqual(rows[0].cells[0], [second]);
  assert.equal(rows[0].states?.[0], 'available');
});

test('dates outside the booking horizon and DST gaps stay disabled rather than busy', () => {
  const rows = buildTimetable([slot('2026-03-07T06:30:00Z'),slot('2026-03-07T08:00:00Z')],
    'America/New_York', ['2026-03-07','2026-03-08','2026-03-09'], {
      now: Date.parse('2026-03-07T00:00:00Z'), validDates:['2026-03-07','2026-03-08'],
      busy:[{start:'2026-03-09T00:00:00Z',end:'2026-03-10T00:00:00Z'}],
    });
  assert.equal(rows.find(r=>r.minute===120).states?.[1], 'unavailable');
  assert.equal(rows.find(r=>r.minute===120).states?.[2], 'unavailable');
});

test('weeks always begin on Monday, including Sunday and year boundaries', () => {
  assert.equal(timetable.mondayOfWeek?.('2026-10-29'), '2026-10-26');
  assert.equal(timetable.mondayOfWeek?.('2026-11-01'), '2026-10-26');
  assert.equal(timetable.mondayOfWeek?.('2026-10-26'), '2026-10-26');
  assert.equal(timetable.mondayOfWeek?.('2027-01-01'), '2026-12-28');
  assert.deepEqual(weekDates(timetable.mondayOfWeek('2026-10-29'), 3),
    ['2026-11-16','2026-11-17','2026-11-18','2026-11-19','2026-11-20','2026-11-21','2026-11-22']);
});

test('hourly overview halves the row count while keeping every real start time', () => {
  const slots = Array.from({length:26},(_,i)=>slot(new Date(Date.UTC(2026,9,27,14,i*30)).toISOString()));
  const detailed = buildTimetable(slots,'America/New_York',['2026-10-27']);
  const overview = timetable.hourlyTimetable?.(detailed);
  assert.equal(overview?.length,13);
  assert.deepEqual(overview.flatMap(row=>row.cells[0].slots),slots);
});

test('hourly overview preserves partial occupancy without claiming an entire hour is busy', () => {
  const open=slot('2026-10-27T17:00:00Z');
  const detailed=buildTimetable([open,slot('2026-10-27T18:00:00Z')],'America/New_York',['2026-10-27'],{
    now:Date.parse('2026-10-26T20:00:00Z'), busy:[slot('2026-10-27T17:30:00Z')],
  });
  const overview=timetable.hourlyTimetable?.(detailed);
  assert.deepEqual(overview?.[0].cells[0].parts.map(part=>part.state),['available','busy']);
  assert.deepEqual(overview[0].cells[0].slots,[open]);
});

test('hour grouping keeps DST repeats and quarter-hour starts as distinct exact choices', () => {
  const first=slot('2026-11-01T05:30:00Z'),second=slot('2026-11-01T06:30:00Z');
  const repeated=timetable.hourlyTimetable?.(buildTimetable([second,first],'America/New_York',['2026-11-01']));
  assert.deepEqual(repeated?.[0].cells[0].slots,[first,second]);
  const quarter=slot('2026-10-27T14:00:00Z');
  const shifted=timetable.hourlyTimetable(buildTimetable([quarter],'Asia/Kathmandu',['2026-10-27']));
  assert.equal(shifted[0].minute,19*60);
  assert.equal(shifted[0].cells[0].parts[0].minute,19*60+45);
  assert.deepEqual(shifted[0].cells[0].slots,[quarter]);
});
