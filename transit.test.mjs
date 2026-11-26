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

test('subway requests use the official endpoint without following redirects', async t => {
  const stations = [];
  t.mock.method(globalThis, 'fetch', async (input, options) => {
    const url = new URL(input);
    const path = url.pathname.split('/');
    assert.equal(url.origin, 'http://swopenapi.seoul.go.kr');
    assert.equal(options.redirect, 'manual');
    assert.equal(decodeURIComponent(path[3]), 'test/key');
    stations.push(decodeURIComponent(path[8]));
    return path[5] === 'realtimePosition'
      ? Response.json({realtimePositionList: []})
      : Response.json({realtimeArrivalList: []});
  });
  const {transit} = await import('./transit.mjs?official-subway');
  const result = await transit('subway', {SEOUL_SUBWAY_KEY: ' test/key '});
  assert.equal(result.status, 'ok');
  assert.equal(result.source, '서울 열린데이터광장 공식 API');
  assert.deepEqual(stations, ['가양', '증미', '등촌', '염창', '9호선']);
});

test('Today requests only nearby arrivals and keeps the full subway response separate', async t => {
  const requested = [];
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input);
    assert.equal(url.origin, 'https://subway-live.com');
    const station = decodeURIComponent(url.pathname.split('/').at(-1));
    const position = url.pathname.includes('realtimePosition');
    requested.push(station);
    const observed = new Date().toISOString();
    return position
      ? Response.json({realtimePositionList: [{statnNm: '증미', subwayId: '1009', statnTnm: '개화', trainNo: '9010', recptnDt: observed}]})
      : Response.json({realtimeArrivalList: [{statnNm: station, subwayId: '1009', bstatnNm: '개화', barvlDt: 120, btrainNo: '9010', recptnDt: observed}]});
  });
  const {transit} = await import('./transit.mjs?nearby');
  const today = await transit('subway', {}, {arrivalsOnly: true});
  assert.deepEqual(requested, ['증미', '등촌']);
  assert.equal(today.status, 'ok');
  assert.deepEqual(today.arrivals.map(row => row.station), ['증미', '등촌']);

  requested.length = 0;
  const full = await transit('subway');
  assert.deepEqual(requested, ['가양', '증미', '등촌', '염창', '9호선']);
  assert.equal(full.trains[0].train, '9010');
  assert.equal(await transit('subway', {}, {arrivalsOnly: true}), today);
});

test('nearby official arrivals use the public fallback if both stations fail', async t => {
  const requested = [];
  const warning = t.mock.method(console, 'warn', () => {});
  t.mock.method(globalThis, 'fetch', async input => {
    const url = new URL(input);
    assert.match(url.pathname, /realtimeStationArrival/);
    requested.push([url.hostname, decodeURIComponent(url.pathname.split('/').at(-1))]);
    return url.hostname === 'swopenapi.seoul.go.kr'
      ? new Response(null, {status: 503})
      : Response.json({realtimeArrivalList: []});
  });
  const {transit} = await import('./transit.mjs?nearby-official');
  const result = await transit('subway', {SEOUL_SUBWAY_KEY: 'test'}, {arrivalsOnly: true});
  assert.deepEqual(requested, [
    ['swopenapi.seoul.go.kr', '증미'], ['swopenapi.seoul.go.kr', '등촌'],
    ['subway-live.com', '증미'], ['subway-live.com', '등촌'],
  ]);
  assert.equal(result.status, 'ok');
  assert.equal(result.positionFailed, false);
  assert.deepEqual(warning.mock.calls[0].arguments[1], ['HTTP 503', 'HTTP 503']);
});
