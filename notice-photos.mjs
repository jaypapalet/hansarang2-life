import { noticeFailure, noticeHeaders, readNoticeBytes } from './notice-http.mjs';

const imageTypes = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp' };
const maxPhotoBytes = 2 * 1024 * 1024;
const stagingPeriod = 60 * 60 * 1000;
export const noticePhotoKey = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}\.(?:jpg|png|webp)$/;

function fileFormat(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer);
  const startsWith = signature => signature.every((byte, index) => byte === bytes[index]);
  if (bytes.length >= 4 && startsWith([0xff, 0xd8, 0xff])) return 'jpg';
  if (bytes.length >= 24 && startsWith([137, 80, 78, 71, 13, 10, 26, 10])
    && String.fromCharCode(...bytes.subarray(12, 16)) === 'IHDR') return 'png';
  if (bytes.length >= 20 && String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
    && ['VP8 ', 'VP8L', 'VP8X'].includes(String.fromCharCode(...bytes.subarray(12, 16)))) return 'webp';
  return null;
}

export async function readNoticePhotoForm(request) {
  const blob = await readNoticeBytes(request, maxPhotoBytes + 48 * 1024);
  if (!blob) return null;
  try {
    const form = await new Response(blob, { headers: { 'Content-Type': request.headers.get('Content-Type') } }).formData();
    const files = form.getAll('photo');
    if (files.length > 1) return null;
    const file = files[0];
    const removePhoto = form.get('removePhoto') === 'true';
    let photo = null;
    if (file !== undefined) {
      if (removePhoto || typeof file === 'string' || !file.size || file.size > maxPhotoBytes) return null;
      const bytes = await file.arrayBuffer();
      const extension = fileFormat(bytes);
      if (!extension || (file.type && file.type !== 'application/octet-stream' && file.type !== imageTypes[extension])) return null;
      photo = { bytes, extension };
    }
    return { title: form.get('title'), body: form.get('body'), revision: Number(form.get('revision')), photo, removePhoto };
  } catch {
    return null;
  }
}

export async function stageNoticePhoto(db, bucket, photo) {
  const key = `${crypto.randomUUID()}.${photo.extension}`;
  const generation = crypto.randomUUID();
  await db.prepare('INSERT INTO notice_photo_cleanup (photo_key, generation, ready_at, retain) VALUES (?, ?, ?, 1)')
    .bind(key, generation, Date.now() + stagingPeriod).run();
  try {
    await bucket.put(key, photo.bytes, { httpMetadata: { contentType: imageTypes[photo.extension] } });
  } catch (error) {
    await discardStagedNoticePhoto(db, key, true);
    throw error;
  }
  return { key, generation };
}

export function queueOldNoticePhoto(db, id, revision, guard, args) {
  return db.prepare(`INSERT OR IGNORE INTO notice_photo_cleanup (photo_key, generation, ready_at)
    SELECT photo_key, ?, ? FROM apartment_notices WHERE id = ? AND revision = ? AND photo_key IS NOT NULL${guard}`)
    .bind(crypto.randomUUID(), Date.now(), id, revision, ...args);
}

export async function discardStagedNoticePhoto(db, key, uploadUncertain = false) {
  const readyAt = Date.now() + (uploadUncertain ? stagingPeriod : 0);
  await db.prepare(`INSERT INTO notice_photo_cleanup (photo_key, generation, ready_at, claimed, retain)
    SELECT ?, ?, ?, 1, ? WHERE NOT EXISTS (SELECT 1 FROM apartment_notices WHERE photo_key = ?)
    ON CONFLICT(photo_key) DO UPDATE SET generation = excluded.generation, ready_at = excluded.ready_at,
      claimed = 1, retain = excluded.retain`).bind(key, crypto.randomUUID(), readyAt, Number(uploadUncertain), key).run();
}

export async function cleanNoticePhotos(db, bucket) {
  if (!bucket) return;
  try {
    const { results } = await db.prepare(`SELECT photo_key AS photoKey, generation, retain FROM notice_photo_cleanup
      WHERE ready_at <= ? ORDER BY ready_at LIMIT 8`).bind(Date.now()).all();
    for (const { photoKey, generation, retain } of results) {
      try {
        const { meta } = await db.prepare(`UPDATE notice_photo_cleanup SET claimed = 1
          WHERE photo_key = ? AND generation = ? AND ready_at <= ?
          AND NOT EXISTS (SELECT 1 FROM apartment_notices WHERE photo_key = ?)`).bind(photoKey, generation, Date.now(), photoKey).run();
        if (!meta.changes) continue;
        await bucket.delete(photoKey);
        if (retain) {
          // An unfinished upload can still write this object after deletion.
          await db.prepare('UPDATE notice_photo_cleanup SET ready_at = ? WHERE photo_key = ? AND generation = ?')
            .bind(Date.now() + stagingPeriod, photoKey, generation).run();
        } else {
          await db.prepare('DELETE FROM notice_photo_cleanup WHERE photo_key = ? AND generation = ?').bind(photoKey, generation).run();
        }
      } catch {
        // A later write can retry the same deletion.
      }
    }
  } catch {
    // The notice write has already completed. Cleanup can retry independently.
  }
}

export async function serveNoticePhoto(request, env, key) {
  if (!env.DB || !env.NOTICE_PHOTOS) return noticeFailure('notice_store_unavailable', 503);
  const published = await env.DB.prepare('SELECT id FROM apartment_notices WHERE photo_key = ?').bind(key).first();
  if (!published) return noticeFailure('not_found', 404);
  const object = await env.NOTICE_PHOTOS.get(key);
  if (!object) return noticeFailure('not_found', 404);
  const contentType = imageTypes[key.split('.').at(-1)];
  return new Response(request.method === 'HEAD' ? null : object.body, { headers: { ...noticeHeaders, 'Content-Type': contentType } });
}
