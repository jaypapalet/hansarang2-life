import assert from 'node:assert/strict';
import test from 'node:test';

test('bus lookup falls back to Makka only for stops that fail on the official API', async t => {
  const official = [];
  const fallback = [];
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input);
    const id = url.searchParams.get('arsId');
    if (url.origin === 'https://makka.co.kr') {
      assert.equal(url.pathname, '/api/seoul-bus-stop-arrivals');
      assert.deepEqual([...url.searchParams.keys()], ['arsId']);
      fallback.push(id);
      return Response.json({status: 'ready', arrivals: [{routeName: '672', arrmsg1: '3분 후'}]});
    }
    assert.equal(url.origin, 'https://ws.bus.go.kr');
    assert.equal(url.pathname, '/api/rest/stationinfo/getStationByUid');
    assert.equal(url.searchParams.get('serviceKey'), 'test+/key');
    official.push(id);
    if (id === '16003') return new Response(null, { status: 503 });
    if (id === '16252') return Response.json({ msgHeader: { headerCd: '4' } });
    return Response.json({ msgHeader: { headerCd: '0' }, msgBody: { itemList: [{ rtNm: '660', arrmsg1: '2분 15초 후', arrmsg2: '6분 후' }] } });
  });
  const { transit } = await import('./transit.mjs?official');
  const result = await transit('bus', { DATA_GO_KR_KEY: 'test+/key' });
  assert.deepEqual(official.sort(), ['16003', '16004', '16251', '16252']);
  assert.deepEqual(fallback, ['16003']);
  assert.equal(result.status, 'ok');
  assert.equal(result.source, '서울특별시 버스정보시스템 / makka');
  assert.equal(result.stops.find(stop => stop.id === '16004').routes[0].second, '6분 후');
  assert.deepEqual(result.stops.find(stop => stop.id === '16252').routes, []);
  assert.equal(result.stops.find(stop => stop.id === '16003').routes[0].name, '672');
});

test('without an official key, Makka serves fresh stops and rejects stale responses', async t => {
  const requested = [];
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(input);
    assert.equal(url.origin, 'https://makka.co.kr');
    assert.equal(options.redirect, 'manual');
    const id = url.searchParams.get('arsId');
    requested.push(id);
    const headers = id === '16003' ? {Age: '121'} : id === '16251'
      ? {Date: new Date(Date.now() - 121_000).toUTCString()} : {};
    return Response.json({status: 'ready', arrivals: [{routeName: '660', arrmsg1: '곧 도착'}]}, {headers});
  });
  const { transit } = await import('./transit.mjs?unconfigured');
  const result = await transit('bus', {});
  assert.deepEqual(requested.sort(), ['16003', '16004', '16251', '16252']);
  assert.equal(result.source, 'makka');
  assert.equal(result.status, 'partial');
  assert.deepEqual(result.stops.filter(stop => stop.status === 'unavailable').map(stop => stop.id), ['16251', '16003']);
  assert.equal(result.stops.find(stop => stop.id === '16252').routes[0].first, '곧 도착');
});
