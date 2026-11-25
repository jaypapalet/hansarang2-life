import assert from 'node:assert/strict';
import {test} from 'node:test';
import {estimateRoutes, fixedRoads, kakaoRoads, refreshInterval} from './roads.mjs';
import {readFile} from 'node:fs/promises';

const {
  origin,
  destinations,
} = JSON.parse(await readFile(new URL('src/road-places.json', import.meta.url), 'utf8'));
const fixedRoutes = JSON.parse(await readFile(new URL('src/topis-routes.json', import.meta.url), 'utf8'));

test('compiled routes conserve original distance and time', () => {
  assert.deepEqual(fixedRoutes.map(route => route.id), destinations.map(destination => destination.id));
  for (const {meters, baselineSeconds, links} of fixedRoutes) {
    assert.equal(new Set(links.map(link => link.id)).size, links.length);
    assert.ok(links.reduce((sum, link) => sum + link.meters, 0) <= meters);
    assert.ok(links.reduce((sum, link) => sum + link.baselineSeconds, 0) <= baselineSeconds);
  }
});

const routes = [{
  id: 'dest',
  meters: 1000,
  baselineSeconds: 100,
  links: [
    {id: '1100000100', meters: 600, baselineSeconds: 50},
    {id: '1100000200', meters: 100, baselineSeconds: 15},
  ],
}];

test('a live matched link replaces its own baseline, leaving all other segments intact', () => {
  assert.deepEqual(estimateRoutes(routes, new Map([['1100000100', 18]])), [
    {id: 'dest', meters: 1000, seconds: 170, coverage: 60},
  ]);
  assert.equal(estimateRoutes(routes, new Map())[0].seconds, 100);
});

test('TOPIS shares the snapshot and refreshes after ten minutes', async t => {
  let now = 10000000;
  let requests = 0;
  let online = true;
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async url => {
    requests += 1;
    if (!online) throw new Error('unavailable');
    const id = String(url).endsWith('1100000100') ? '1100000100' : 'wrong-id';
    return new Response(`<TrafficInfo><CODE>INFO-000</CODE><row><link_id>${id}</link_id><prcs_spd>18</prcs_spd></row></TrafficInfo>`);
  });

  const get = () => fixedRoads(new Request('http://localhost/api/roads/fixed'), {TOPIS_OPEN_DATA_KEY: 'test'}, routes);
  const [a, b] = await Promise.all([get(), get()]);
  assert.deepEqual(await a.json(), await b.json());
  assert.equal(requests, 2);
  now += refreshInterval - 1;
  assert.equal((await (await get()).json()).routes[0].coverage, 60);
  assert.equal(requests, 2);
  now += 1;
  online = false;
  const stale = await (await get()).json();
  assert.equal(stale.checkedAt, now);
  assert.equal(stale.updatedAt, now - refreshInterval);
  assert.equal(requests, 4);
});

function post(body, ip = 'test-client', extra = {}) {
  return new Request('http://localhost/api/roads/directions', {
    method: 'POST',
    headers: {'Content-Type': 'application/json', 'CF-Connecting-IP': ip, ...extra},
    body: JSON.stringify(body),
  });
}

test('Kakao searches once and requests a fresh estimate for each selection', async t => {
  const calls = [];
  const env = {KAKAO_MOBILITY_REST_API_KEY: 'test-secret'};
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push(url);
    assert.equal(options.headers.Authorization, 'KakaoAK test-secret');
    assert.equal(options.cache, 'no-store');
    if (url.hostname === 'dapi.kakao.com') {
      assert.equal(url.searchParams.get('query'), '마곡나루역');
      return Response.json({documents: [
        {id: '1', place_name: '마곡나루역', x: '126.8272', y: '37.5672'},
        {id: '2', place_name: 'invalid', x: '', y: '37.5672'},
      ]});
    }
    assert.equal(url.searchParams.get('origin'), `${origin.lon},${origin.lat}`);
    assert.equal(url.searchParams.get('destination'), '126.8272,37.5672');
    return Response.json({routes: [{result_code: 0, summary: {distance: 5200, duration: 780}}]});
  });
  const search = await kakaoRoads('search', post({query: ' 마곡나루역 '}), env, origin);
  const {places} = await search.json();
  assert.equal(places.length, 1);
  assert.equal(calls.length, 1);
  const [place] = places;
  for (let i = 0; i < 2; i += 1) {
    const result = await kakaoRoads('directions', post(place), env, origin);
    assert.equal(result.headers.get('Cache-Control'), 'no-store');
    assert.equal((await result.json()).seconds, 780);
  }
  assert.equal(calls.length, 3);
  assert.equal((await kakaoRoads('directions', post({lat: 1, lon: 2}), env, origin)).status, 400);
  assert.equal((await kakaoRoads('search', post({query: 'a'.repeat(3000)}), env, origin)).status, 400);
  assert.equal((await kakaoRoads('search', post({query: '마곡'}, 'other', {Origin: 'https://other.net'}), env, origin)).status, 403);
  for (let i = 0; i < 10; i += 1) {
    assert.equal((await kakaoRoads('directions', post(place, 'limited'), env, origin)).status, 200);
  }
  assert.equal((await kakaoRoads('directions', post(place, 'limited'), env, origin)).status, 429);
});
