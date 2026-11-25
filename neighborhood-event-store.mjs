const hourMs = 60 * 60 * 1000;
const leaseMs = 45_000;

export function eventRefreshHour(time) {
  return Math.floor(time / hourMs) * hourMs;
}

const columns = 'source_key AS id, entries, checked_at AS checkedAt, updated_at AS updatedAt, failed, lease_until AS leaseUntil';

export async function readEventSnapshots(db) {
  const {results} = await db.prepare('SELECT ' + columns + ' FROM neighborhood_event_snapshots').bind().all();
  return new Map(results.map(row => [row.id, row]));
}

export async function refreshEventSnapshot(db, id, load, now) {
  const startedAt = now();
  const token = crypto.randomUUID();
  const claim = await db.prepare(
    'INSERT INTO neighborhood_event_snapshots (source_key, lease_token, lease_until) VALUES (?, ?, ?) '
    + 'ON CONFLICT(source_key) DO UPDATE SET lease_token = excluded.lease_token, lease_until = excluded.lease_until '
    + 'WHERE lease_until <= ? AND (checked_at IS NULL OR checked_at < ?)',
  ).bind(id, token, startedAt + leaseMs, startedAt, eventRefreshHour(startedAt)).run();

  if (claim.meta.changes) {
    let entries = null;
    try {
      const result = await load();
      if (Array.isArray(result)) entries = JSON.stringify(result);
    } catch { /* Preserve the last successful snapshot. */ }
    if (entries !== null) {
      await db.prepare(
        'UPDATE neighborhood_event_snapshots SET entries = ?, checked_at = ?, updated_at = ?, '
        + 'failed = 0, lease_token = NULL, lease_until = 0 WHERE source_key = ? AND lease_token = ?',
      ).bind(entries, startedAt, now(), id, token).run();
    } else {
      await db.prepare(
        'UPDATE neighborhood_event_snapshots SET checked_at = ?, failed = 1, lease_token = NULL, lease_until = 0 '
        + 'WHERE source_key = ? AND lease_token = ?',
      ).bind(startedAt, id, token).run();
    }
  }
  return db.prepare('SELECT ' + columns + ' FROM neighborhood_event_snapshots WHERE source_key = ?').bind(id).first();
}
