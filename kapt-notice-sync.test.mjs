import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import test from 'node:test';
import { apartmentNotices } from './apartment-notices.mjs';
import { openLocalNoticeDatabase } from './apartment-notices-local.mjs';
import { kaptNoticeSyncPath, syncKaptNotices } from './kapt-notice-sync.mjs';

const origin = 'https://resident.example';
const sync = new Request(`${origin}${kaptNoticeSyncPath}`, { method: 'POST' });
const board = new Request(`${origin}/api/apartment-notices`);
const time = Date.parse('2026-11-27T00:41:00Z');
const oneDay = 86_400_000;
const kaptCode = 'A15783907';
const issuer = 'https://token.actions.githubusercontent.com';
const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...keys.publicKey.export({ format: 'jwk' }), kid: 'test-key', use: 'sig', alg: 'RS256' };
const feeResponses = {
  getHsmpCleaningCostInfoV3: { cleanCost: '1,200' },
  getHsmpGuardCostInfoV3: { guardCost: '6,000' },
  getHsmpElevatorMntncCostInfoV3: { elevCost: '0' },
  getHsmpElectricityCostInfoV2: { electP: '5,000', electC: 500 },
  getHsmpWaterCostInfoV2: { waterCoolP: '3,000', waterCoolC: '0' },
};

function authorized(timestamp, overrides = {}, keyId = jwk.kid, badSignature = false) {
  const iat = Math.floor(timestamp / 1000);
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const claims = {
    iss: issuer, aud: 'https://hansarang2.jaypapa.kr/api/apartment-notices/kapt-sync',
    repository: 'jaypapalet/hansarang2-life', repository_id: '1469943713', ref: 'refs/heads/main',
    workflow_ref: 'jaypapalet/hansarang2-life/.github/workflows/refresh-kapt-notices.yml@refs/heads/main',
    event_name: 'schedule', iat, nbf: iat - 5, exp: iat + 300, ...overrides,
  };
  const message = `${encode({ alg: 'RS256', kid: keyId })}.${encode(claims)}`;
  const signature = badSignature ? Buffer.alloc(256) : sign('sha256', Buffer.from(message), keys.privateKey);
  return new Request(sync.url, { method: 'POST', headers: { Authorization: `Bearer ${message}.${signature.toString('base64url')}` } });
}

function keyFetcher(url, options) {
  assert.equal(url, `${issuer}/.well-known/jwks`);
  assert.equal(options.redirect, 'manual');
  return Response.json({ keys: [jwk] });
}

function reply(body) {
  return Response.json({ response: { header: { resultCode: '00' }, body } });
}

function bid(overrides = {}) {
  return { aptCode: kaptCode, bidNum: '2026110001', bidTitle: '승강기 정기점검 업체 선정', bidRegDate: '2026-11-22', bidDeadline: '20261125090000', ...overrides };
}

function upstream(url) {
  assert.equal(url.origin, 'https://apis.data.go.kr');
  assert.equal(url.searchParams.get('serviceKey'), 'fixture+/key');
  assert.equal(url.searchParams.get('kaptCode'), kaptCode);
  const operation = url.pathname.split('/').at(-1);
  if (operation in feeResponses) {
    if (url.searchParams.get('searchDate') === '202609') return reply({ item: { kaptCode, ...feeResponses[operation] } });
    return Response.json({ response: { header: { resultCode: '03' } } });
  }
  assert.equal(operation, 'getHsmpCdSearchV3');
  if (url.pathname.includes('BidResult')) return reply({ totalCount: '1', items: [bid({ bidRegDate: undefined, bidRegdate: '2026-11-22', amount: '30,000' })] });
  return reply({ totalCount: '3', items: [bid(), bid({ aptCode: 'A15783905' }), bid({ bidNum: '2026080001', bidRegDate: '2026-08-01' })] });
}

function environment(t) {
  const DB = openLocalNoticeDatabase(':memory:');
  t.after(() => DB.close());
  return { DB, DATA_GO_KR_KEY: 'fixture%2B%2Fkey' };
}

async function syncOn(env, timestamp, fetcher = upstream) {
  const response = await syncKaptNotices(authorized(timestamp), env, { now: () => timestamp, fetcher, keyFetcher });
  assert.equal(response.status, 200);
  return response.json();
}

test('the sync route accepts only signed tokens for the scheduled main workflow', async t => {
  const env = environment(t);
  assert.equal((await apartmentNotices(new Request(sync.url), env)).status, 405);
  assert.equal((await apartmentNotices(sync, env)).status, 401);
  const verifyRequest = request => syncKaptNotices(request, env, { now: () => time, fetcher: upstream, keyFetcher });
  for (const claims of [
    { iss: 'https://different.example' }, { aud: 'https://different.example' }, { repository_id: '1' },
    { workflow_ref: 'jaypapalet/hansarang2-life/.github/workflows/another.yml@refs/heads/main' },
    { ref: 'refs/heads/other' }, { event_name: 'pull_request' }, { exp: time / 1000 - 5 },
    { nbf: time / 1000 + 60 }, { iat: time / 1000 + 60 },
  ]) assert.equal((await verifyRequest(authorized(time, claims))).status, 401);
  assert.equal((await verifyRequest(authorized(time, {}, 'unknown'))).status, 401);
  assert.equal((await verifyRequest(authorized(time, {}, jwk.kid, true))).status, 401);
  assert.equal((await verifyRequest(new Request(sync.url, { method: 'POST', headers: { Authorization: `Bearer ${'a'.repeat(8200)}` } }))).status, 401);
  assert.equal((await syncKaptNotices(authorized(time), env, { now: () => time, keyFetcher: async () => new Response(null, { status: 503 }) })).status, 503);
  assert.deepEqual((await syncOn({ ...env, DATA_GO_KR_KEY: '' }, time)).sources.map(row => row.state), Array(3).fill('key_unconfigured'));
  assert.deepEqual(await (await apartmentNotices(board, env)).json(), { posts: [], hasNext: false });
});

test('K-apt posts share the notice board, deduplicate across days and stay deleted', async t => {
  const env = environment(t);
  const first = await syncOn(env, time);
  assert.equal(first.day, '2026-11-27');
  assert.deepEqual(first.sources.map(row => [row.source, row.state, row.published]), [['fees', 'ok', 1], ['bids', 'ok', 1], ['results', 'ok', 1]]);
  const { posts } = await (await apartmentNotices(board, env)).json();
  assert.equal(posts.length, 3);
  const fees = posts.find(post => post.title.includes('관리비'));
  assert.equal(fees.title, '2026년 9월 관리비 공개 내역');
  assert.match(fees.body, /승강기 유지비 0원\n전기료 5,500원/);
  assert.match(posts.find(post => post.title.startsWith('입찰결과')).body, /낙찰금액 30,000원/);
  assert.ok(posts.every(post => new URL(post.sourceUrl).hostname === 'www.k-apt.go.kr' && post.sourceKey === undefined));

  let dailyCalls = 0;
  await syncOn(env, time + 500, async url => { dailyCalls++; return upstream(url); });
  assert.equal(dailyCalls, 0);
  const password = 'ab'.repeat(32);
  const setup = await apartmentNotices(new Request(`${board.url}/auth/setup`, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'manager', password }),
  }), { ...env, NOTICE_INITIAL_PASSWORD: password });
  assert.equal(setup.status, 201);
  const cookie = setup.headers.get('Set-Cookie').split(';')[0];
  const removal = await apartmentNotices(new Request(`${board.url}/admin/${fees.id}`, {
    method: 'DELETE', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ revision: 1 }),
  }), env);
  assert.equal(removal.status, 204);
  const next = await syncOn(env, time + oneDay);
  assert.deepEqual(next.sources.map(row => row.published), [0, 0, 0]);
  assert.equal((await (await apartmentNotices(board, env)).json()).posts.length, 2);
});

test('incomplete fees, over-limit pages and unapproved APIs never publish misleading notices', async t => {
  const env = environment(t);
  const result = await syncOn(env, time, async (url, options) => {
    assert.equal(options.redirect, 'manual');
    if (url.pathname.includes('WaterCost')) return reply({ item: { kaptCode, waterCoolC: 0 } });
    if (url.pathname.includes('BidPblAnc')) return reply({ totalCount: '501', items: [bid()] });
    if (url.pathname.includes('BidResult')) return Response.json({ OpenAPI_ServiceResponse: { cmmMsgHeader: { returnReasonCode: '30' } } });
    return upstream(url);
  });
  assert.deepEqual(result.sources.map(row => row.state), ['incomplete_data', 'incomplete_data', 'api_access_denied']);
  assert.equal((await (await apartmentNotices(board, env)).json()).posts.length, 0);
  assert.deepEqual((await syncOn(env, time + 16 * 60_000)).sources.map(row => row.published), [1, 1, 1]);
});

test('the collector stops at a redirect without forwarding its credentials', async t => {
  const env = environment(t);
  let calls = 0;
  const result = await syncOn(env, time, async (url, options) => {
    assert.equal(url.origin, 'https://apis.data.go.kr');
    assert.equal(options.redirect, 'manual');
    calls++;
    return Response.redirect('https://other.example/');
  });
  assert.equal(calls, 7);
  assert.deepEqual(result.sources.map(row => row.state), Array(3).fill('upstream_unavailable'));
  assert.deepEqual((await (await apartmentNotices(board, env)).json()).posts, []);
});

test('a lost sync lease leaves neither a board row nor a publication record', async t => {
  const env = environment(t);
  let replacement;
  const fetcher = async url => {
    if (!replacement && url.pathname.includes('BidPblAnc')) {
      replacement = true;
      await env.DB.prepare("UPDATE kapt_notice_sync SET token = 'other-owner', retry_at = ? WHERE source = 'bids'").bind(time + 1000).run();
    }
    return upstream(url);
  };
  const first = await syncOn(env, time, fetcher);
  assert.deepEqual(first.sources[1], { source: 'bids', state: 'superseded', published: 0 });
  assert.equal(await env.DB.prepare('SELECT source_key FROM kapt_notice_publications WHERE source_key = ?').bind(`bids:${bid().bidNum}`).first(), null);
  assert.equal((await (await apartmentNotices(board, env)).json()).posts.length, 2);
  assert.equal((await syncOn(env, time + 1001)).sources[1].published, 1);
});
