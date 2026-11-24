const EV_STATIONS = [
  {id: 'PI766096', name: '한사랑2차삼성아파트', operator: '차지비', location: '지하 1층', residentsOnly: true},
  {id: 'PW801041', name: '한사랑2차삼성아파트(SP)', operator: '파워큐브', location: '204동 앞 지상', residentsOnly: true},
];
const EV_API = 'https://apis.data.go.kr/B552584/EvCharger/getChargerInfo';
const KMA_VILAGE = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0';
const KMA_WRN = 'https://apis.data.go.kr/1360000/WthrWrnInfoService/getWthrWrnList';
const DATA_GO_KR_EV = 'https://www.data.go.kr/data/15076352/openapi.do';
const DATA_GO_KR_KMA = 'https://www.data.go.kr/data/15084084/openapi.do';
const ALERTS_URL = 'https://www.weather.go.kr/w/wnuri-fct2021/weather/warning.do';
const KMA_PROXY_URL = 'https://k-skill-proxy.nomadamas.org/v1/korea-weather/forecast?nx=58&ny=126';
const FORECAST_URL = 'https://api.open-meteo.com/v1/forecast?latitude=37.5553&longitude=126.8586&current=temperature_2m,weather_code,is_day&hourly=precipitation_probability&timezone=Asia%2FSeoul&forecast_days=2';

// 기상청 격자 변환 (표준 LCC). 등촌1동 37.5553, 126.8586 → nx 58, ny 126.
export function toGrid(lat, lon) {
  const RE = 6371.00877, GRID = 5.0, SLAT1 = 30.0, SLAT2 = 60.0, OLON = 126.0, OLAT = 38.0, XO = 43, YO = 136;
  const DEGRAD = Math.PI / 180.0;
  const re = RE / GRID;
  const slat1 = SLAT1 * DEGRAD, slat2 = SLAT2 * DEGRAD, olon = OLON * DEGRAD, olat = OLAT * DEGRAD;
  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn);
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5);
  sf = Math.pow(sf, sn) * Math.cos(slat1) / sn;
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5);
  ro = re * sf / Math.pow(ro, sn);
  let ra = Math.tan(Math.PI * 0.25 + (lat * DEGRAD) * 0.5);
  ra = re * sf / Math.pow(ra, sn);
  let theta = lon * DEGRAD - olon;
  if (theta > Math.PI) theta -= 2.0 * Math.PI;
  if (theta < -Math.PI) theta += 2.0 * Math.PI;
  theta *= sn;
  return {x: Math.floor(ra * Math.sin(theta) + XO + 0.5), y: Math.floor(ro - ra * Math.cos(theta) + YO + 0.5)};
}

function kstParts(now) {
  const d = new Date(now + 9 * 3600000);
  return {year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours(), minute: d.getUTCMinutes()};
}
function ymd(p) { return String(p.year) + String(p.month).padStart(2, '0') + String(p.day).padStart(2, '0'); }

// 단기예보 base_time: 02/05/08/11/14/17/20/23시, 발표 10분 뒤부터 사용. 02:10 전이면 전날 23시.
export function vilageBase(now = Date.now()) {
  const p = kstParts(now);
  const min = p.hour * 60 + p.minute;
  const slots = [[130, '0200'], [310, '0500'], [490, '0800'], [670, '1100'], [850, '1400'], [1030, '1700'], [1210, '2000'], [1390, '2300']];
  let base = null;
  for (const [cut, t] of slots) if (min >= cut) base = t;
  if (!base) {
    const y = new Date(Date.UTC(p.year, p.month - 1, p.day) - 86400000);
    return {base_date: ymd({year: y.getUTCFullYear(), month: y.getUTCMonth() + 1, day: y.getUTCDate()}), base_time: '2300'};
  }
  return {base_date: ymd(p), base_time: base};
}

async function kmaJson(url) {
  const raw = await (await upstream(url)).json();
  const header = raw?.response?.header;
  if (header?.resultCode !== '00') throw new Error('기상청 응답 오류: ' + (header?.resultMsg || ''));
  const items = raw?.response?.body?.items?.item;
  return Array.isArray(items) ? items : items ? [items] : [];
}

// 단기예보: 현재 시각 이후 가장 가까운 예보 시각의 TMP·POP·SKY·PTY를 쓴다.
// SKY/PTY를 Open-Meteo weather_code 체계로 바꿔 기존 아이콘을 그대로 쓴다.
export function parseVilage(items, now = Date.now()) {
  const p = kstParts(now);
  const hourStart = Date.UTC(p.year, p.month - 1, p.day, p.hour) - 9 * 3600000;
  const byTime = new Map();
  for (const it of items) {
    const t = Date.parse(String(it.fcstDate).slice(0, 4) + '-' + String(it.fcstDate).slice(4, 6) + '-' + String(it.fcstDate).slice(6) + 'T' + String(it.fcstTime).slice(0, 2) + ':00:00+09:00');
    if (!Number.isFinite(t)) continue;
    if (!byTime.has(t)) byTime.set(t, {});
    byTime.get(t)[it.category] = it.fcstValue;
  }
  const times = [...byTime.keys()].sort((a, b) => a - b);
  const target = times.find(t => t >= hourStart) ?? times[times.length - 1];
  if (target === undefined) throw new Error('단기예보 항목 없음');
  const v = byTime.get(target);
  const tmp = Number(v.TMP), pop = Number(v.POP), sky = Number(v.SKY), pty = Number(v.PTY);
  if (!Number.isFinite(tmp) || !Number.isFinite(sky) || !Number.isFinite(pty)) throw new Error('단기예보 항목 부족');
  const code = pty === 1 ? 61 : pty === 2 ? 67 : pty === 3 ? 71 : pty === 4 ? 80 : sky === 1 ? 0 : sky === 3 ? 2 : 3;
  return {temperature: tmp, code, isDay: p.hour >= 6 && p.hour < 18,
    probability: Number.isFinite(pop) ? pop : null, time: new Date(target).toISOString(), source: '기상청'};
}

async function kmaNowTemp(key, grid, now) {
  const p = kstParts(now);
  let hour = p.hour, date = {year: p.year, month: p.month, day: p.day};
  if (p.minute < 10) {
    hour -= 1;
    if (hour < 0) {
      hour = 23;
      const y = new Date(Date.UTC(p.year, p.month - 1, p.day) - 86400000);
      date = {year: y.getUTCFullYear(), month: y.getUTCMonth() + 1, day: y.getUTCDate()};
    }
  }
  const base_time = String(hour).padStart(2, '0') + '00';
  const url = KMA_VILAGE + '/getUltraSrtNcst?serviceKey=' + key + '&numOfRows=60&pageNo=1&dataType=JSON&base_date=' + ymd(date) + '&base_time=' + base_time + '&nx=' + grid.x + '&ny=' + grid.y;
  const items = await kmaJson(url);
  const t1h = items.find(it => it.category === 'T1H');
  if (!t1h || !Number.isFinite(Number(t1h.fcstValue))) return null;
  return {temperature: Number(t1h.fcstValue), time: new Date(Date.UTC(date.year, date.month - 1, date.day, hour) - 9 * 3600000).toISOString()};
}

// 기상특보 목록: 서울(108) 중 서남권·강서구·전 지역에 해당하는 것만 남긴다.
export function parseWarningsOfficial(items) {
  const out = new Set();
  for (const it of items || []) {
    const title = String(it?.title || it?.wrnTitle || '');
    if (!title.includes('서울')) continue;
    if (/동북권|동남권|서북권/.test(title)) continue;
    const m = title.match(/(호우|대설|한파|폭염|강풍|풍랑|건조|황사|태풍)(주의보|경보)/);
    if (m) out.add(m[1] + m[2]);
  }
  return [...out];
}

function parseKstDatetime(s) {
  const t = String(s || '').trim();
  const digits = t.replace(/\D/g, '');
  if (/^\d{14}$/.test(digits)) return Date.UTC(+digits.slice(0, 4), +digits.slice(4, 6) - 1, +digits.slice(6, 8), +digits.slice(8, 10) - 9, +digits.slice(10, 12), +digits.slice(12, 14));
  return Date.parse(t.replace(' ', 'T') + (t.includes('+') ? '' : '+09:00'));
}

// 한국환경공단 충전소 상태: stat 2=충전대기(가용), 1·9=통신이상·상태미확인.
export function parseChargerStatus(json, station, now = Date.now()) {
  const root = json?.response || json;
  const header = root?.header || root;
  if (!['00','0'].includes(String(header?.resultCode))) throw new Error('공단 응답 확인 필요');
  const body = root?.body || root;
  const records = body?.items?.item;
  if (!records) throw new Error('충전기 목록 없음');
  const rows = Array.isArray(records) ? records : [records];
  // Some deployments ignore the station filter. Never count a mixed or incomplete page.
  if (!rows.length || Number(body.totalCount) !== rows.length ||
      rows.some(row => row.statId !== station.id || !row.chgerId) ||
      new Set(rows.map(row => String(row.chgerId))).size !== rows.length) {
    throw new Error('충전소 전체 목록 확인 필요');
  }
  const active = rows.filter(row => row.delYn !== 'Y');
  if (!active.length) throw new Error('운영 중인 충전기 없음');
  let unknown = 0, available = 0;
  const times = [];
  for (const row of active) {
    const code = String(row.stat);
    const stamp = parseKstDatetime(row.statUpdDt);
    if (Number.isFinite(stamp)) times.push(stamp);
    if (!Number.isFinite(stamp) || stamp > now + 120000 || now - stamp >= 20 * 60000 ||
        !['2','3','4','5'].includes(code)) unknown++;
    else if (code === '2') available++;
  }
  return {...station, total: active.length, unknown, available: unknown === active.length ? null : available,
    status: 'ok', sourceTime: times.length ? new Date(Math.max(...times)).toISOString() : null, source: '한국환경공단'};
}
const cached = new Map();

async function upstream(url) {
  const response = await fetch(url, {signal: AbortSignal.timeout(9000)});
  if (!response.ok) throw new Error('자료 제공처 응답 오류');
  return response;
}

function visibleText(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;|&#xA0;/gi, ' ').replace(/\s+/g, ' ').trim();
}

function stationTimestamp(match, now) {
  const [, month, day, half, hour, minute] = match;
  const year = new Date(now + 9 * 3600000).getUTCFullYear();
  const utcHour = +hour % 12 + (half === '오후' ? 12 : 0) - 9;
  let stamp = Date.UTC(year, +month - 1, +day, utcHour, +minute);
  if (stamp - now > 86400000) stamp = Date.UTC(year - 1, +month - 1, +day, utcHour, +minute);
  return stamp;
}

export function parseStation(html, station, now = Date.now()) {
  const text = visibleText(html);
  if (!text.includes(station.id) || !text.includes('공항대로59길 64')) throw new Error('충전소 확인 필요');
  const summary = text.match(/(?:(\d+)\s*자리\s*비어\s*있음|(빈자리\s*없음|확인\s*안\s*됨))\s*충전기\s*(\d+)\s*대(.{0,190}?\s기준)/);
  if (!summary) throw new Error('충전기 상태 조회 지연');
  const timestamp = summary[4].match(/(\d{1,2})\.\s*(\d{1,2})\.\s*(오전|오후)\s*(\d{1,2}):(\d{2})\s*기준/);
  if (!timestamp) throw new Error('집계시각 확인 필요');
  const sourceTime = stationTimestamp(timestamp, now);
  const total = Number(summary[3]);
  const unknown = Number(summary[4].match(/확인\s*안\s*됨\s*(\d+)/)?.[1] || 0);
  const available = summary[1] ? Number(summary[1]) : summary[2].includes('빈자리') ? 0 : null;
  if (!total || available > total || unknown > total || (available ?? 0) + unknown > total) throw new Error('충전기 집계 확인 필요');
  const fresh = now - sourceTime < 20 * 60000 && sourceTime - now < 120000;
  return {...station, total, unknown, available: fresh ? available : null, status: fresh ? 'ok' : 'stale', sourceTime: new Date(sourceTime).toISOString(), source: 'EVStat'};
}

async function queryStation(station, key) {
  const checkedAt = new Date().toISOString();
  let responded = false;
  let official = null;
  if (key) {
    try {
      const url = EV_API + '?serviceKey=' + key + '&numOfRows=100&pageNo=1&statId=' + station.id + '&zcode=11&_type=json';
      const response = await fetch(url, {signal: AbortSignal.timeout(6500)});
      responded = true;
      if (response.ok) official = parseChargerStatus(await response.json(), station);
      if (official && !official.unknown) return {...official, checkedAt, responded};
    } catch { /* A dated or incomplete official inventory can be checked against the station feed. */ }
  }
  try {
    const response = await fetch('https://evstat.seotory.com/s/' + station.id, {signal: AbortSignal.timeout(9000)});
    responded = true;
    if (response.ok) {
      const aggregate = parseStation(await response.text(), station);
      if (aggregate.status === 'ok' || !official) return {...aggregate, responded, checkedAt};
    }
  } catch { /* Preserve any verified official result below. */ }
  return {...(official || {...station, status: 'unavailable', available: null, total: null, sourceTime: null}),
    responded, checkedAt};
}

async function ev(env) {
  const stations = await Promise.all(EV_STATIONS.map(station => queryStation(station, env?.DATA_GO_KR_KEY)));
  return {stations, checkedAt: new Date().toISOString()};
}

export function parseWarnings(html) {
  const text = visibleText(html);
  const marker = /특보\s*내용\s*[:：]?\s*/g;
  for (const header of text.matchAll(marker)) {
    const rest = text.slice(header.index + header[0].length).split(/특정관리해역|예비특보\s*발표|특보\s*발표기준|기상\s*속보/)[0];
    const list = [...rest.matchAll(/(?:^|\s)[o○]\s*([가-힣]{2,6}(?:주의보|경보))\s*[:：]\s*/g)];
    if (!list.length && /^(?:현재\s*)?(?:발효\s*중인\s*)?(?:기상)?특보[가는]?\s*없/.test(rest)) return [];
    if (!list.length) continue;
    return [...new Set(list.filter((item, index) => {
      const area = rest.slice(item.index + item[0].length, list[index + 1]?.index).split(/(?:기타\s*사항|o\s*없음|발표시각|발효시각|예비특보|국민행동요령|관련\s*페이지)/)[0];
      const seoul = area.match(/서울(?:특별시)?\s*\(([^)]*)\)/);
      if (seoul) return /서울서남권|서남권|강서구|전\s*지역/.test(seoul[1]);
      return /(?:^|[,·]\s*)서울(?:특별시)?(?=\s*(?:[,·]|$))|서울서남권/.test(area);
    }).map(item => item[1]))];
  }
  throw new Error('발효현황 확인 필요');
}

async function forecast(env) {
  const key = env?.DATA_GO_KR_KEY;
  if (key) {
    try {
      const grid = toGrid(37.5553, 126.8586);
      const base = vilageBase();
      const url = KMA_VILAGE + '/getVilageFcst?serviceKey=' + key + '&numOfRows=1000&pageNo=1&dataType=JSON&base_date=' + base.base_date + '&base_time=' + base.base_time + '&nx=' + grid.x + '&ny=' + grid.y;
      const items = await kmaJson(url);
      const cond = parseVilage(items);
      const now = await kmaNowTemp(key, grid, Date.now()).catch(() => null);
      if (now) { cond.temperature = now.temperature; cond.time = now.time; }
      return cond;
    } catch { /* 기상청 보조 경유로 폴백 */ }
  }
  try {
    const cond = parseVilage(await kmaJson(KMA_PROXY_URL));
    cond.via = '보조 경유';
    return cond;
  } catch { /* 최후 수단으로 Open-Meteo 사용 */ }
  const raw = await (await upstream(FORECAST_URL)).json();
  const current = raw.current;
  const index = raw.hourly.time.indexOf(current.time.slice(0, 13) + ':00');
  const temp = current.temperature_2m;
  if (!Number.isFinite(temp) || !Number.isInteger(current.weather_code)) throw new Error('예보 응답 오류');
  const stamp = Date.parse(current.time + '+09:00');
  if (!Number.isFinite(stamp) || Math.abs(Date.now() - stamp) > 2 * 3600000) throw new Error('예보 지연');
  const probability = raw.hourly.precipitation_probability[index];
  return {temperature: temp, code: current.weather_code, isDay: current.is_day === 1,
    probability: Number.isFinite(probability) ? probability : null,
    time: new Date(stamp).toISOString(), source: 'Open-Meteo'};
}

async function warnings(env) {
  const key = env?.DATA_GO_KR_KEY;
  if (key) {
    try {
      const url = KMA_WRN + '?serviceKey=' + key + '&numOfRows=100&pageNo=1&dataType=JSON&stnId=108';
      const items = await kmaJson(url);
      return parseWarningsOfficial(items);
    } catch { /* 기상청 특보 페이지로 폴백 */ }
  }
  const html = await (await upstream(ALERTS_URL)).text();
  return parseWarnings(html);
}

async function weather(env) {
  const [conditions, alerts] = await Promise.allSettled([forecast(env), warnings(env)]);
  return {conditions: conditions.status === 'fulfilled' ? conditions.value : null,
    alerts: alerts.status === 'fulfilled' ? alerts.value : null, checkedAt: new Date().toISOString()};
}

export async function services(kind, env) {
  if (!['weather', 'ev'].includes(kind)) throw new Error('Unknown service');
  const hit = cached.get(kind);
  if (hit?.expires > Date.now()) return hit.value;
  // Cloudflare isolates can outlive the request that created them. Never retain an
  // in-flight fetch Promise globally: an aborted request would poison later calls.
  const value = await (kind === 'ev' ? ev(env) : weather(env));
  const failed = kind === 'ev' ? value.stations.some(station => station.status === 'unavailable') : !value.conditions || !value.alerts;
  cached.set(kind, {value, expires: Date.now() + (failed ? 30000 : 300000)});
  return value;
}
