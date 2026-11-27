import { authorizeKaptSync } from './kapt-notice-auth.mjs';
import { KaptSourceError, kaptSeoulDay, loadKaptBids, loadKaptFees } from './kapt-notice-source.mjs';
import { noticeFailure, noticeJson, noticeUnsupported } from './notice-http.mjs';

export const kaptNoticeSyncPath = '/api/apartment-notices/kapt-sync';
const leaseMs = 2 * 60_000;
const retryMs = 15 * 60_000;
const sources = ['fees', 'bids', 'results'];

async function publishNotices(db, run, notices, now) {
  let published = 0;
  const batchSize = 15;
  for (let offset = 0; offset < notices.length; offset += batchSize) {
    const time = now();
    if (kaptSeoulDay(time) !== run.day) break;
    const statements = notices.slice(offset, offset + batchSize).flatMap(post => [
      db.prepare(`INSERT INTO apartment_notices (title, body, created_at, source_key, source_url)
        SELECT ?, ?, ?, ?, ?
        WHERE EXISTS (SELECT 1 FROM kapt_notice_sync WHERE source = ? AND day = ? AND token = ? AND retry_at > ?)
          AND NOT EXISTS (SELECT 1 FROM kapt_notice_publications WHERE source_key = ?)`)
        .bind(post.title, post.body, time, post.sourceKey, post.sourceUrl, run.source, run.day, run.token, time, post.sourceKey),
      db.prepare(`INSERT OR IGNORE INTO kapt_notice_publications (source_key)
        SELECT source_key FROM apartment_notices WHERE source_key = ?`).bind(post.sourceKey),
    ]);
    const results = await db.batch(statements);
    published += results.filter((_, index) => index % 2 === 0).reduce((count, result) => count + result.meta.changes, 0);
  }
  return published;
}

async function syncSource(db, source, day, key, fetcher, now) {
  const startedAt = now();
  const token = crypto.randomUUID();
  const { meta } = await db.prepare(`INSERT INTO kapt_notice_sync (source, day, token, retry_at, state)
    VALUES (?, ?, ?, ?, 'running') ON CONFLICT (source) DO UPDATE SET
      day = excluded.day, token = excluded.token, retry_at = excluded.retry_at, state = 'running', published = 0
    WHERE kapt_notice_sync.day < excluded.day OR
      (kapt_notice_sync.day = excluded.day AND kapt_notice_sync.state <> 'ok' AND kapt_notice_sync.retry_at <= ?)`)
    .bind(source, day, token, startedAt + leaseMs, startedAt).run();
  if (!meta.changes) {
    const previous = await db.prepare('SELECT state, published FROM kapt_notice_sync WHERE source = ? AND day = ?').bind(source, day).first();
    return { source, ...(previous ?? { state: 'superseded', published: 0 }) };
  }

  // Keep deliberately deleted months in this set so the next run won't recreate them.
  const periods = source === 'fees' ? await db.prepare("SELECT source_key FROM kapt_notice_publications WHERE source_key LIKE 'fees:%'").bind().all() : null;
  let state = 'ok';
  let notices;
  try {
    notices = source === 'fees'
      ? await loadKaptFees(fetcher, key, day, new Set(periods.results.map(row => row.source_key)))
      : await loadKaptBids(fetcher, key, source, day);
  } catch (error) {
    state = error instanceof KaptSourceError ? error.code : 'upstream_unavailable';
  }

  const published = notices?.length ? await publishNotices(db, { source, day, token }, notices, now) : 0;
  const finishedAt = now();
  if (kaptSeoulDay(finishedAt) !== day) return { source, state: 'superseded', published };
  const result = await db.prepare(`UPDATE kapt_notice_sync SET state = ?, published = ?, retry_at = ?
    WHERE source = ? AND day = ? AND token = ? AND retry_at > ?`)
    .bind(state, published, finishedAt + retryMs, source, day, token, finishedAt).run();
  return { source, state: result.meta.changes ? state : 'superseded', published };
}

function decodeKey(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

export async function syncKaptNotices(request, env, { fetcher = fetch, keyFetcher = fetch, now = Date.now } = {}) {
  if (request.method !== 'POST') return noticeUnsupported('POST');
  try {
    if (!await authorizeKaptSync(request, keyFetcher, now())) return noticeFailure('sync_access_denied', 401);
  } catch {
    return noticeFailure('sync_auth_unavailable', 503);
  }
  if (!env.DB) return noticeFailure('notice_store_unavailable', 503);
  const day = kaptSeoulDay(now());
  const key = decodeKey(env.DATA_GO_KR_KEY?.trim() ?? '');
  if (!key) return noticeJson({ day, sources: sources.map(source => ({ source, state: 'key_unconfigured', published: 0 })) });
  const results = await Promise.allSettled(sources.map(source => syncSource(env.DB, source, day, key, fetcher, now)));
  if (results.some(result => result.status === 'rejected')) return noticeFailure('notice_store_unavailable', 503);
  return noticeJson({ day, sources: results.map(result => result.value) });
}
