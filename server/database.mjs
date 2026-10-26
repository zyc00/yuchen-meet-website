import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
export function openDatabase(path) {
  const sql = new DatabaseSync(path);
  sql.exec('PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  if (sql.prepare('PRAGMA user_version').get().user_version === 0) {
    sql.exec('BEGIN IMMEDIATE');
    try {
      sql.exec(readFileSync(new URL('./migrations/0000.sql', import.meta.url),'utf8'));
      sql.exec('PRAGMA user_version=1; COMMIT');
    } catch (error) { sql.exec('ROLLBACK'); throw error; }
  }
  return {
    prepare(query) {
      const statement = sql.prepare(query);
      return { bind(...args) { return {
        first: async () => statement.get(...args) || null,
        all: async () => ({results:statement.all(...args)}),
        run: async () => ({meta:{changes:Number(statement.run(...args).changes)}}),
      }; } };
    },
    close: () => sql.close(),
  };
}
