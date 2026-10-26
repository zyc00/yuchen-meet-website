import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../database.mjs';
import { createStore } from '../lib/booking/store.mjs';
test('SQLite keeps pending holds across process restart and does not replay its schema', async () => {
  const directory=mkdtempSync(join(tmpdir(),'meeting-sqlite-'));
  const file=join(directory,'database.sqlite');
  let db;
  try {
    db=openDatabase(file);
    await createStore(db).putSetting('schedule',{enabled:false});
    await createStore(db).reserve({id:'one',eventId:'bone',key:'key',fingerprint:'f',capHash:'hash',created:Date.now(),start:'2026-11-01T15:00:00Z',end:'2026-11-01T15:30:00Z',name:'Test',email:'test@example.com'});
    db.close();db=openDatabase(file);
    assert.equal((await createStore(db).getBooking('one')).status,'pending');
    assert.equal((await createStore(db).getSetting('schedule')).enabled,false);
  } finally {db?.close();rmSync(directory,{recursive:true,force:true});}
});
