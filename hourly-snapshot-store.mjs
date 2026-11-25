const hourMs = 60 * 60 * 1000;
const leaseMs = 45_000;

export function refreshHour(time) {
  return Math.floor(time / hourMs) * hourMs;
}

const columns = 'source_key AS id, entries, checked_at AS checkedAt, updated_at AS updatedAt, failed, lease_until AS leaseUntil';

// Each table name is fixed by its exported store, and never comes from a request.
function hourlyStore(table) {
  async function readAll(db) {
    const {results} = await db.prepare(`SELECT ${columns} FROM ${table}`).bind().all();
    return new Map(results.map(row => [row.id, row]));
  }

  async function refresh(db, id, load, now) {
    const startedAt = now();
    const token = crypto.randomUUID();
    const claim = await db.prepare(
      `INSERT INTO ${table} (source_key, lease_token, lease_until) VALUES (?, ?, ?) `
      + 'ON CONFLICT(source_key) DO UPDATE SET lease_token = excluded.lease_token, lease_until = excluded.lease_until '
      + 'WHERE lease_until <= ? AND (checked_at IS NULL OR checked_at < ?)',
    ).bind(id, token, startedAt + leaseMs, startedAt, refreshHour(startedAt)).run();

    if (claim.meta.changes) {
      let entries;
      try {
        const result = await load();
        if (result != null) entries = JSON.stringify(result);
      } catch { /* Preserve the last successful snapshot. */ }
      if (entries !== undefined) {
        await db.prepare(
          `UPDATE ${table} SET entries = ?, checked_at = ?, updated_at = ?, `
          + 'failed = 0, lease_token = NULL, lease_until = 0 WHERE source_key = ? AND lease_token = ?',
        ).bind(entries, startedAt, now(), id, token).run();
      } else {
        await db.prepare(
          `UPDATE ${table} SET checked_at = ?, failed = 1, lease_token = NULL, lease_until = 0 `
          + 'WHERE source_key = ? AND lease_token = ?',
        ).bind(startedAt, id, token).run();
      }
    }
    return db.prepare(`SELECT ${columns} FROM ${table} WHERE source_key = ?`).bind(id).first();
  }

  async function refreshWhenDue(db, id, previous, load, {now = Date.now, context, wait = false} = {}) {
    const time = now();
    if (previous?.checkedAt >= refreshHour(time) || previous?.leaseUntil > time) return previous;
    const task = refresh(db, id, load, now).catch(() => previous);
    if (!wait && typeof context?.waitUntil === 'function' && previous?.updatedAt != null) {
      context.waitUntil(task);
      return previous;
    }
    return task;
  }

  return {readAll, refreshWhenDue};
}

export const eventSnapshots = hourlyStore('neighborhood_event_snapshots');
export const weatherSnapshots = hourlyStore('weather_snapshots');
