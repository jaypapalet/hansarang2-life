import { getNoticeUser, noticeAccounts } from './notice-accounts.mjs';
import { noticeFailure, noticeHeaders, noticeJson, noticeOriginMatches, noticeUnsupported, readNoticeJson } from './notice-http.mjs';
import { cleanNoticePhotos, discardStagedNoticePhoto, noticePhotoKey, queueOldNoticePhoto, readNoticePhotoForm, serveNoticePhoto, stageNoticePhoto } from './notice-photos.mjs';

const boardPath = '/api/apartment-notices';
const adminPath = `${boardPath}/admin`;
const authPath = `${boardPath}/auth`;
const mediaPath = `${boardPath}/photo/`;
const pageSize = 10;

function positiveId(value) {
  return Number.isSafeInteger(value) && value > 0;
}

async function listNotices(db, url, admin) {
  const page = Number(url.searchParams.get('page') ?? '1');
  if (!positiveId(page) || !Number.isSafeInteger(page * pageSize)) return noticeFailure('invalid_page', 400);
  const columns = 'id, title, body, created_at AS createdAt, photo_key AS photoKey';
  const { results } = await db.prepare(`SELECT ${columns}${admin ? ', revision' : ''}
    FROM apartment_notices ORDER BY id DESC LIMIT ? OFFSET ?`).bind(pageSize + 1, (page - 1) * pageSize).all();
  const posts = results.slice(0, pageSize).map(({ photoKey, ...post }) => ({ ...post, photoUrl: photoKey ? `${mediaPath}${photoKey}` : null }));
  return noticeJson({ posts, hasNext: results.length > pageSize });
}

async function commitNotice(db, { id, revision, title, content, removePost, replacePhoto, current, staged }) {
  const gate = staged ? `EXISTS (SELECT 1 FROM notice_photo_cleanup
    WHERE photo_key = ? AND generation = ? AND claimed = 0 AND ready_at > ?)` : '';
  const args = staged ? [staged.key, staged.generation, Date.now()] : [];
  const extraWhere = staged ? ` AND ${gate}` : '';
  const key = staged?.key ?? (replacePhoto ? null : current?.photoKey ?? null);
  const statements = [];
  if (current?.photoKey && replacePhoto) statements.push(queueOldNoticePhoto(db, id, revision, extraWhere, args));

  const writeIndex = statements.length;
  if (removePost) {
    statements.push(db.prepare('DELETE FROM apartment_notices WHERE id = ? AND revision = ?').bind(id, revision));
  } else if (id) {
    statements.push(db.prepare(`UPDATE apartment_notices SET title = ?, body = ?, photo_key = ?, revision = revision + 1
      WHERE id = ? AND revision = ?${extraWhere}`).bind(title, content, key, id, revision, ...args));
  } else {
    statements.push(db.prepare(`INSERT INTO apartment_notices (title, body, created_at, photo_key)
      SELECT ?, ?, ?, ?${gate ? ` WHERE ${gate}` : ''}`).bind(title, content, Date.now(), key, ...args));
  }
  if (staged) {
    statements.push(db.prepare(`DELETE FROM notice_photo_cleanup WHERE photo_key = ? AND generation = ?
      AND EXISTS (SELECT 1 FROM apartment_notices WHERE photo_key = ?)`).bind(staged.key, staged.generation, staged.key));
  }
  const results = await db.batch(statements);
  return results[writeIndex].meta;
}

async function writeNotice(request, db, bucket, id) {
  const removePost = request.method === 'DELETE';
  const multipart = !removePost && request.headers.get('Content-Type')?.toLowerCase().startsWith('multipart/form-data;');
  const body = multipart ? await readNoticePhotoForm(request) : await readNoticeJson(request);
  if (!body) return noticeFailure(multipart ? 'photo_invalid' : 'invalid_post', 400);
  if (id && !positiveId(body.revision)) return noticeFailure('invalid_post', 400);
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const content = typeof body.body === 'string' ? body.body.replaceAll(/\r\n?/g, '\n').trim() : '';
  if (!removePost && (!title || title.length > 120 || /[\r\n]/.test(title) || !content || content.length > 6000)) {
    return noticeFailure('invalid_post', 400);
  }

  const current = id ? await db.prepare('SELECT photo_key AS photoKey FROM apartment_notices WHERE id = ? AND revision = ?')
    .bind(id, body.revision).first() : null;
  if (id && !current) return noticeFailure('post_changed', 409);
  const photo = multipart ? body.photo : null;
  if (photo && !bucket) return noticeFailure('photo_store_unavailable', 503);
  const staged = photo ? await stageNoticePhoto(db, bucket, photo) : null;
  const replacePhoto = removePost || Boolean(staged) || body.removePhoto === true;
  let meta;
  try {
    meta = await commitNotice(db, { id, revision: body.revision, title, content, removePost, replacePhoto, current, staged });
  } catch (error) {
    if (staged) {
      await discardStagedNoticePhoto(db, staged.key);
      await cleanNoticePhotos(db, bucket);
    }
    throw error;
  }
  if (staged && !meta.changes) await discardStagedNoticePhoto(db, staged.key);
  await cleanNoticePhotos(db, bucket);
  if (!meta.changes) return noticeFailure('post_changed', 409);
  return id ? new Response(null, { status: 204, headers: noticeHeaders }) : noticeJson({ id: meta.last_row_id }, 201);
}

export async function apartmentNotices(request, env) {
  const url = new URL(request.url);
  const { method } = request;
  const path = url.pathname;
  if (path === authPath || path.startsWith(`${authPath}/`)) return noticeAccounts(request, env);

  const publicBoard = path === boardPath;
  const adminBoard = path === adminPath;
  const photo = path.startsWith(mediaPath) && path.slice(mediaPath.length);
  const id = Number(path.match(/^\/api\/apartment-notices\/admin\/([1-9][0-9]*)$/)?.[1]);
  if (!publicBoard && !adminBoard && !positiveId(id) && !(photo && noticePhotoKey.test(photo))) return noticeFailure('not_found', 404);

  const db = env.DB;
  try {
    if (photo) {
      if (!['GET', 'HEAD'].includes(method)) return noticeUnsupported('GET, HEAD');
      return await serveNoticePhoto(request, env, photo);
    }
    if (publicBoard) {
      if (method === 'HEAD') return new Response(null, { headers: noticeHeaders });
      if (method !== 'GET') return noticeUnsupported('GET, HEAD');
    } else {
      if (!db) return noticeFailure('notice_store_unavailable', 503);
      if (!await getNoticeUser(request, db)) return noticeFailure('sign_in_required', 401);
      if (adminBoard && !['GET', 'POST'].includes(method)) return noticeUnsupported('GET, POST');
      if (!adminBoard && !['PUT', 'DELETE'].includes(method)) return noticeUnsupported('PUT, DELETE');
      if (method !== 'GET' && !noticeOriginMatches(request)) return noticeFailure('invalid_origin', 403);
    }
    if (!db) return noticeFailure('notice_store_unavailable', 503);
    return method === 'GET' ? await listNotices(db, url, adminBoard) : await writeNotice(request, db, env.NOTICE_PHOTOS, adminBoard ? null : id);
  } catch {
    return noticeFailure('notice_store_unavailable', 503);
  }
}
