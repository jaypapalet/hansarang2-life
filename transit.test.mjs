import assert from 'node:assert/strict';
import test from 'node:test';

test('bus lookup uses the official API for all four stops and preserves partial results', async t => {
  const requested = [];
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input);
    assert.equal(url.origin, 'https://ws.bus.go.kr');
    assert.equal(url.pathname, '/api/rest/stationinfo/getStationByUid');
    assert.equal(url.searchParams.get('serviceKey'), 'test+/key');
    const id = url.searchParams.get('arsId');
    requested.push(id);
    if (id === '16003') return new Response(null, { status: 503 });
    if (id === '16252') return Response.json({ msgHeader: { headerCd: '4' } });
    return Response.json({ msgHeader: { headerCd: '0' }, msgBody: { itemList: [{ rtNm: '660', arrmsg1: '2분 15초 후', arrmsg2: '6분 후' }] } });
  });
  const { transit } = await import('./transit.mjs?official');
  const result = await transit('bus', { DATA_GO_KR_KEY: 'test+/key' });
  assert.deepEqual(requested.sort(), ['16003', '16004', '16251', '16252']);
  assert.equal(result.status, 'partial');
  assert.equal(result.source, '서울특별시 버스정보시스템');
  assert.equal(result.stops.find(stop => stop.id === '16004').routes[0].second, '6분 후');
  assert.deepEqual(result.stops.find(stop => stop.id === '16252').routes, []);
  assert.equal(result.stops.find(stop => stop.id === '16003').status, 'unavailable');
});

test('without an official key, bus lookup returns unavailable without making network requests', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => { throw new Error('unexpected fetch'); });
  const { transit } = await import('./transit.mjs?unconfigured');
  const result = await transit('bus', {});
  assert.equal(fetch.mock.callCount(), 0);
  assert.equal(result.source, null);
  assert.equal(result.status, 'unavailable');
  assert.equal(result.stops.length, 4);
  assert(result.stops.every(stop => stop.status === 'unavailable' && stop.routes.length === 0));
});
