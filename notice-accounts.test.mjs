import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { getNoticeUser, noticeAccounts } from './notice-accounts.mjs';

const site = 'https://resident.example';
const authPath = '/api/apartment-notices/auth';
const initialPassword = 'a'.repeat(64);
const ownerUser = { username: 'building-owner', role: 'owner' };
const siteIdentity = { 'oai-authenticated-user-id': 'building-owner', 'oai-authenticated-user-email': 'owner@example.invalid' };

function request(path = '', { method = 'GET', body, cookie, headers = {}, address = site } = {}) {
  const url = new URL(`${authPath}${path}`, address);
  return new Request(url, {
    method,
    headers: {
      ...(method !== 'GET' && { Origin: url.origin }),
      ...(body !== undefined && { 'Content-Type': 'application/json' }),
      ...(cookie && { Cookie: cookie }),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function fixture(t) {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(readFileSync(new URL('./drizzle/0001_notice_accounts.sql', import.meta.url), 'utf8'));
  t.after(() => sqlite.close());
  const DB = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      return {
        bind(...values) {
          return {
            first: () => statement.get(...values) ?? null,
            all: () => ({ results: statement.all(...values) }),
            run: () => ({ meta: { changes: statement.run(...values).changes } }),
          };
        },
      };
    },
    batch(statements) {
      sqlite.exec('BEGIN IMMEDIATE');
      try {
        const results = statements.map(statement => statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
  };
  return { sqlite, env: { DB, NOTICE_INITIAL_PASSWORD: initialPassword } };
}

function responseCookie(response) {
  return response.headers.get('Set-Cookie')?.split(';', 1)[0];
}

async function ownerFixture(t) {
  const state = fixture(t);
  const response = await noticeAccounts(request('/setup', {
    method: 'POST', body: { username: ownerUser.username, password: initialPassword },
  }), state.env);
  assert.equal(response.status, 201);
  return { ...state, cookie: responseCookie(response) };
}

async function editorAccount(owner, username = 'notice-editor') {
  const response = await noticeAccounts(request('/users', { method: 'POST', cookie: owner.cookie, body: { username } }), owner.env);
  assert.equal(response.status, 201);
  return response.json();
}

async function signIn(env, credentials, cookie, address) {
  return noticeAccounts(request('/login', { method: 'POST', body: credentials, cookie, address }), env);
}

test('auth availability is explicit, private, and separate from Sites identity headers', async t => {
  const { env } = fixture(t);
  for (const configured of [undefined, 'short', initialPassword.toUpperCase()]) {
    const response = await noticeAccounts(request('', { headers: siteIdentity }), { ...env, NOTICE_INITIAL_PASSWORD: configured });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'no-store');
    assert.deepEqual(await response.json(), { user: null, setup: 'unconfigured' });
  }
  assert.deepEqual(await (await noticeAccounts(request('', { headers: siteIdentity }), env)).json(), { user: null, setup: 'available' });
  assert.equal(await getNoticeUser(request('', { headers: siteIdentity }), env.DB), null);
  const denied = await noticeAccounts(request('/users', { headers: siteIdentity }), env);
  assert.equal(denied.status, 401);
  assert.deepEqual(await denied.json(), { error: 'sign_in_required' });
});

test('bootstrap accepts the initial credential once and keeps it usable after a lost setup response', async t => {
  const { env, sqlite } = fixture(t);
  const responses = await Promise.all([' Building-Owner ', 'different-owner'].map(username => noticeAccounts(request('/setup', {
    method: 'POST', body: { username, password: initialPassword },
  }), env)));
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM notice_users WHERE role = 'owner'").get().count, 1);
  const saved = sqlite.prepare('SELECT username, password_hash FROM notice_users').get();
  assert.match(saved.username, /^[a-z0-9][a-z0-9_-]{2,31}$/);
  assert.match(saved.password_hash, /^[a-f0-9]{64}$/);
  assert.notEqual(saved.password_hash, initialPassword);
  const signedIn = await signIn(env, { username: ` ${saved.username.toUpperCase()} `, password: initialPassword });
  assert.equal(signedIn.status, 200);
  assert.deepEqual(await signedIn.json(), { user: { username: saved.username, role: 'owner' } });
  const anotherSetup = await noticeAccounts(request('/setup', {
    method: 'POST', body: { username: 'third-owner', password: initialPassword },
  }), env);
  assert.equal(anotherSetup.status, 409);
  assert.deepEqual(await anotherSetup.json(), { error: 'setup_unavailable' });
  const status = await noticeAccounts(request('', { cookie: responseCookie(signedIn) }), { ...env, NOTICE_INITIAL_PASSWORD: undefined });
  assert.deepEqual(await status.json(), { user: { username: saved.username, role: 'owner' }, setup: 'complete' });
});

test('bootstrap enforces configured credentials, canonical usernames, bounded JSON, and exact origins', async t => {
  const { env } = fixture(t);
  const setup = (body, headers) => noticeAccounts(request('/setup', { method: 'POST', body, headers }), env);
  for (const username of ['ab', '-owner', 'owner.name', '주민관리자', 'a'.repeat(33), null]) {
    const response = await setup({ username, password: initialPassword });
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_username' });
  }
  for (const password of ['b'.repeat(64), 'A'.repeat(64), 'a'.repeat(48), null]) {
    const response = await setup({ username: 'owner', password });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'invalid_setup_password' });
  }
  assert.equal((await setup({ username: 'owner', password: initialPassword, excess: 'x'.repeat(2048) })).status, 400);
  assert.equal((await setup({ username: 'owner', password: initialPassword }, { 'Content-Type': 'text/plain' })).status, 400);
  assert.equal((await setup(null)).status, 400);
  assert.equal((await setup([])).status, 400);
  const unavailable = await noticeAccounts(request('/setup', { method: 'POST', body: { username: 'owner', password: initialPassword } }), { DB: env.DB });
  assert.equal(unavailable.status, 409);
  for (const Origin of ['', 'https://different.example', 'https://resident.example.attacker.invalid', 'null']) {
    const response = await setup({ username: 'owner', password: initialPassword }, { Origin });
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'invalid_origin' });
  }
});

test('only the owner can create, list, enable, or reset editors, independent of Sites headers', async t => {
  const owner = await ownerFixture(t);
  const credentials = await editorAccount(owner, ' Notice-Editor ');
  assert.equal(credentials.username, 'notice-editor');
  assert.match(credentials.password, /^[a-f0-9]{48}$/);
  assert.deepEqual(Object.keys(credentials).sort(), ['password', 'username']);
  const editorLogin = await signIn(owner.env, { ...credentials, username: ' NOTICE-EDITOR ' });
  assert.equal(editorLogin.status, 200);
  const cookie = responseCookie(editorLogin);
  assert.deepEqual(await getNoticeUser(request('', { cookie }), owner.env.DB), { username: 'notice-editor', role: 'editor' });
  for (const [method, path, body] of [
    ['GET', '/users'], ['POST', '/users', { username: 'other-editor' }],
    ['PATCH', '/users/notice-editor', { enabled: false }], ['POST', '/users/notice-editor/reset'],
  ]) {
    const response = await noticeAccounts(request(path, { method, body, cookie, headers: siteIdentity }), owner.env);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'owner_required' });
  }
  const listing = await noticeAccounts(request('/users', { cookie: owner.cookie }), owner.env);
  assert.deepEqual(await listing.json(), { users: [
    { ...ownerUser, enabled: true }, { username: 'notice-editor', role: 'editor', enabled: true },
  ] });
  const duplicate = await noticeAccounts(request('/users', { method: 'POST', cookie: owner.cookie, body: { username: 'NOTICE-EDITOR' } }), owner.env);
  assert.equal(duplicate.status, 409);
  assert.deepEqual(await duplicate.json(), { error: 'id_taken' });
  const saved = owner.sqlite.prepare('SELECT password_hash FROM notice_users WHERE username = ?').get(credentials.username);
  assert.notEqual(saved.password_hash, credentials.password);
  assert.match(saved.password_hash, /^[a-f0-9]{64}$/);
});

test('login rotates an existing opaque cookie and logout revokes its server-side digest', async t => {
  const owner = await ownerFixture(t);
  const firstCookie = owner.cookie;
  const login = await signIn(owner.env, { username: ownerUser.username, password: initialPassword }, firstCookie);
  assert.equal(login.status, 200);
  const cookieHeader = login.headers.get('Set-Cookie');
  const secondCookie = responseCookie(login);
  assert.notEqual(firstCookie, secondCookie);
  assert.match(cookieHeader, /^notice_session=[a-f0-9]{64};/);
  for (const attribute of ['Path=/api/apartment-notices', 'HttpOnly', 'SameSite=Strict', 'Max-Age=43200', 'Secure']) assert.ok(cookieHeader.includes(attribute));
  assert.equal(await getNoticeUser(request('', { cookie: firstCookie }), owner.env.DB), null);
  assert.deepEqual(await getNoticeUser(request('', { cookie: secondCookie }), owner.env.DB), ownerUser);
  const saved = owner.sqlite.prepare('SELECT token_hash, expires_at FROM notice_sessions').all();
  assert.equal(saved.length, 1);
  assert.notEqual(saved[0].token_hash, secondCookie.split('=')[1]);
  assert.ok(saved[0].expires_at > Date.now() + 43100 * 1000);
  const logout = await noticeAccounts(request('/logout', { method: 'POST', cookie: secondCookie }), owner.env);
  assert.equal(logout.status, 204);
  assert.ok(logout.headers.get('Set-Cookie').includes('Max-Age=0'));
  assert.equal(await getNoticeUser(request('', { cookie: secondCookie }), owner.env.DB), null);
  assert.equal(owner.sqlite.prepare('SELECT COUNT(*) AS count FROM notice_sessions').get().count, 0);
});

test('disabling and re-enabling an editor cannot reactivate an old session', async t => {
  const owner = await ownerFixture(t);
  const credentials = await editorAccount(owner);
  const login = await signIn(owner.env, credentials);
  const editorCookie = responseCookie(login);
  const update = enabled => noticeAccounts(request('/users/NOTICE-EDITOR', { method: 'PATCH', cookie: owner.cookie, body: { enabled } }), owner.env);
  assert.equal((await update(false)).status, 204);
  assert.equal(await getNoticeUser(request('', { cookie: editorCookie }), owner.env.DB), null);
  assert.equal((await signIn(owner.env, credentials)).status, 401);
  assert.equal((await update(true)).status, 204);
  assert.equal(await getNoticeUser(request('', { cookie: editorCookie }), owner.env.DB), null);
  assert.equal((await signIn(owner.env, credentials)).status, 200);
  assert.deepEqual(await getNoticeUser(request('', { cookie: owner.cookie }), owner.env.DB), ownerUser);
});

test('password reset returns a fresh credential and invalidates every previous session and password', async t => {
  const owner = await ownerFixture(t);
  const credentials = await editorAccount(owner);
  const logins = await Promise.all([signIn(owner.env, credentials), signIn(owner.env, credentials)]);
  const reset = await noticeAccounts(request('/users/notice-editor/reset', { method: 'POST', cookie: owner.cookie }), owner.env);
  assert.equal(reset.status, 200);
  const replacement = await reset.json();
  assert.equal(replacement.username, credentials.username);
  assert.match(replacement.password, /^[a-f0-9]{48}$/);
  assert.notEqual(replacement.password, credentials.password);
  for (const login of logins) assert.equal(await getNoticeUser(request('', { cookie: responseCookie(login) }), owner.env.DB), null);
  assert.equal((await signIn(owner.env, credentials)).status, 401);
  assert.equal((await signIn(owner.env, replacement)).status, 200);
  assert.equal((await noticeAccounts(request('/users/notice-editor', { method: 'PATCH', cookie: owner.cookie, body: { enabled: false } }), owner.env)).status, 204);
  const disabledReset = await noticeAccounts(request('/users/notice-editor/reset', { method: 'POST', cookie: owner.cookie }), owner.env);
  assert.equal(disabledReset.status, 200);
  assert.equal((await signIn(owner.env, await disabledReset.json())).status, 401);
});

test('editor management cannot change the owner and validates target IDs and request values', async t => {
  const owner = await ownerFixture(t);
  for (const [path, method, body] of [
    ['/users/building-owner', 'PATCH', { enabled: false }], ['/users/building-owner/reset', 'POST'],
    ['/users/missing-user', 'PATCH', { enabled: false }], ['/users/missing-user/reset', 'POST'],
  ]) {
    const response = await noticeAccounts(request(path, { method, cookie: owner.cookie, body }), owner.env);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'user_not_found' });
  }
  for (const enabled of [null, 1, 'false', [], {}]) {
    const response = await noticeAccounts(request('/users/missing-user', { method: 'PATCH', cookie: owner.cookie, body: { enabled } }), owner.env);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_request' });
  }
  for (const username of ['aa', 'x.y', '한사랑', 'x'.repeat(33)]) {
    const response = await noticeAccounts(request(`/users/${encodeURIComponent(username)}/reset`, { method: 'POST', cookie: owner.cookie }), owner.env);
    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: 'invalid_username' });
  }
  assert.deepEqual(await getNoticeUser(request('', { cookie: owner.cookie }), owner.env.DB), ownerUser);
});

test('session validation uses current expiry, role, enabled flag, and credential version', async t => {
  const owner = await ownerFixture(t);
  assert.equal(await getNoticeUser(request('', { cookie: `${owner.cookie}; ${owner.cookie}` }), owner.env.DB), null);
  assert.equal(await getNoticeUser(request('', { cookie: 'notice_session=not-a-token', headers: siteIdentity }), owner.env.DB), null);
  owner.sqlite.prepare('UPDATE notice_sessions SET expires_at = ?').run(Date.now() - 1);
  assert.equal(await getNoticeUser(request('', { cookie: owner.cookie }), owner.env.DB), null);
  owner.sqlite.prepare('UPDATE notice_sessions SET expires_at = ?').run(Date.now() + 10000);
  owner.sqlite.exec('UPDATE notice_users SET session_version = session_version + 1');
  assert.equal(await getNoticeUser(request('', { cookie: owner.cookie }), owner.env.DB), null);
  owner.sqlite.exec('UPDATE notice_sessions SET session_version = session_version + 1');
  owner.sqlite.exec('UPDATE notice_users SET enabled = 0');
  assert.equal(await getNoticeUser(request('', { cookie: owner.cookie }), owner.env.DB), null);
  owner.sqlite.exec("UPDATE notice_users SET enabled = 1, role = 'editor'");
  assert.deepEqual(await getNoticeUser(request('', { cookie: owner.cookie }), owner.env.DB), { username: ownerUser.username, role: 'editor' });
  const response = await noticeAccounts(request('/users', { cookie: owner.cookie }), owner.env);
  assert.equal(response.status, 403);
});

test('all mutation routes reject foreign or missing origins before storage access', async () => {
  const env = { DB: { prepare() { throw new Error('must not open storage'); } } };
  for (const [method, path] of [
    ['POST', '/setup'], ['POST', '/login'], ['POST', '/logout'], ['POST', '/users'],
    ['PATCH', '/users/editor'], ['POST', '/users/editor/reset'],
  ]) {
    for (const Origin of ['', 'https://other.example']) {
      const response = await noticeAccounts(request(path, { method, headers: { Origin }, body: {} }), env);
      assert.equal(response.status, 403);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
      assert.deepEqual(await response.json(), { error: 'invalid_origin' });
    }
  }
  const wrongMethod = await noticeAccounts(request('/users/editor/reset'), env);
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('Allow'), 'POST');
  assert.equal(wrongMethod.headers.get('Cache-Control'), 'no-store');
  assert.equal((await noticeAccounts(request('/not-a-route'), env)).status, 404);
  for (const broken of [{}, env]) {
    const response = await noticeAccounts(request(), broken);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { error: 'notice_store_unavailable' });
  }
});

test('cookies use Secure except for explicit HTTP loopback requests in local Node', async t => {
  const owner = await ownerFixture(t);
  for (const address of ['http://localhost:4189', 'http://127.0.0.1:4189', 'http://[::1]:4189', 'https://localhost:4189', 'http://other.example:4189']) {
    const response = await signIn(owner.env, { username: ownerUser.username, password: initialPassword }, undefined, address);
    assert.equal(response.status, 200);
    const localHttp = address.startsWith('http:') && !address.includes('other.example');
    assert.equal(response.headers.get('Set-Cookie').includes('; Secure'), !localHttp);
  }
});

test('invalid credentials have one error and never create a session', async t => {
  const owner = await ownerFixture(t);
  const before = owner.sqlite.prepare('SELECT COUNT(*) AS count FROM notice_sessions').get().count;
  for (const credentials of [
    { username: 'unknown-user', password: initialPassword },
    { username: ownerUser.username, password: 'b'.repeat(64) },
    { username: ownerUser.username, password: initialPassword.toUpperCase() },
    { username: ownerUser.username, password: 'a'.repeat(48) },
    { username: "owner' OR 1 = 1 --", password: initialPassword },
    { username: ownerUser.username, password: null },
  ]) {
    const response = await signIn(owner.env, credentials);
    assert.equal(response.status, 401);
    assert.equal(response.headers.get('Set-Cookie'), null);
    assert.deepEqual(await response.json(), { error: 'invalid_credentials' });
  }
  assert.equal(owner.sqlite.prepare('SELECT COUNT(*) AS count FROM notice_sessions').get().count, before);
});
