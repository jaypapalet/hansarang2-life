import { noticeFailure, noticeHeaders, noticeJson, noticeOriginMatches, noticeUnsupported, readNoticeJson } from './notice-http.mjs';

const authPath = '/api/apartment-notices/auth';
const cookieName = 'notice_session';
const sessionSeconds = 12 * 60 * 60;
const usernamePattern = /^[a-z0-9][a-z0-9_-]{2,31}$/;
const tokenPattern = /^[a-f0-9]{64}$/;
const passwordPattern = /^(?:[a-f0-9]{48}|[a-f0-9]{64})$/;
const emptyDigest = '0'.repeat(64);

function randomHex(bytes) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function digest(value) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}

function sameDigest(left, right) {
  let difference = left.length ^ right.length;
  for (let index = 0; index < 64; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function sessionToken(request) {
  const matches = (request.headers.get('Cookie') ?? '').split(';')
    .map(part => part.trim()).filter(part => part.startsWith(`${cookieName}=`));
  if (matches.length !== 1) return null;
  const token = matches[0].slice(cookieName.length + 1);
  return tokenPattern.test(token) ? token : null;
}

function sessionCookie(request, token, maxAge = sessionSeconds) {
  const url = new URL(request.url);
  const localNode = typeof process !== 'undefined' && Boolean(process.versions?.node)
    && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  return `${cookieName}=${token}; Path=/api/apartment-notices; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${localNode ? '' : '; Secure'}`;
}

function isObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function canonicalUsername(value) {
  if (typeof value !== 'string') return null;
  const username = value.trim().toLowerCase();
  return usernamePattern.test(username) ? username : null;
}

function publicUser(user) {
  return { username: user.username, role: user.role };
}

export async function getNoticeUser(request, db) {
  const token = sessionToken(request);
  if (!token || !db) return null;
  const tokenHash = await digest(token);
  const user = await db.prepare(`SELECT users.username, users.role FROM notice_sessions AS sessions
    JOIN notice_users AS users ON users.username = sessions.username
    WHERE sessions.token_hash = ? AND sessions.expires_at > ? AND users.enabled = 1
      AND users.session_version = sessions.session_version AND users.role IN ('owner', 'editor')`)
    .bind(tokenHash, Date.now()).first();
  return user ? publicUser(user) : null;
}

async function startSession(request, db, user) {
  const token = randomHex(32);
  const tokenHash = await digest(token);
  const now = Date.now();
  const insert = db.prepare(`INSERT INTO notice_sessions (token_hash, username, session_version, expires_at)
    SELECT ?, username, session_version, ? FROM notice_users
    WHERE username = ? AND password_hash = ? AND session_version = ? AND enabled = 1
      AND role = ?`)
    .bind(tokenHash, now + sessionSeconds * 1000, user.username, user.password_hash, user.session_version, user.role);
  const cleanup = db.prepare('DELETE FROM notice_sessions WHERE expires_at <= ?').bind(now);
  const previousToken = sessionToken(request);
  const statements = [insert, cleanup];
  if (previousToken) {
    statements.push(db.prepare(`DELETE FROM notice_sessions WHERE token_hash = ?
      AND EXISTS (SELECT 1 FROM notice_sessions WHERE token_hash = ?)`)
      .bind(await digest(previousToken), tokenHash));
  }
  const results = await db.batch(statements);
  return results[0].meta.changes ? sessionCookie(request, token) : null;
}

async function setupAccount(request, env) {
  const initialPassword = env.NOTICE_INITIAL_PASSWORD;
  if (typeof initialPassword !== 'string' || !tokenPattern.test(initialPassword)) return noticeFailure('setup_unavailable', 409);
  const existingOwner = await env.DB.prepare('SELECT username FROM notice_users WHERE role = ? LIMIT 1').bind('owner').first();
  if (existingOwner) return noticeFailure('setup_unavailable', 409);
  const body = await readNoticeJson(request, 2048);
  if (!isObject(body)) return noticeFailure('invalid_request', 400);
  const username = canonicalUsername(body.username);
  if (!username) return noticeFailure('invalid_username', 400);
  if (typeof body.password !== 'string' || !tokenPattern.test(body.password)
    || !sameDigest(await digest(body.password), await digest(initialPassword))) return noticeFailure('invalid_setup_password', 403);
  const passwordHash = await digest(initialPassword);
  const { meta } = await env.DB.prepare(`INSERT INTO notice_users (username, password_hash, role, enabled, session_version, created_at)
    SELECT ?, ?, 'owner', 1, 1, ? WHERE NOT EXISTS (SELECT 1 FROM notice_users WHERE role = 'owner')
    ON CONFLICT DO NOTHING`).bind(username, passwordHash, Date.now()).run();
  if (!meta.changes) return noticeFailure('setup_unavailable', 409);
  const user = { username, role: 'owner', password_hash: passwordHash, session_version: 1 };
  const cookie = await startSession(request, env.DB, user);
  if (!cookie) return noticeFailure('invalid_credentials', 401);
  return noticeJson({ user: publicUser(user) }, 201, { 'Set-Cookie': cookie });
}

async function login(request, env) {
  const body = await readNoticeJson(request, 2048);
  if (!isObject(body)) return noticeFailure('invalid_request', 400);
  const username = canonicalUsername(body.username);
  if (!username
    || typeof body.password !== 'string' || !passwordPattern.test(body.password)) return noticeFailure('invalid_credentials', 401);
  const passwordHash = await digest(body.password);
  const user = await env.DB.prepare(`SELECT username, role, password_hash, enabled, session_version
    FROM notice_users WHERE username = ?`).bind(username).first();
  const matches = sameDigest(passwordHash, user?.password_hash ?? emptyDigest);
  if (!matches || !user || user.enabled !== 1 || !['owner', 'editor'].includes(user.role)
    || body.password.length !== (user.role === 'owner' ? 64 : 48)) return noticeFailure('invalid_credentials', 401);
  const cookie = await startSession(request, env.DB, user);
  if (!cookie) return noticeFailure('invalid_credentials', 401);
  return noticeJson({ user: publicUser(user) }, 200, { 'Set-Cookie': cookie });
}

async function ownerAccounts(request, env, path) {
  const actor = await getNoticeUser(request, env.DB);
  if (!actor) return noticeFailure('sign_in_required', 401);
  if (actor.role !== 'owner') return noticeFailure('owner_required', 403);
  if (path === `${authPath}/users`) {
    if (request.method === 'GET') {
      const { results } = await env.DB.prepare(`SELECT username, role, enabled FROM notice_users
        ORDER BY CASE role WHEN 'owner' THEN 0 ELSE 1 END, username`).bind().all();
      return noticeJson({ users: results.map(user => ({ ...publicUser(user), enabled: Boolean(user.enabled) })) });
    }
    const body = await readNoticeJson(request, 2048);
    if (!isObject(body)) return noticeFailure('invalid_request', 400);
    const username = canonicalUsername(body.username);
    if (!username) return noticeFailure('invalid_username', 400);
    const password = randomHex(24);
    const { meta } = await env.DB.prepare(`INSERT INTO notice_users (username, password_hash, role, enabled, session_version, created_at)
      VALUES (?, ?, 'editor', 1, 1, ?) ON CONFLICT(username) DO NOTHING`)
      .bind(username, await digest(password), Date.now()).run();
    if (!meta.changes) return noticeFailure('id_taken', 409);
    return noticeJson({ username, password }, 201);
  }
  const match = path.match(/^\/api\/apartment-notices\/auth\/users\/([^/]+)(\/reset)?$/);
  let username;
  try {
    username = canonicalUsername(decodeURIComponent(match[1]));
  } catch {
    return noticeFailure('invalid_username', 400);
  }
  if (!username) return noticeFailure('invalid_username', 400);
  if (match[2]) {
    const password = randomHex(24);
    const { meta } = await env.DB.prepare(`UPDATE notice_users SET password_hash = ?, session_version = session_version + 1
      WHERE username = ? AND role = 'editor'`).bind(await digest(password), username).run();
    if (!meta.changes) return noticeFailure('user_not_found', 404);
    return noticeJson({ username, password });
  }
  const body = await readNoticeJson(request, 2048);
  if (!isObject(body) || typeof body.enabled !== 'boolean') return noticeFailure('invalid_request', 400);
  const { meta } = await env.DB.prepare(`UPDATE notice_users SET enabled = ?, session_version = session_version + 1
    WHERE username = ? AND role = 'editor'`).bind(Number(body.enabled), username).run();
  if (!meta.changes) return noticeFailure('user_not_found', 404);
  return new Response(null, { status: 204, headers: noticeHeaders });
}

export async function noticeAccounts(request, env) {
  const path = new URL(request.url).pathname;
  const userRoute = path.match(/^\/api\/apartment-notices\/auth\/users\/[^/]+(\/reset)?$/);
  let methods;
  if (path === authPath) methods = ['GET'];
  else if ([`${authPath}/setup`, `${authPath}/login`, `${authPath}/logout`].includes(path)) methods = ['POST'];
  else if (path === `${authPath}/users`) methods = ['GET', 'POST'];
  else if (userRoute) methods = [userRoute[1] ? 'POST' : 'PATCH'];
  else return noticeFailure('not_found', 404);
  if (!methods.includes(request.method)) return noticeUnsupported(methods.join(', '));
  if (request.method !== 'GET' && !noticeOriginMatches(request)) return noticeFailure('invalid_origin', 403);
  if (!env.DB) return noticeFailure('notice_store_unavailable', 503);
  try {
    if (path === authPath) {
      const owner = await env.DB.prepare('SELECT username FROM notice_users WHERE role = ? LIMIT 1').bind('owner').first();
      const configured = typeof env.NOTICE_INITIAL_PASSWORD === 'string' && tokenPattern.test(env.NOTICE_INITIAL_PASSWORD);
      return noticeJson({ user: await getNoticeUser(request, env.DB), setup: owner ? 'complete' : configured ? 'available' : 'unconfigured' });
    }
    if (path === `${authPath}/setup`) return await setupAccount(request, env);
    if (path === `${authPath}/login`) return await login(request, env);
    if (path === `${authPath}/logout`) {
      const token = sessionToken(request);
      if (token) await env.DB.prepare('DELETE FROM notice_sessions WHERE token_hash = ?').bind(await digest(token)).run();
      return new Response(null, { status: 204, headers: { ...noticeHeaders, 'Set-Cookie': sessionCookie(request, '', 0) } });
    }
    return await ownerAccounts(request, env, path);
  } catch {
    return noticeFailure('notice_store_unavailable', 503);
  }
}
