import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {createNeighborhoodReader, mergeEvents} from './neighborhood.mjs';
import {openLocalNoticeDatabase} from './apartment-notices-local.mjs';
import {fetchCulture, fetchReservations, parseBotanicEvent, parseDistrictNotices, parseNewsletterList, parseBlogDate} from './neighborhood-sources.mjs';
import {fetchDistrictCulture, fetchGangseoLibrary, fetchLgArt, fetchNotices, fetchSeoulLibrary} from './neighborhood-sources.mjs';

const gardenDates = ['2026-11-13', '2026-11-14', '2026-11-27', '2026-11-28'];
const reservationId = 'S261102100634309493';
const organizer = `<h4 class="subject">[행사] [예약마감] 서울식물원 전시온실 야간개장 사전예약 안내</h4>
  <p><strong>운영 일시:</strong> 2026. 11. 13.(금) ~ 11. 14.(토) / 11. 27.(금) ~ 11. 28.(토) (18:30 ~ 20:30)</p>
  <p><strong>예약 오픈:</strong> 2026. 11. 3.(화) 10:00 ~</p>
  <a href="https://yeyak.seoul.go.kr/web/reservation/selectReservView.do?rsv_svc_id=${reservationId}">공공서비스예약 바로가기</a>`;

function event(overrides = {}) {
  return {
    id: 'event:1', title: '서울식물원 전시온실 야간개장', category: '문화행사',
    place: '서울식물원', url: 'https://botanicpark.seoul.go.kr/front/board/newsView.do?sn=20821',
    dates: [], range: null, reservation: null, servicePeriod: null, ...overrides,
  };
}

test('organizer text yields only the four actual occurrence dates', () => {
  const item = parseBotanicEvent(organizer);
  assert.deepEqual(item.dates, gardenDates);
  assert.equal(item.reservationId, reservationId);
  for (const day of ['2026-11-02', '2026-11-15', '2026-11-26']) {
    assert.ok(!item.dates.includes(day));
  }
});

test('reservation and organizer merge without marking the service period', () => {
  const exact = event({id: 'botanic:20821', dates: gardenDates, reservationId});
  const booking = event({
    id: 'reservation:' + reservationId,
    reservationId,
    servicePeriod: {start: '2026-11-02', end: '2026-11-28'},
    reservation: {opensAt: '2026-11-03T10:00:00+09:00', closesAt: null, status: '예약마감', url: 'https://yeyak.seoul.go.kr/'},
  });
  const [result] = mergeEvents([[exact], [booking]]);
  assert.deepEqual(mergeEvents([[exact], [booking]]).map(row => row.id), [exact.id]);
  assert.deepEqual(result.dates, gardenDates);
  assert.deepEqual(result.reservation, booking.reservation);
  assert.deepEqual(result.servicePeriod, booking.servicePeriod);
  assert.equal(result.range, null);
});

test('board parsers keep public titles, dates and original links', () => {
  const notices = parseDistrictNotices(`<table><tbody><tr><td>11588</td>
    <td><a href="/gs040101/325985?curPage=1">강서까치뉴스 &amp; 명예기자 모집</a></td>
    <td>홍보소통과</td><td>2026-11-23</td><td>168</td></tr></tbody></table>`);
  assert.equal(notices[0].title, '강서까치뉴스 & 명예기자 모집');
  assert.equal(notices[0].publishedOn, '2026-11-23');
  assert.equal(new URL(notices[0].url).pathname, '/gs040101/325985');

  const news = parseNewsletterList(`<ul><li><a href="https://blog.naver.com/gangseokkachi/224488041055">
    <div class="subject">주간강서까치뉴스 제1012호</div></a></li>
    <li><a href="https://evil.example/gangseokkachi/2"><div class="subject">외부 링크</div></a></li></ul>`);
  assert.equal(news.length, 1);
  assert.equal(news[0].kind, 'news');
  assert.equal(parseBlogDate('<p class="blog_date"><span class="txt">2026. 11. 23. 10:25</span></p>'), '2026-11-23');
});

test('live data adapters limit the sample request and distinguish service dates', async t => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async url => {
    const path = new URL(String(url)).pathname;
    calls.push(path);
    const service = path.split('/')[3];
    const row = service === 'culturalEventInfo' ? [
      {GUNAME: '강서구', TITLE: '하루 공연', PLACE: '강서아트리움', STRTDATE: '2026-11-27 00:00:00.0', END_DATE: '2026-11-27 00:00:00.0', ORG_LINK: 'https://culture.gangseo.seoul.kr/'},
      {GUNAME: '종로구', TITLE: '다른 구', STRTDATE: '2026-11-27', END_DATE: '2026-11-27', ORG_LINK: 'https://culture.seoul.go.kr/'},
    ] : [
      {AREANM: '강서구', SVCID: reservationId, SVCNM: '서울식물원 야간개장', PLACENM: '서울식물원',
        SVCOPNBGNDT: '2026-11-02 00:00:00.0', SVCOPNENDDT: '2026-11-28 00:00:00.0', SVCSTATNM: '예약마감',
        SVCURL: 'https://yeyak.seoul.go.kr/web/reservation/selectReservView.do?rsv_svc_id=' + reservationId},
    ];
    return Response.json({[service]: {RESULT: {CODE: 'INFO-000'}, list_total_count: row.length, row}});
  });
  t.mock.method(Date, 'now', () => Date.parse('2026-11-27T12:00:00+09:00'));
  const culture = await fetchCulture('sample');
  const bookings = await fetchReservations('sample');
  assert.equal(culture.length, 1);
  assert.deepEqual(culture[0].dates, ['2026-11-27']);
  assert.equal(bookings.length, 1);
  assert.deepEqual(bookings[0].dates, []);
  assert.deepEqual(bookings[0].servicePeriod, {start: '2026-11-02', end: '2026-11-28'});
  assert.equal(calls.length, 2);
  assert.ok(calls.every(path => path.includes('/sample/json/') && path.includes('/1/5')));
});

test('a three-hour refresh retains the last success separately for each source', async () => {
  let clock = Date.parse('2026-11-27T12:00:00+09:00');
  const successes = clock;
  let offline = false;
  const calls = {notices: 0, news: 0};
  const loaders = {
    notices: async () => {
      calls.notices += 1;
      if (offline) throw new Error('upstream timeout');
      return [{id: 'notice', kind: 'notice', title: '구청 공지', publishedOn: '2026-11-23', url: 'https://www.gangseo.seoul.kr/gs040101/325985'}];
    },
    news: async () => {
      calls.news += 1;
      return [{id: 'news', kind: 'news', title: '까치뉴스', publishedOn: null, url: 'https://www.gangseo.seoul.kr/gs040404'}];
    },
  };
  const reader = createNeighborhoodReader({now: () => clock, loaders});
  // Store serialized responses to exercise the same cache operations as Sites.
  const stored = new Map();
  const cache = {
    match: async request => stored.has(request.url) ? new Response(stored.get(request.url)) : undefined,
    put: async (request, response) => stored.set(request.url, await response.text()),
  };
  const get = () => reader(new Request('https://resident.test/api/neighborhood?section=notices'), {}, cache);
  const first = await get();
  assert.deepEqual(first.notices.map(row => row.id), ['notice', 'news']);
  assert.deepEqual(calls, {notices: 1, news: 1});
  const refresh = 3 * 60 * 60 * 1000;
  clock += refresh - 1;
  await get();
  assert.deepEqual(calls, {notices: 1, news: 1});
  clock += 1;
  offline = true;
  const partial = await get();
  assert.deepEqual(partial.sources.map(item => [item.id, item.state, item.updatedAt]), [
    ['notices', 'stale', successes], ['news', 'fresh', clock],
  ]);
  assert.deepEqual(partial.notices, first.notices);
  clock += 1;
  await get();
  assert.deepEqual(calls, {notices: 2, news: 2});
  clock = successes + 7 * 24 * 60 * 60 * 1000;
  const expired = await get();
  assert.deepEqual(expired.notices.map(row => row.id), ['news']);
  assert.deepEqual(expired.sources.map(item => [item.id, item.state]), [
    ['notices', 'unavailable'], ['news', 'fresh'],
  ]);
});

test('events use the TOPIS key first, with a fallback for existing event-only settings', async () => {
  const usedKeys = [];
  const collector = createNeighborhoodReader({loaders: {
    botanic: async () => [event({dates: gardenDates})],
    culture: async key => { usedKeys.push(key); return []; },
    reservations: async key => { usedKeys.push(key); return []; },
  }});
  const request = new Request('https://resident.test/api/neighborhood?section=events');
  const noKey = await collector(request, {});
  const keyStates = data => data.sources.filter(source => ['culture', 'reservations'].includes(source.id)).map(source => source.state);
  assert.deepEqual(keyStates(noKey), ['unconfigured', 'unconfigured']);
  assert.deepEqual(noKey.events[0].dates, gardenDates);
  assert.deepEqual(usedKeys, []);
  const sample = await collector(request, {SEOUL_OPEN_DATA_KEY: 'unused', TOPIS_OPEN_DATA_KEY: ' sample '});
  assert.deepEqual(keyStates(sample), ['limited', 'limited']);
  assert.deepEqual(usedKeys, ['sample', 'sample']);
  const fallback = await collector(request, {TOPIS_OPEN_DATA_KEY: ' ', SEOUL_OPEN_DATA_KEY: 'fixture-key'});
  assert.deepEqual(keyStates(fallback), ['fresh', 'fresh']);
  assert.deepEqual(usedKeys, ['sample', 'sample', 'fixture-key', 'fixture-key']);
});

test('district calendar groups repeated exhibition dates and keeps a single concert date', async t => {
  t.mock.method(Date, 'now', () => Date.parse('2026-11-25T12:00:00+09:00'));
  const rows = [
    [271, '공연', '송년음악회', '19'],
    [270, '전시', '정기전', '18'],
    [270, '전시', '정기전', '19'],
  ].map(([id, kind, title, date]) =>
    '<a href="#" class="target">' + title + '</a><span class="label-st1 gs">강서아트리움</span>'
      + '<span class="label-st2">' + kind + '</span><strong> 일</strong><div>2026년 12월 ' + date
      + '일 16:00</div><button onclick="moveToDetail(\'' + id + '\')">상세보기</button>').join('');
  t.mock.method(globalThis, 'fetch', async url => {
    const date = new URL(url).searchParams.get('searchDate');
    return new Response('<input name="searchDate" value="' + date + '"><table class="calendar">'
      + (date === '2026-12-01' ? rows : '') + '</table>');
  });
  const [concert, exhibition] = await fetchDistrictCulture();
  assert.deepEqual(concert.dates, ['2026-12-19']);
  assert.deepEqual(exhibition.dates, []);
  assert.deepEqual(exhibition.range, {start: '2026-12-18', end: '2026-12-19'});
  const duplicate = {...concert, id: 'culture:271', organizerId: concert.id, title: '서울시 페이지 제목', dates: ['2026-12-20']};
  const merged = mergeEvents([[concert], [duplicate]]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].title, concert.title);
  assert.equal(merged[0].url, concert.url);
  assert.deepEqual(merged[0].dates, concert.dates);
});

test('LG performances only mark published sessions in the matching month', async t => {
  t.mock.method(Date, 'now', () => Date.parse('2026-11-25T12:00:00+09:00'));
  t.mock.method(globalThis, 'fetch', async value => {
    const url = new URL(value);
    if (url.searchParams.has('year')) return Response.json({Schedule: [{Days: [{
      DetailsUrl: 'https://www.lgart.com/product/performance/251', Title: '뮤지컬 <예시>', Place: '홀',
      PlayBeginDate: '20261201', PlayEndDate: '20261231', GenreName: '뮤지컬',
    }]}]});
    assert.equal(url.pathname, '/product/ko/performance/251/calendar/2026/12');
    return Response.json({Year: 2026, Month: 12, Weeks: [[
      {IsPlayDay: true, Date: '2026-12-05 (토)'}, {IsPlayDay: false, Date: '2026-12-06 (일)'},
      {IsPlayDay: true, Date: '2027-01-01 (금)'},
    ]]});
  });
  const [performance] = await fetchLgArt();
  assert.deepEqual(performance.dates, ['2026-12-05']);
  assert.equal(performance.title, '뮤지컬 〈예시〉');
  assert.deepEqual(performance.range, {start: '2026-12-01', end: '2026-12-31'});
});

test('library dates describe the actual class and enrollment stays separate', async t => {
  t.mock.method(Date, 'now', () => Date.parse('2026-11-25T12:00:00+09:00'));
  t.mock.method(globalThis, 'fetch', async (value, options) => {
    const url = new URL(value);
    if (url.hostname === 'lib.gangseo.seoul.kr') {
      assert.equal(options.headers.Accept, 'application/json');
      return Response.json({status: 'OK', data: {data: [{
        leCode: 37, leLGCode: 10, leLName: '북 퍼퓸 만들기', libNameS: '가양', leArea: '제1강의실',
        leOpenSDateFmt: '2026.12.08', leOpenEDateFmt: '2026.12.08',
        leTakeSDate: Date.parse('2026-11-30T10:00:00+09:00') / 1000, leMoney: '0',
      }, {
        leCode: 38, leLGCode: 10, leLName: '문화예술탐방', libNameS: '가양', leArea: '백남준아트센터',
        leOpenSDateFmt: '2026.12.12', leOpenEDateFmt: '2026.12.12',
      }]}});
    }
    assert.equal(options.headers.Accept, 'text/html');
    return new Response('<ul class="teach_list"><a keyValue1="9" keyValue3="1" class="detail-btn">'
      + '<b class="title">예술무대</b><span>강의기간</span>2026-12-09~2026-12-23'
      + '<span>접수기간</span>2026-11-20~2026-11-20</a></ul>');
  });
  const [oneDay, tour] = await fetchGangseoLibrary();
  assert.deepEqual(oneDay.dates, ['2026-12-08']);
  assert.equal(oneDay.place, '가양도서관 제1강의실');
  assert.equal(oneDay.reservation.opensAt, '2026-11-30T01:00:00.000Z');
  assert.equal(tour.place, '백남준아트센터');
  assert.equal(tour.institution, '가양도서관');
  const [period] = await fetchSeoulLibrary();
  assert.deepEqual(period.dates, []);
  assert.deepEqual(period.range, {start: '2026-12-09', end: '2026-12-23'});
});

test('the shared request uses Workers-compatible redirects and never follows them', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(new URL(url).hostname, 'www.gangseo.seoul.kr');
    assert.equal(options.redirect, 'manual');
    return Response.redirect('https://example.com/', 302);
  });
  await assert.rejects(fetchNotices(), {message: 'source_http_error'});
  assert.equal(fetch.mock.callCount(), 1);
});

test('event snapshots survive reopening and refresh hourly without delaying a warm page', async t => {
  const directory = mkdtempSync(join(tmpdir(), 'hansarang-events-test-'));
  const path = join(directory, 'local.sqlite');
  let db = openLocalNoticeDatabase(path);
  t.after(() => {
    db.close();
    rmSync(directory, {recursive: true, force: true});
  });
  let clock = Date.parse('2026-11-25T10:10:00Z');
  let calls = 0;
  let title = '저장된 행사';
  const loaders = {botanic: async () => {
    calls++;
    if (!title) throw new Error('source offline');
    return [event({title})];
  }};
  const request = new Request('https://resident.test/api/neighborhood?section=events');
  const makeReader = () => createNeighborhoodReader({loaders, now: () => clock});
  let reader = makeReader();
  const first = await reader(request, {DB: db});
  assert.equal(first.storage, 'd1');
  assert.equal(first.events[0].title, title);
  assert.equal(first.sources[0].checkedAt, clock);
  db.close();
  db = openLocalNoticeDatabase(path);
  reader = makeReader();
  clock += 49 * 60_000;
  assert.equal((await reader(request, {DB: db})).events[0].title, title);
  assert.equal(calls, 1);

  title = '갱신된 행사';
  clock += 60_000;
  const jobs = [];
  const warm = await reader(request, {DB: db}, undefined, {waitUntil: job => jobs.push(job)});
  assert.equal(warm.events[0].title, '저장된 행사');
  assert.equal(warm.sources[0].state, 'stale');
  assert(jobs.length > 0);
  await Promise.all(jobs);
  assert.equal((await reader(request, {DB: db})).events[0].title, title);
  assert.equal(calls, 2);

  title = null;
  clock += 60 * 60_000;
  const waitRequest = new Request(request.url + '&wait=1');
  const failed = await reader(waitRequest, {DB: db}, undefined, {waitUntil: () => assert.fail('expected awaited refresh')});
  assert.equal(failed.events[0].title, '갱신된 행사');
  assert.equal(failed.sources[0].state, 'stale');
  assert.equal(failed.sources[0].checkedAt, clock);
  assert.equal((await reader(waitRequest, {DB: db})).events[0].title, '갱신된 행사');
  assert.equal(calls, 3);
});

test('a D1 event refresh lease prevents concurrent fetches and fences a late writer', async t => {
  const db = openLocalNoticeDatabase(':memory:');
  t.after(() => db.close());
  const request = new Request('https://resident.test/api/neighborhood?section=events&wait=1');
  let clock = Date.parse('2026-11-25T10:10:00Z');
  let calls = 0;
  const pending = Promise.withResolvers();
  const started = Promise.withResolvers();
  const first = createNeighborhoodReader({now: () => clock, loaders: {botanic: async () => {
    calls++;
    started.resolve();
    return pending.promise;
  }}});
  const second = createNeighborhoodReader({now: () => clock, loaders: {botanic: async () => {
    calls++;
    return [event({title: '현재 행사'})];
  }}});
  const old = first(request, {DB: db});
  await started.promise;
  try {
    await second(request, {DB: db});
    assert.equal(calls, 1);
    clock += 46_000;
    const recovered = await second(request, {DB: db});
    assert.equal(recovered.events[0].title, '현재 행사');
    assert.equal(calls, 2);
    pending.resolve([event({title: '늦게 도착한 예전 행사'})]);
    await old;
    assert.equal((await second(request, {DB: db})).events[0].title, '현재 행사');
  } finally {
    pending.resolve([]);
    await old;
  }
});

test('event snapshots keep the public sample and registered keys separate', async t => {
  const db = openLocalNoticeDatabase(':memory:');
  t.after(() => db.close());
  const request = new Request('https://resident.test/api/neighborhood?section=events');
  const reader = createNeighborhoodReader({loaders: {culture: async key => [event({id: key, title: key})]}});
  const sample = await reader(request, {DB: db, TOPIS_OPEN_DATA_KEY: 'sample'});
  const live = await reader(request, {DB: db, TOPIS_OPEN_DATA_KEY: 'fixture'});
  assert.equal(sample.events[0].title, 'sample');
  assert.equal(live.events[0].title, 'fixture');
  assert.equal((await reader(request, {DB: db})).events.length, 0);
});
