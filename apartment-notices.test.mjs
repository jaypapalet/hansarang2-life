import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { apartmentNotices } from './apartment-notices.mjs';
import { openLocalNoticeDatabase } from './apartment-notices-local.mjs';
import { cleanNoticePhotos } from './notice-photos.mjs';

const origin = 'https://resident.example';
const board = '/api/apartment-notices';
const manage = `${board}/admin`;
const auth = `${board}/auth`;
const draft = { title: '정기 소독 안내', body: '1층을 먼저 방문합니다.\n현관 앞을 비워 주세요.' };
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9KsAAAAASUVORK5CYII=', 'base64');

function request(path, { method = 'GET', headers, body, cookie } = {}) {
  const isForm = body instanceof FormData;
  return new Request(`${origin}${path}`, {
    method,
    headers: {
      ...(method !== 'GET' && { Origin: origin }),
      ...(body && !isForm && { 'Content-Type': 'application/json' }),
      ...(cookie && { Cookie: cookie }),
      ...headers,
    },
    body: isForm ? body : body ? JSON.stringify(body) : undefined,
  });
}

async function adminSetup(db) {
  const initialPassword = 'ab'.repeat(32);
  const env = { DB: db, NOTICE_INITIAL_PASSWORD: initialPassword };
  const setup = await apartmentNotices(request(`${auth}/setup`, { method: 'POST', body: { username: 'manager', password: initialPassword } }), env);
  assert.equal(setup.status, 201);
  return { env, cookie: setup.headers.get('Set-Cookie').split(';')[0] };
}

function memoryBucket() {
  const objects = new Map();
  return {
    objects,
    put: async (key, bytes) => objects.set(key, new Uint8Array(bytes)),
    get: async key => objects.has(key) ? { body: objects.get(key) } : null,
    delete: async key => { objects.delete(key); },
  };
}

function photoForm({ file = new File([png], 'notice.png', { type: 'image/png' }), revision, title = draft.title } = {}) {
  const form = new FormData();
  form.set('title', title);
  form.set('body', draft.body);
  form.set('photo', file);
  if (revision !== undefined) form.set('revision', String(revision));
  return form;
}

test('notice changes require app credentials, exact origin and a valid payload', async t => {
  const DB = openLocalNoticeDatabase(':memory:');
  t.after(() => DB.close());
  const { env, cookie } = await adminSetup(DB);
  const oldIdentity = { 'oai-authenticated-user-id': 'old-admin', 'oai-authenticated-user-email': 'admin@example.invalid' };
  assert.equal((await apartmentNotices(request(manage, { headers: oldIdentity }), env)).status, 401);
  for (const [method, path] of [['POST', manage], ['PUT', `${manage}/1`], ['DELETE', `${manage}/1`]]) {
    assert.equal((await apartmentNotices(request(path, { method, body: { ...draft, revision: 1 } }), env)).status, 401);
    assert.equal((await apartmentNotices(request(path, { method, body: { ...draft, revision: 1 }, cookie, headers: { Origin: 'https://different.example' } }), env)).status, 403);
  }
  const publish = body => apartmentNotices(request(manage, { method: 'POST', cookie, body }), env);
  assert.equal((await publish({ ...draft, title: ' ' })).status, 400);
  assert.equal((await publish({ ...draft, title: '첫 줄\n둘째 줄' })).status, 400);
  assert.equal((await publish({ ...draft, body: '가'.repeat(6001) })).status, 400);
  assert.equal((await publish({ ...draft, ignored: '가'.repeat(17000) })).status, 400);
  assert.equal((await apartmentNotices(request(`${board}?page=-1`), env)).status, 400);
  assert.equal((await apartmentNotices(request(board, { method: 'POST', cookie, body: draft }), env)).status, 405);
});

test('migration preserves existing notices and text-only posts stay editable after reopening', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'hansarang-notices-'));
  const path = join(directory, 'board.sqlite');
  const older = new DatabaseSync(path);
  older.exec(readFileSync(new URL('./drizzle/0000_apartment_notices.sql', import.meta.url), 'utf8'));
  older.prepare('INSERT INTO apartment_notices (title, body, created_at) VALUES (?, ?, ?)').run(draft.title, draft.body, 1);
  older.exec('PRAGMA user_version = 1');
  older.close();
  const { env, cookie } = await adminSetup(openLocalNoticeDatabase(path));
  t.after(() => {
    env.DB.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const listed = await (await apartmentNotices(request(board), env)).json();
  assert.deepEqual(listed.posts, [{ id: 1, ...draft, createdAt: 1, photoUrl: null }]);
  const created = await apartmentNotices(request(manage, { method: 'POST', cookie, body: draft }), env);
  assert.equal(created.status, 201);
  const { id } = await created.json();
  env.DB.close();
  env.DB = openLocalNoticeDatabase(path);
  const { posts: [published] } = await (await apartmentNotices(request(board), env)).json();
  assert.deepEqual(published, { id, ...draft, createdAt: published.createdAt, photoUrl: null });
  const edit = request(`${manage}/${id}`, { method: 'PUT', cookie, body: { ...draft, title: '수정된 공지', revision: 1 } });
  assert.equal((await apartmentNotices(edit, env)).status, 204);
  const remove = revision => apartmentNotices(request(`${manage}/${id}`, { method: 'DELETE', cookie, body: { revision } }), env);
  assert.equal((await remove(1)).status, 409);
  assert.equal((await remove(2)).status, 204);
});

test('notices stay paginated without showing drafts or internal revision data', async t => {
  const DB = openLocalNoticeDatabase(':memory:');
  t.after(() => DB.close());
  const { env, cookie } = await adminSetup(DB);
  for (let i = 1; i <= 11; i++) {
    const response = await apartmentNotices(request(manage, { method: 'POST', cookie, body: { ...draft, title: `공지 ${i}` } }), env);
    assert.equal(response.status, 201);
  }
  const first = await (await apartmentNotices(request(board), env)).json();
  const second = await (await apartmentNotices(request(`${board}?page=2`), env)).json();
  assert.equal(first.posts.length, 10);
  assert.equal(first.posts[0].title, '공지 11');
  assert.equal(first.posts[0].revision, undefined);
  assert.equal(first.hasNext, true);
  assert.deepEqual(second.posts.map(post => post.title), ['공지 1']);
  assert.equal(second.hasNext, false);
});

test('photo type and size are checked; edit keeps, replaces or removes a published photo', async t => {
  const DB = openLocalNoticeDatabase(':memory:');
  t.after(() => DB.close());
  const { env, cookie } = await adminSetup(DB);
  const bucket = memoryBucket();
  env.NOTICE_PHOTOS = bucket;
  const publish = body => apartmentNotices(request(manage, { method: 'POST', cookie, body }), env);
  const disguised = new File(['<html>false image</html>'], 'bad.png', { type: 'image/png' });
  assert.equal((await publish(photoForm({ file: disguised }))).status, 400);
  const oversize = new File([png, new Uint8Array(2 * 1024 * 1024)], 'large.png', { type: 'image/png' });
  assert.equal((await publish(photoForm({ file: oversize }))).status, 400);
  assert.equal(bucket.objects.size, 0);
  const created = await publish(photoForm());
  assert.equal(created.status, 201);
  const { id } = await created.json();
  const getPost = async () => (await (await apartmentNotices(request(board), env)).json()).posts[0];
  const { photoUrl: original } = await getPost();
  const photo = await apartmentNotices(request(original), env);
  assert.equal(photo.status, 200);
  assert.equal(photo.headers.get('content-type'), 'image/png');
  assert.equal(photo.headers.get('cache-control'), 'no-store');
  assert.deepEqual(Buffer.from(await photo.arrayBuffer()), png);
  const put = body => apartmentNotices(request(`${manage}/${id}`, { method: 'PUT', cookie, body }), env);
  assert.equal((await put({ ...draft, revision: 1 })).status, 204);
  assert.equal((await getPost()).photoUrl, original);
  assert.equal((await put(photoForm({ revision: 2 }))).status, 204);
  const { photoUrl: replacement } = await getPost();
  assert.notEqual(original, replacement);
  assert.equal((await apartmentNotices(request(original), env)).status, 404);
  assert.equal(bucket.objects.size, 1);
  assert.equal((await put({ ...draft, revision: 3, removePhoto: true })).status, 204);
  assert.equal((await getPost()).photoUrl, null);
  assert.equal((await apartmentNotices(request(replacement), env)).status, 404);
  assert.equal(bucket.objects.size, 0);
});

test('cleanup committed during a slow PUT cannot adopt or strand the late photo', async t => {
  const DB = openLocalNoticeDatabase(':memory:');
  t.after(() => DB.close());
  const { env, cookie } = await adminSetup(DB);
  const bucket = memoryBucket();
  const deleted = Promise.withResolvers();
  const finishCleaner = Promise.withResolvers();
  let activeCleaner;
  let key;
  env.NOTICE_PHOTOS = {
    ...bucket,
    async put(uploadKey, bytes) {
      key = uploadKey;
      DB.prepare('UPDATE notice_photo_cleanup SET ready_at = 0 WHERE photo_key = ?').bind(key).run();
      activeCleaner = cleanNoticePhotos(DB, {
        async delete(photoKey) {
          await bucket.delete(photoKey);
          deleted.resolve();
          await finishCleaner.promise;
        },
      });
      await deleted.promise;
      await bucket.put(key, bytes);
    },
    async delete() { throw new Error('first recovery attempt failed'); },
  };
  try {
    const result = await apartmentNotices(request(manage, { method: 'POST', cookie, body: photoForm() }), env);
    assert.equal(result.status, 409);
    assert.equal(bucket.objects.has(key), true);
  } finally {
    finishCleaner.resolve();
    await activeCleaner;
  }
  const pending = DB.prepare('SELECT claimed, retain FROM notice_photo_cleanup WHERE photo_key = ?').bind(key).first();
  assert.equal(pending?.claimed, 1);
  assert.equal(pending?.retain, 0);
  assert.equal((await apartmentNotices(request(`${board}/photo/${key}`), env)).status, 404);
  await cleanNoticePhotos(DB, bucket);
  assert.equal(bucket.objects.has(key), false);
  assert.equal(DB.prepare('SELECT photo_key FROM notice_photo_cleanup WHERE photo_key = ?').bind(key).first(), null);
});

test('an uncertain upload leaves a tombstone after deletion and catches a delayed PUT', async t => {
  const DB = openLocalNoticeDatabase(':memory:');
  t.after(() => DB.close());
  const { env, cookie } = await adminSetup(DB);
  const bucket = memoryBucket();
  let key;
  let bytes;
  env.NOTICE_PHOTOS = { ...bucket, async put(uploadKey, uploadBytes) {
    key = uploadKey;
    bytes = uploadBytes;
    throw new Error('unknown PUT outcome');
  } };
  assert.equal((await apartmentNotices(request(manage, { method: 'POST', cookie, body: photoForm() }), env)).status, 503);
  const expire = () => DB.prepare('UPDATE notice_photo_cleanup SET ready_at = 0 WHERE photo_key = ?').bind(key).run();
  expire();
  await cleanNoticePhotos(DB, bucket);
  assert.equal(DB.prepare('SELECT retain FROM notice_photo_cleanup WHERE photo_key = ?').bind(key).first().retain, 1);
  await bucket.put(key, bytes);
  expire();
  await cleanNoticePhotos(DB, bucket);
  assert.equal(bucket.objects.size, 0);
  assert.equal(DB.prepare('SELECT claimed FROM notice_photo_cleanup WHERE photo_key = ?').bind(key).first().claimed, 1);
});

test('reconciliation preserves a committed photo if its DB response was lost', async t => {
  const DB = openLocalNoticeDatabase(':memory:');
  t.after(() => DB.close());
  const { env, cookie } = await adminSetup(DB);
  env.NOTICE_PHOTOS = memoryBucket();
  for (const commit of [true, false]) {
    const flaky = { ...DB, batch(statements) {
      if (commit) DB.batch(statements);
      throw new Error('unknown D1 outcome');
    } };
    assert.equal((await apartmentNotices(request(manage, { method: 'POST', cookie, body: photoForm() }), { ...env, DB: flaky })).status, 503);
  }
  const { posts } = await (await apartmentNotices(request(board), env)).json();
  assert.equal(posts.length, 1);
  assert.equal(env.NOTICE_PHOTOS.objects.size, 1);
  assert.equal((await apartmentNotices(request(posts[0].photoUrl), env)).status, 200);
});
