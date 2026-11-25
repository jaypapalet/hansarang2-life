import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createNeighborhoodReader, mergeEvents} from './neighborhood.mjs';
import {fetchCulture, fetchReservations, parseBotanicEvent, parseDistrictNotices, parseNewsletterList, parseBlogDate} from './neighborhood-sources.mjs';

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

test('missing keys leave public sources usable and sample results are marked limited', async () => {
  const usedKeys = [];
  const collector = createNeighborhoodReader({loaders: {
    botanic: async () => [event({dates: gardenDates})],
    culture: async key => { usedKeys.push(key); return []; },
    reservations: async key => { usedKeys.push(key); return []; },
  }});
  const request = new Request('https://resident.test/api/neighborhood?section=events');
  const noKey = await collector(request, {});
  assert.deepEqual(noKey.sources.map(source => source.state), ['fresh', 'unconfigured', 'unconfigured']);
  assert.deepEqual(noKey.events[0].dates, gardenDates);
  assert.deepEqual(usedKeys, []);
  const sample = await collector(request, {SEOUL_OPEN_DATA_KEY: 'sample', TOPIS_OPEN_DATA_KEY: 'unused'});
  assert.deepEqual(sample.sources.map(source => source.state), ['fresh', 'limited', 'limited']);
  assert.deepEqual(usedKeys, ['sample', 'sample']);
  const fallback = await collector(request, {TOPIS_OPEN_DATA_KEY: 'fixture-key'});
  assert.deepEqual(fallback.sources.map(source => source.state), ['fresh', 'fresh', 'fresh']);
  assert.deepEqual(usedKeys, ['sample', 'sample', 'fixture-key', 'fixture-key']);
});
