const decode = (row) =>
  row
    ? {
        ...JSON.parse(row.payload),
        status: row.status,
        capHash: row.cap_hash,
        fingerprint: row.fingerprint,
      }
    : null;
export function createStore(db) {
  const first = (sql, ...args) =>
    db
      .prepare(sql)
      .bind(...args)
      .first();
  return {
    async getByKey(key) {
      return decode(
        await first("SELECT * FROM bookings WHERE request_key=?", key),
      );
    },
    async getBooking(id) {
      return decode(await first("SELECT * FROM bookings WHERE id=?", id));
    },
    async reserve(b) {
      const row = await first(
        `INSERT INTO bookings (id,request_key,fingerprint,cap_hash,start,end,status,payload,created)
   SELECT ?,?,?,?,?,?,'pending',?,? WHERE NOT EXISTS (SELECT 1 FROM bookings WHERE status IN ('pending','confirmed') AND start < ? AND end > ?) AND NOT EXISTS (SELECT 1 FROM bookings WHERE request_key=?) RETURNING *`,
        b.id,
        b.key,
        b.fingerprint,
        b.capHash,
        Date.parse(b.start),
        Date.parse(b.end),
        JSON.stringify(b),
        b.created,
        Date.parse(b.end),
        Date.parse(b.start),
        b.key,
      );
      return decode(row);
    },
    async setStatus(id, status) {
      await db
        .prepare("UPDATE bookings SET status=? WHERE id=?")
        .bind(status, id)
        .run();
      return this.getBooking(id);
    },
    async updateInterval(booking, start, end) {
      const updated = {
        ...booking,
        start,
        end,
        duration: (Date.parse(end) - Date.parse(start)) / 60000,
      };
      await db
        .prepare(
          "UPDATE bookings SET start=?,end=?,payload=? WHERE id=? AND status=?",
        )
        .bind(
          Date.parse(start),
          Date.parse(end),
          JSON.stringify(updated),
          booking.id,
          "confirmed",
        )
        .run();
      return this.getBooking(booking.id);
    },
    async markConfirmed(id) {
      return this.setStatus(id, "confirmed");
    },
    async markFailed(id) {
      return this.setStatus(id, "failed");
    },
    async listBlocking(start, end) {
      return (
        await db
          .prepare(
            "SELECT * FROM bookings WHERE status IN ('pending','confirmed') AND start < ? AND end > ? ORDER BY start LIMIT 400",
          )
          .bind(end, start)
          .all()
      ).results.map(decode);
    },
    async listPending() {
      return (
        await db
          .prepare(
            "SELECT * FROM bookings WHERE status='pending' ORDER BY created DESC LIMIT 100",
          )
          .bind()
          .all()
      ).results.map(decode);
    },
    async getSetting(key) {
      const row = await first("SELECT value FROM settings WHERE id=?", key);
      return row ? JSON.parse(row.value) : null;
    },
    async putSetting(key, value) {
      await db
        .prepare(
          "INSERT INTO settings (id,value) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
        )
        .bind(key, JSON.stringify(value))
        .run();
    },
    async cleanup(now) {
      await db
        .prepare(
          "DELETE FROM bookings WHERE id IN (SELECT id FROM bookings WHERE end < ? AND status != 'pending' LIMIT 100)",
        )
        .bind(now - 90 * 86400000)
        .run();
      await db
        .prepare(
          "DELETE FROM rate_limits WHERE id IN (SELECT id FROM rate_limits WHERE expires < ? LIMIT 100)",
        )
        .bind(now)
        .run();
      await db
        .prepare("DELETE FROM oauth_states WHERE expires < ?")
        .bind(now)
        .run();
    },
  };
}
export async function digest(value) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
