import assert from 'node:assert/strict';
import {test} from 'node:test';
import {openLocalNoticeDatabase} from './apartment-notices-local.mjs';
import {parseOpenMeteo, parseVilage} from './services.mjs';

const now = Date.parse('2026-11-25T16:30:00+09:00');
const hour = 3600000;

function villageHour(date, time, values = {}) {
  return Object.entries({TMP: '8', SKY: '1', PTY: '0', POP: '20', ...values})
    .filter(([, value]) => value !== undefined)
    .map(([category, fcstValue]) => ({fcstDate: date.replaceAll('-', ''), fcstTime: String(time).padStart(2, '0') + '00', category, fcstValue}));
}

function meteo(overrides = {}) {
  const times = Array.from({length: 24}, (_, i) => new Date(Date.parse('2026-11-25T16:00:00+09:00') + i * hour + 9 * hour).toISOString().slice(0, 16));
  return {
    current: {time: '2026-11-25T16:15', temperature_2m: 8.5, apparent_temperature: 6.2, weather_code: 2, is_day: 1},
    hourly: {time: times, temperature_2m: times.map((_, i) => 8 - i / 2),
      weather_code: times.map(() => 2), precipitation_probability: times.map((_, i) => i),
      is_day: times.map(time => +time.slice(11, 13) >= 6 && +time.slice(11, 13) < 18 ? 1 : 0)},
    daily: {time: ['2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29'],
      temperature_2m_min: [2, 3, 4, 5, 6], temperature_2m_max: [10, 11, 12, 13, 14],
      weather_code: [2, 61, 3, 0, 1], precipitation_probability_max: [20, 90, 40, 0, 10]},
    ...overrides,
  };
}

test('KMA forecasts stay ordered across Seoul midnight and keep missing probability distinct from zero', () => {
  const currentTime = Date.parse('2026-11-25T23:35:00+09:00');
  const items = [
    ...villageHour('2026-11-25', 22, {TMP: '99'}),
    ...villageHour('2026-11-25', 23, {TMP: '-1', POP: undefined}),
    ...Array.from({length: 14}, (_, i) => villageHour('2026-11-26', i, {TMP: String(i), POP: '0'})).flat(),
    ...villageHour('2026-02-31', 23, {TMP: '99'}),
  ].reverse();
  const result = parseVilage(items, currentTime);
  assert.equal(result.source, '기상청');
  assert.equal(result.temperature, -1);
  assert.equal(result.probability, null);
  assert.equal(result.time, '2026-11-25T14:00:00.000Z');
  assert.equal(result.hourly.length, 12);
  assert.equal(result.hourly[1].time, '2026-11-25T15:00:00.000Z');
  assert.equal(result.hourly[1].probability, 0);
  assert.equal(result.hourly[1].isDay, false);
  assert.equal(result.hourly[7].isDay, true);
  assert.deepEqual(result.daily.map(row => row.date), ['2026-11-25', '2026-11-26']);
  assert.equal(Object.hasOwn(result, 'feelsLike'), false);
});

test('KMA daily extrema use published values and derive each missing bound only from a complete day', () => {
  const items = [
    ...Array.from({length: 8}, (_, i) => villageHour('2026-11-25', i + 16, {TMP: String(i + 4)})).flat(),
    ...villageHour('2026-11-25', 6, {TMP: undefined, SKY: undefined, PTY: undefined, TMN: '-3'}),
    ...Array.from({length: 24}, (_, i) => villageHour('2026-11-26', i, {TMP: String(i - 4), PTY: i === 15 ? '1' : '0', POP: i === 15 ? '80' : '10'})).flat(),
    ...Array.from({length: 24}, (_, i) => villageHour('2026-11-27', i, {TMP: String(i), TMN: i === 6 ? '-8' : undefined})).flat(),
    ...Array.from({length: 23}, (_, i) => villageHour('2026-11-28', i + 1, {TMP: String(i), TMX: i === 14 ? '30' : undefined})).flat(),
    ...villageHour('2026-11-29', 10, {TMN: '0', TMX: '10'}),
  ];
  const {daily} = parseVilage(items, now);
  assert.equal(daily.length, 4);
  assert.deepEqual(daily[0], {date: '2026-11-25', low: -3, high: null, code: 0, probability: 20});
  assert.deepEqual(daily[1], {date: '2026-11-26', low: -4, high: 19, code: 61, probability: 80});
  assert.deepEqual(daily[2], {date: '2026-11-27', low: -8, high: 23, code: 0, probability: 20});
  assert.deepEqual(daily[3], {date: '2026-11-28', low: null, high: 30, code: 0, probability: 20});
});

test('KMA skips incomplete hourly rows and rejects an entirely expired forecast', () => {
  const result = parseVilage([
    ...villageHour('2026-11-25', 16, {TMP: null}),
    ...villageHour('2026-11-25', 17, {PTY: undefined}),
    ...villageHour('2026-11-25', 18, {TMP: '-999', PTY: '1'}),
    ...villageHour('2026-11-25', 19, {TMP: '3', PTY: '3', POP: ''}),
  ], now);
  assert.equal(result.hourly.length, 1);
  assert.equal(result.hourly[0].code, 71);
  assert.equal(result.hourly[0].isDay, false);
  assert.equal(result.hourly[0].probability, null);
  assert.throws(() => parseVilage(villageHour('2026-11-25', 15), now), /단기예보/);
});

test('Open-Meteo normalizes real forecast arrays, Seoul dates, and reported apparent temperature', () => {
  const result = parseOpenMeteo(meteo(), now);
  assert.equal(result.source, 'Open-Meteo');
  assert.equal(result.temperature, 8.5);
  assert.equal(result.feelsLike, 6.2);
  assert.equal(result.time, '2026-11-25T07:15:00.000Z');
  assert.equal(result.probability, 0);
  assert.equal(result.hourly.length, 12);
  assert.deepEqual(result.hourly[0], {time: '2026-11-25T07:00:00.000Z', temperature: 8, code: 2, isDay: true, probability: 0});
  assert.equal(result.hourly[2].isDay, false);
  assert.deepEqual(result.daily, [
    {date: '2026-11-25', low: 2, high: 10, code: 2, probability: 20},
    {date: '2026-11-26', low: 3, high: 11, code: 61, probability: 90},
    {date: '2026-11-27', low: 4, high: 12, code: 3, probability: 40},
    {date: '2026-11-28', low: 5, high: 13, code: 0, probability: 0},
  ]);
});

test('Open-Meteo preserves a fresh current reading when forecast series are partial or absent', () => {
  const raw = meteo();
  raw.current.apparent_temperature = null;
  raw.hourly.temperature_2m[0] = null;
  raw.hourly.weather_code[1] = -1;
  raw.hourly.is_day[2] = null;
  raw.hourly.precipitation_probability[3] = null;
  raw.daily.temperature_2m_min[0] = null;
  raw.daily.temperature_2m_max[1] = null;
  raw.daily.precipitation_probability_max[2] = '';
  const result = parseOpenMeteo(raw, now);
  assert.equal(Object.hasOwn(result, 'feelsLike'), false);
  assert.equal(result.probability, 0);
  assert.equal(result.hourly[0].time, '2026-11-25T10:00:00.000Z');
  assert.equal(result.hourly[0].probability, null);
  assert.equal(result.daily[0].low, null);
  assert.equal(result.daily[1].high, null);
  assert.equal(result.daily[2].probability, null);
  const currentOnly = parseOpenMeteo({current: raw.current}, now);
  assert.deepEqual(currentOnly.hourly, []);
  assert.deepEqual(currentOnly.daily, []);
  assert.equal(currentOnly.probability, null);
});

test('Open-Meteo rejects stale and malformed current values and accepts a zoned timestamp', () => {
  const raw = meteo();
  raw.current.time = '2026-11-25T13:00';
  assert.throws(() => parseOpenMeteo(raw, now), /예보 지연/);
  raw.current.time = '2026-11-25T07:15:00Z';
  assert.equal(parseOpenMeteo(raw, now).time, '2026-11-25T07:15:00.000Z');
  raw.current.temperature_2m = null;
  assert.throws(() => parseOpenMeteo(raw, now), /예보 응답 오류/);
});

const kmaResponse = items => Response.json({response: {header: {resultCode: '00'}, body: {items: {item: items}}}});
const noWarnings = () => new Response('<p>특보 내용 : 현재 발효 중인 특보 없음</p>');
let freshImport = 0;
async function weatherService() { return (await import('./services.mjs?weather-test=' + ++freshImport)).services; }

test('the official KMA path fills the missing low from a full-day forecast without overriding the high', async t => {
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async requestUrl => {
    const url = new URL(requestUrl);
    if (url.pathname.endsWith('/getVilageFcst')) return kmaResponse(villageHour('2026-11-25', 16, {TMX: '11'}));
    if (url.pathname.endsWith('/getUltraSrtNcst')) return kmaResponse([{category: 'T1H', obsrValue: '4.2'}]);
    if (url.pathname.endsWith('/getWthrWrnList')) return kmaResponse([{title: '서울 서남권 호우주의보'}]);
    if (url.hostname === 'api.open-meteo.com') return Response.json(meteo());
    assert.fail('unexpected weather source');
  });
  const result = await (await weatherService())('weather', {DATA_GO_KR_KEY: 'fixture'});
  assert.equal(result.conditions.source, '기상청');
  assert.equal(result.conditions.temperature, 4.2);
  assert.equal(result.conditions.hourly[0].temperature, 8);
  assert.equal(result.conditions.daily[0].high, 11);
  assert.equal(result.conditions.daily[0].low, 2);
  assert.equal(Object.hasOwn(result.conditions, 'via'), false);
  assert.deepEqual(result.alerts, ['호우주의보']);
});

test('the KMA proxy reports its route and forecasts survive a warning-source failure', async t => {
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async requestUrl => {
    const url = new URL(requestUrl);
    if (url.hostname === 'k-skill-proxy.nomadamas.org') return kmaResponse(villageHour('2026-11-25', 16));
    throw new Error('warnings unavailable');
  });
  const result = await (await weatherService())('weather', {});
  assert.equal(result.conditions.source, '기상청');
  assert.equal(result.conditions.via, '보조 경유');
  assert.equal(result.conditions.hourly.length, 1);
  assert.equal(result.alerts, null);
});

test('Open-Meteo fallback requests the actual forecast fields and preserves available alerts', async t => {
  t.mock.method(Date, 'now', () => now);
  let fallbackCalled = false;
  t.mock.method(globalThis, 'fetch', async requestUrl => {
    const url = new URL(requestUrl);
    if (url.hostname === 'api.open-meteo.com') {
      fallbackCalled = true;
      assert.equal(url.searchParams.get('forecast_days'), '4');
      assert.equal(url.searchParams.get('timezone'), 'Asia/Seoul');
      assert.ok(url.searchParams.get('current').includes('apparent_temperature'));
      assert.ok(url.searchParams.get('hourly').includes('temperature_2m'));
      assert.ok(url.searchParams.get('hourly').includes('is_day'));
      assert.ok(url.searchParams.get('daily').includes('temperature_2m_min'));
      assert.ok(url.searchParams.get('daily').includes('temperature_2m_max'));
      return Response.json(meteo());
    }
    if (url.hostname === 'www.weather.go.kr') return noWarnings();
    throw new Error('KMA unavailable');
  });
  const result = await (await weatherService())('weather', {DATA_GO_KR_KEY: 'fixture'});
  assert.equal(fallbackCalled, true);
  assert.equal(result.conditions.source, 'Open-Meteo');
  assert.equal(Object.hasOwn(result.conditions, 'via'), false);
  assert.equal(result.conditions.hourly.length, 12);
  assert.equal(result.conditions.daily.length, 4);
  assert.deepEqual(result.alerts, []);
});

test('all forecast-source failures leave independently available warnings intact', async t => {
  t.mock.method(Date, 'now', () => now);
  t.mock.method(globalThis, 'fetch', async requestUrl => {
    if (new URL(requestUrl).hostname === 'www.weather.go.kr') return noWarnings();
    throw new Error('forecast unavailable');
  });
  const result = await (await weatherService())('weather', {});
  assert.equal(result.conditions, null);
  assert.deepEqual(result.alerts, []);
  assert.ok(Number.isFinite(Date.parse(result.checkedAt)));
});

test('D1 reuses hourly weather and retains the same Seoul date low after its forecast slot', async t => {
  const DB = openLocalNoticeDatabase(':memory:');
  t.after(() => DB.close());
  let time = now;
  let forecastCalls = 0;
  let fallbackCalls = 0;
  let unavailable = false;
  t.mock.method(Date, 'now', () => time);
  t.mock.method(globalThis, 'fetch', async requestUrl => {
    const url = new URL(requestUrl);
    if (url.hostname === 'www.weather.go.kr') return noWarnings();
    if (url.hostname === 'api.open-meteo.com') {
      fallbackCalls++;
      throw new Error('Daily fallback unavailable');
    }
    forecastCalls++;
    if (unavailable) throw new Error('Forecast unavailable');
    if (time === now) return kmaResponse([
      ...villageHour('2026-11-25', 6, {TMN: '-2'}),
      ...villageHour('2026-11-25', 16, {TMX: '11'}),
    ]);
    if (time >= Date.parse('2026-11-26T00:00:00+09:00')) {
      return kmaResponse(villageHour('2026-11-26', 0, {TMX: '9'}));
    }
    return kmaResponse(villageHour('2026-11-25', 17, {TMX: '12'}));
  });

  const getWeather = await weatherService();
  const first = await getWeather('weather', {DB});
  assert.equal(first.storage, 'd1');
  assert.equal(first.conditions.daily[0].low, -2);
  assert.deepEqual(await (await weatherService())('weather', {DB}), first);
  assert.equal(forecastCalls, 1);

  time += hour;
  const tasks = [];
  const previous = await getWeather('weather', {DB}, {context: {waitUntil(task) { tasks.push(task); }}});
  assert.equal(previous.conditionsStale, true);
  assert.equal(previous.conditions.daily[0].low, -2);
  await Promise.all(tasks);

  const updated = await getWeather('weather', {DB});
  assert.equal(updated.conditionsStale, false);
  assert.equal(updated.conditionsUpdatedAt, time);
  assert.equal(updated.conditions.daily[0].low, -2);
  assert.equal(updated.conditions.daily[0].high, 12);
  assert.equal(forecastCalls, 2);
  assert.equal(fallbackCalls, 0);

  time += hour;
  unavailable = true;
  const stale = await getWeather('weather', {DB}, {wait: true});
  assert.equal(stale.conditionsStale, true);
  assert.equal(stale.conditions.daily[0].low, -2);
  assert.deepEqual(stale.alerts, []);

  time = Date.parse('2026-11-26T00:30:00+09:00');
  unavailable = false;
  const tomorrow = await getWeather('weather', {DB}, {wait: true});
  assert.deepEqual(tomorrow.conditions.daily.map(day => [day.date, day.high, day.low]), [['2026-11-26', 9, null]]);
});
