import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
const SCHEMA_SQL = readFileSync(
  new URL("../migrations/0000.sql", import.meta.url),
  "utf8",
);
export function memoryDb() {
  const sql = new DatabaseSync(":memory:");
  sql.exec(SCHEMA_SQL);
  return {
    prepare(query) {
      const stmt = sql.prepare(query);
      return {
        bind(...args) {
          return {
            first: async () => stmt.get(...args) || null,
            all: async () => ({ results: stmt.all(...args) }),
            run: async () => ({ meta: { changes: stmt.run(...args).changes } }),
          };
        },
      };
    },
  };
}
