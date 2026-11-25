const SEOUL_API = 'http://openapi.seoul.go.kr:8088';
const CULTURE_SERVICE = 'culturalEventInfo';
const RESERVATION_SERVICE = 'GSListPublicReservationCulture';
const NOTICES_URL = 'https://www.gangseo.seoul.kr/gs040101';
const NEWS_URL = 'https://www.gangseo.seoul.kr/gs040404';
const BOTANIC_URL = 'https://botanicpark.seoul.go.kr/front/board/newsView.do?sn=20821';
const BOTANIC_RESERVATION_ID = 'S261102100634309493';
export const DISTRICT_CALENDAR = 'https://culture.gangseo.seoul.kr/gsfc/culture/calendar.do?menuNo=800038';
export const LG_ART_SCHEDULE = 'https://www.lgart.com/product/performance/year';
export const GANGSEO_LIBRARY_PROGRAMS = 'https://lib.gangseo.seoul.kr/ApplyForParticipate';
export const SEOUL_LIBRARY_PROGRAMS = 'https://gslib.sen.go.kr/gslib/module/teach/index.do?menu_idx=15&searchCate1=16';
const GANGSEO_LIBRARY_FEED = 'https://lib.gangseo.seoul.kr/service/culturalLecture/list?libCode=TOL&pageSize=40&pageIndex=1';
const PAGE_SIZE = 1000;
const MAX_CULTURE_ROWS = 30000;
const MAX_RESERVATION_ROWS = 5000;
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_JSON_BYTES = 8 * 1024 * 1024;
const DAY_MS = 86400000;
const KST_MS = 9 * 3600000;
const NEWS_LIMIT = 6;

function assertHtml(html) {
  if (typeof html !== 'string' || !html.trim() || html.length > MAX_HTML_BYTES) {
    throw new Error('invalid_source_html');
  }
}

function decodeEntities(value) {
  const named = {
    amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
    middot: '·', ndash: '–', mdash: '—', hellip: '…', bull: '•',
    copy: '©', reg: '®', ensp: ' ', emsp: ' ', thinsp: ' ',
  };
  return String(value ?? '').replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, name) => {
    if (name[0] !== '#') return named[name.toLowerCase()] ?? whole;
    const point = name[1].toLowerCase() === 'x'
      ? Number.parseInt(name.slice(2), 16) : Number.parseInt(name.slice(1), 10);
    return Number.isInteger(point) && point > 0 && point <= 0x10ffff
      && !(point >= 0xd800 && point <= 0xdfff) ? String.fromCodePoint(point) : '';
  });
}

function withoutActiveHtml(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
}

function text(html, limit = 300) {
  return decodeEntities(withoutActiveHtml(String(html ?? '')).replace(/<[^>]*>/g, ' '))
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ')
    .replace(/\s+/g, ' ').trim().slice(0, limit);
}

function attribute(attributes, name) {
  const match = attributes.match(new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'=<>\x60]+))`, 'i'));
  return match ? decodeEntities(match[1] ?? match[2] ?? match[3]) : null;
}

// These links are only returned to the resident; they are never fetched.
function publicUrl(value) {
  if (typeof value !== 'string' || value.length > 2048 || /[\u0000-\u0020\u007f]/.test(value.trim())) return null;
  try {
    const url = new URL(decodeEntities(value.trim()));
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password
      || (url.port && !['80', '443'].includes(url.port)) || !host.includes('.')
      || /^[\d.]+$/.test(host) || host.includes(':')
      || /(?:^|\.)(?:localhost|local|localdomain|internal|invalid|test|lan|corp|onion)$/.test(host)
      || host.endsWith('.home.arpa')) return null;
    return url.href;
  } catch {
    return null;
  }
}

function validDate(year, month, day) {
  if (!Number.isInteger(year) || year < 1900 || year > 2199 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function kstDay(now) {
  return new Date(now + KST_MS).toISOString().slice(0, 10);
}

function listedDate(value) {
  const match = String(value ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})?$)/);
  if (!match) return null;
  const date = validDate(+match[1], +match[2], +match[3]);
  if (!date || (match[4] !== undefined && (+match[4] > 23 || +match[5] > 59 || +match[6] > 59))) return null;
  if (match[7]) {
    const instant = Date.parse(String(value).trim().replace(' ', 'T'));
    return Number.isFinite(instant) ? kstDay(instant) : null;
  }
  return date;
}

function kstInstant(value) {
  const match = String(value ?? '').trim().match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})?$/);
  if (!match || !validDate(+match[1], +match[2], +match[3]) || +match[4] > 23 || +match[5] > 59 || +match[6] > 59) return null;
  const stamp = Date.parse(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}${match[7] || '+09:00'}`);
  return Number.isFinite(stamp) ? new Date(stamp + KST_MS).toISOString().slice(0, 19) + '+09:00' : null;
}

function period(start, end) {
  const first = listedDate(start);
  const last = listedDate(end);
  return first && last && first <= last ? {start: first, end: last} : null;
}

function culturePeriod(row) {
  if (row.STRTDATE || row.END_DATE) return period(row.STRTDATE, row.END_DATE);
  const parts = String(row.DATE ?? '').trim().split(/\s*[~∼]\s*/);
  return parts.length === 2 ? period(parts[0], parts[1]) : null;
}

function fingerprint(value) {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.codePointAt(0), 16777619);
  return (hash >>> 0).toString(16);
}

function cultureDetail(value) {
  const safe = publicUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  const id = url.searchParams.get('cultcode');
  if (url.hostname !== 'culture.seoul.go.kr' || url.pathname !== '/culture/culture/cultureEvent/view.do'
    || !/^\d{1,12}$/.test(id ?? '')) return null;
  return {id, url: `https://culture.seoul.go.kr/culture/culture/cultureEvent/view.do?cultcode=${id}&menuNo=200008`};
}

function reservationLink(id) {
  return /^S\d{10,24}$/.test(id) ? `https://yeyak.seoul.go.kr/web/reservation/selectReservView.do?rsv_svc_id=${id}` : null;
}

function linkedReservationId(value) {
  const safe = publicUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  const id = url.searchParams.get('rsv_svc_id');
  return url.hostname === 'yeyak.seoul.go.kr' && url.pathname === '/web/reservation/selectReservView.do'
    && reservationLink(id ?? '') ? id : null;
}

function organizerId(value) {
  const safe = publicUrl(value);
  if (!safe) return null;
  const url = new URL(safe);
  if (url.hostname === 'culture.gangseo.seoul.kr'
    && /^\/gsfc\/culture\/(?:[a-z]+\/[a-z]+\/)?view\.do$/.test(url.pathname)) {
    const id = url.searchParams.get('cultureSn');
    if (/^\d{1,9}$/.test(id ?? '')) return 'district-culture:' + id;
  }
  if (url.hostname === 'www.lgart.com' || url.hostname === 'm.lgart.com') {
    const id = url.pathname.match(/^\/product\/(?:ko\/)?performance\/(\d{1,9})$/)?.[1];
    if (id) return 'lg-art:' + id;
  }
  return null;
}

function cultureEvent(row, window) {
  if (text(row.GUNAME, 30) !== '강서구') return null;
  const title = text(row.TITLE);
  const range = culturePeriod(row);
  // The feed contains its entire historical archive. Keep only a rolling calendar window.
  if (!title || !range || range.end < window.start || range.start > window.end) return null;
  const detail = cultureDetail(row.HMPG_ADDR);
  const url = detail?.url || publicUrl(row.HMPG_ADDR) || publicUrl(row.ORG_LINK);
  if (!url) return null;
  const place = text(row.PLACE, 180);
  const reservationId = linkedReservationId(row.ORG_LINK);
  const officialId = organizerId(row.ORG_LINK) || organizerId(row.HMPG_ADDR);
  return {
    id: `culture:${detail?.id || fingerprint(`${title}|${range.start}|${range.end}|${place}`)}`,
    ...(reservationId ? {reservationId} : {}),
    ...(officialId ? {organizerId: officialId} : {}),
    title, category: text(row.CODENAME, 80) || '문화행사', place, url,
    dates: range.start === range.end ? [range.start] : [],
    range: range.start === range.end ? null : range,
    reservation: null, servicePeriod: null,
    time: text(row.PRO_TIME, 240) || null,
    fee: text(row.USE_FEE, 240) || text(row.IS_FREE, 30) || null,
  };
}

function reservationEvent(row) {
  if (text(row.AREANM, 30) !== '강서구') return null;
  const id = String(row.SVCID ?? '').trim();
  const url = reservationLink(id);
  const title = text(row.SVCNM);
  if (!url || !title) return null;
  const servicePeriod = period(row.SVCOPNBGNDT, row.SVCOPNENDDT);
  let opensAt = kstInstant(row.RCPTBGNDT);
  let closesAt = kstInstant(row.RCPTENDDT);
  if (opensAt && closesAt && opensAt > closesAt) opensAt = closesAt = null;
  return {
    id: `reservation:${id}`, reservationId: id,
    title, category: text(row.MINCLASSNM, 80) || text(row.MAXCLASSNM, 80) || '문화체험',
    place: text(row.PLACENM, 180), url,
    dates: servicePeriod && servicePeriod.start === servicePeriod.end ? [servicePeriod.start] : [],
    range: null, servicePeriod,
    reservation: {
      opensAt, closesAt,
      status: text(row.SVCSTATNM, 60) || null, url,
    },
    fee: text(row.PAYATNM, 100) || null,
  };
}

function allowFetch(value) {
  const url = new URL(value);
  if ([NOTICES_URL, NEWS_URL, BOTANIC_URL, GANGSEO_LIBRARY_FEED, SEOUL_LIBRARY_PROGRAMS].includes(url.href)) return true;
  if (url.origin === 'https://culture.gangseo.seoul.kr' && url.pathname === '/gsfc/culture/calendar.do'
    && /^\?menuNo=800038&searchDate=20\d{2}-(?:0[1-9]|1[0-2])-01$/.test(url.search)) return true;
  if (url.origin === 'https://www.lgart.com' && (
    (url.pathname === '/product/performance/year/search' && /^\?year=20\d{2}$/.test(url.search))
    || (/^\/product\/ko\/performance\/\d{1,9}\/calendar\/20\d{2}\/(?:[1-9]|1[0-2])$/.test(url.pathname) && !url.search)
  )) return true;
  if (url.origin === SEOUL_API && /^\/[A-Za-z0-9_-]{1,128}\/json\/(?:culturalEventInfo|GSListPublicReservationCulture)\/\d{1,6}\/\d{1,6}\/$/.test(url.pathname) && !url.search) return true;
  return url.origin === 'https://m.blog.naver.com'
    && /^\/gangseokkachi\/\d{1,20}$/.test(url.pathname) && !url.search;
}

async function readText(response, maxBytes) {
  const length = response.headers.get('Content-Length');
  if (length !== null && Number(length) > maxBytes) throw new Error('source_body_too_large');
  if (!response.body) return '';
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8', {fatal: true});
  let result = '';
  let size = 0;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) return result + decoder.decode();
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error('source_body_too_large');
      }
      result += decoder.decode(value, {stream: true});
    }
  } finally {
    reader.releaseLock();
  }
}

async function upstream(value, maxBytes, {signal, timeout = 8500, accept = 'text/html'} = {}) {
  if (!allowFetch(value)) throw new Error('source_url_not_allowed');
  const headers = {Accept: accept, 'Cache-Control': 'no-cache, no-store'};
  // Naver's public mobile post returns its normal HTML for a browser-compatible UA.
  if (new URL(value).origin !== SEOUL_API) headers['User-Agent'] = 'Mozilla/5.0';
  const response = await fetch(value, {
    // Workers rejects redirect: 'error' before sending the request.
    redirect: 'manual',
    headers,
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout),
  });
  if (!response.ok) throw new Error('source_http_error');
  return readText(response, maxBytes);
}

async function bounded(duration, task) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new Error('source_deadline_exceeded')), duration);
  try {
    return await task(controller.signal);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

function apiKey(key) {
  const value = typeof key === 'string' ? key.trim() : '';
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new Error('open_data_key_missing');
  return value;
}

async function seoulPage(key, service, start, end, signal) {
  const raw = await fetchJson(`${SEOUL_API}/${key}/json/${service}/${start}/${end}/`, signal);
  const body = raw?.[service];
  const code = body?.RESULT?.CODE ?? raw?.RESULT?.CODE;
  if (code === 'INFO-200') return {total: 0, rows: []};
  if (code !== 'INFO-000' || !body || !Array.isArray(body.row)
    || !/^\d+$/.test(String(body.list_total_count))
    || body.row.some(row => !row || typeof row !== 'object' || Array.isArray(row))) throw new Error('invalid_open_data_response');
  const total = Number(body.list_total_count);
  if (!Number.isSafeInteger(total) || body.row.length > end - start + 1) throw new Error('invalid_open_data_response');
  const fields = service === CULTURE_SERVICE ? ['GUNAME', 'TITLE'] : ['AREANM', 'SVCID', 'SVCNM'];
  if (body.row.some(row => fields.some(field => typeof row[field] !== 'string'))) throw new Error('invalid_open_data_record');
  return {total, rows: body.row};
}

async function eachSeoulPage(key, service, maxRows, signal, consume) {
  // The public sample key is explicitly limited to the first five records.
  const sample = key === 'sample';
  const first = await seoulPage(key, service, 1, sample ? 5 : PAGE_SIZE, signal);
  if (sample) {
    if (first.rows.length !== Math.min(5, first.total)) throw new Error('incomplete_open_data_sample');
    consume(first.rows);
    return;
  }
  if (first.total > maxRows) throw new Error('open_data_archive_limit_exceeded');
  if (first.rows.length !== Math.min(PAGE_SIZE, first.total)) throw new Error('incomplete_open_data_page');
  consume(first.rows);
  for (let start = PAGE_SIZE + 1; start <= first.total; start += PAGE_SIZE * 2) {
    const starts = [start, start + PAGE_SIZE].filter(offset => offset <= first.total);
    const pages = await Promise.all(starts.map(offset => seoulPage(key, service, offset, Math.min(offset + PAGE_SIZE - 1, first.total), signal)));
    pages.forEach((page, index) => {
      const expected = Math.min(PAGE_SIZE, first.total - starts[index] + 1);
      if (page.total !== first.total || page.rows.length !== expected) throw new Error('incomplete_open_data_archive');
      consume(page.rows);
    });
  }
}

export async function fetchCulture(key) {
  const value = apiKey(key);
  const now = Date.now();
  const window = {start: kstDay(now - 62 * DAY_MS), end: kstDay(now + 550 * DAY_MS)};
  const events = [];
  await bounded(24000, signal => eachSeoulPage(value, CULTURE_SERVICE, MAX_CULTURE_ROWS, signal, rows => {
    for (const row of rows) {
      const event = cultureEvent(row, window);
      if (event) events.push(event);
    }
  }));
  return [...new Map(events.map(event => [event.id, event])).values()];
}

export async function fetchReservations(key) {
  const events = [];
  await bounded(15000, signal => eachSeoulPage(apiKey(key), RESERVATION_SERVICE, MAX_RESERVATION_ROWS, signal, rows => {
    for (const row of rows) {
      const event = reservationEvent(row);
      if (event) events.push(event);
    }
  }));
  return [...new Map(events.map(event => [event.id, event])).values()];
}

function isEmptyBoard(html) {
  const emptyMessage = /^(?:(?:(?:등록|검색|조회)된\s*)?게시(?:물|글)(?:이|가)\s*없습니다|(?:검색|조회)\s*결과가\s*없습니다|등록된\s*자료가\s*없습니다)[.!。]?$/;
  const clean = withoutActiveHtml(html);
  const cells = [...clean.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td\s*>/gi)].map(match => match[1]);
  const messages = [...clean.matchAll(/<(li|div|p)\b[^>]*\bclass\s*=\s*(["'])[^"']*\b(?:no[-_]?data|empty|no[-_]?result)\b[^"']*\2[^>]*>([\s\S]*?)<\/\1\s*>/gi)].map(match => match[3]);
  return [...cells, ...messages].some(value => emptyMessage.test(text(value, 100)));
}

export function parseDistrictNotices(html) {
  assertHtml(html);
  const notices = new Map();
  for (const row of withoutActiveHtml(html).matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr\s*>/gi)) {
    for (const anchor of row[1].matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
      const href = attribute(anchor[1], 'href');
      if (!href) continue;
      let url;
      try { url = new URL(href, NOTICES_URL); } catch { continue; }
      const id = url.pathname.match(/^\/gs040101\/(\d{1,12})\/?$/)?.[1];
      if (url.origin !== 'https://www.gangseo.seoul.kr' || url.username || url.password || !id) continue;
      const title = text(anchor[2]);
      if (!title) continue;
      const afterLink = row[1].slice(anchor.index + anchor[0].length);
      const cells = [...afterLink.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td\s*>/gi)];
      const publishedOn = cells.map(cell => listedDate(text(cell[1], 30))).find(Boolean) ?? null;
      notices.set(id, {id: `gangseo-notice:${id}`, kind: 'notice', title, publishedOn, url: `${NOTICES_URL}/${id}`});
    }
  }
  if (!notices.size && !isEmptyBoard(html)) throw new Error('invalid_notice_list');
  return [...notices.values()].slice(0, 30);
}

function blogPostId(href) {
  const safe = publicUrl(href);
  if (!safe) return null;
  const url = new URL(safe);
  if (!['blog.naver.com', 'm.blog.naver.com'].includes(url.hostname)) return null;
  return url.pathname.match(/^\/gangseokkachi\/(\d{1,20})\/?$/)?.[1] ?? null;
}

export function parseNewsletterList(html) {
  assertHtml(html);
  const items = new Map();
  for (const anchor of withoutActiveHtml(html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi)) {
    const id = blogPostId(attribute(anchor[1], 'href'));
    if (!id || items.has(id)) continue;
    const subject = anchor[2].match(/<div\b[^>]*\bclass\s*=\s*(?:"[^"]*\bsubject\b[^"]*"|'[^']*\bsubject\b[^']*')[^>]*>([\s\S]*?)<\/div\s*>/i)?.[1];
    const title = text(subject ?? anchor[2]);
    if (title) items.set(id, {id: `gangseo-news:${id}`, kind: 'news', title, publishedOn: null, url: `https://blog.naver.com/gangseokkachi/${id}`});
  }
  if (!items.size && !isEmptyBoard(html)) throw new Error('invalid_newsletter_list');
  return [...items.values()].slice(0, NEWS_LIMIT);
}

export function parseBlogDate(html) {
  if (typeof html !== 'string' || html.length > MAX_HTML_BYTES) return null;
  const paragraph = withoutActiveHtml(html).match(/<p\b[^>]*\bclass\s*=\s*(?:"[^"]*\bblog_date\b[^"]*"|'[^']*\bblog_date\b[^']*')[^>]*>([\s\S]*?)<\/p\s*>/i)?.[1];
  if (!paragraph) return null;
  const match = text(paragraph, 80).match(/^(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.(?:\s|$)/);
  return match ? validDate(+match[1], +match[2], +match[3]) : null;
}

function botanicDays(schedule) {
  const value = schedule.replace(/^운영\s*일시\s*[:：]\s*/, '').replace(/\([^)]*\)/g, '').trim();
  const parts = value.split(/\s*\/\s*/);
  if (!parts.length || parts.length > 6) throw new Error('invalid_botanic_schedule');
  let year = null;
  const days = new Set();
  for (const part of parts) {
    const expression = /(?:(\d{4})\s*\.\s*)?(\d{1,2})\s*\.\s*(\d{1,2})\s*\.?/g;
    const tokens = [...part.matchAll(expression)];
    const remainder = part.replace(expression, '').replace(/\s/g, '');
    if (tokens.length < 1 || tokens.length > 2 || (tokens.length === 1 ? remainder !== '' : !/^[~∼]$/.test(remainder))) throw new Error('invalid_botanic_schedule');
    const dates = tokens.map(token => {
      if (token[1]) year = +token[1];
      const date = year && validDate(year, +token[2], +token[3]);
      if (!date) throw new Error('invalid_botanic_schedule');
      return date;
    });
    const first = Date.parse(`${dates[0]}T00:00:00+09:00`);
    const last = Date.parse(`${dates.at(-1)}T00:00:00+09:00`);
    if (last < first || last - first > 6 * DAY_MS) throw new Error('invalid_botanic_schedule');
    for (let date = first; date <= last; date += DAY_MS) days.add(kstDay(date));
  }
  if (!days.size || days.size > 14) throw new Error('invalid_botanic_schedule');
  return [...days].sort();
}

export function parseBotanicEvent(html) {
  assertHtml(html);
  const clean = withoutActiveHtml(html);
  const heading = [...clean.matchAll(/<(?:h4|title)\b[^>]*>([\s\S]*?)<\/(?:h4|title)\s*>/gi)]
    .map(match => text(match[1])).find(value => value.includes('서울식물원 전시온실 야간개장'));
  if (!heading) throw new Error('invalid_botanic_event');
  const paragraphs = [...clean.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p\s*>/gi)].map(match => text(match[1], 1000));
  const schedule = paragraphs.find(value => /^운영\s*일시\s*[:：]/.test(value));
  if (!schedule) throw new Error('invalid_botanic_schedule');
  const reservationUrl = reservationLink(BOTANIC_RESERVATION_ID);
  const hasReservation = [...clean.matchAll(/<a\b([^>]*)>/gi)].some(anchor => {
    const safe = publicUrl(attribute(anchor[1], 'href'));
    if (!safe) return false;
    const url = new URL(safe);
    return url.hostname === 'yeyak.seoul.go.kr' && url.pathname === '/web/reservation/selectReservView.do'
      && url.searchParams.get('rsv_svc_id') === BOTANIC_RESERVATION_ID;
  });
  if (!hasReservation) throw new Error('invalid_botanic_reservation');
  const opening = paragraphs.find(value => /^예약\s*오픈\s*[:：]/.test(value))
    ?.match(/(\d{4})\.\s*(\d{1,2})\.\s*(\d{1,2})\.\s*(?:\([^)]*\)\s*)?(\d{1,2}):(\d{2})/);
  const openingDay = opening && validDate(+opening[1], +opening[2], +opening[3]);
  const opensAt = openingDay && +opening[4] <= 23 && +opening[5] <= 59
    ? `${openingDay}T${opening[4].padStart(2, '0')}:${opening[5]}:00+09:00` : null;
  const hours = schedule.match(/\((\d{1,2}:\d{2})\s*[~∼]\s*(\d{1,2}:\d{2})\)/);
  return {
    id: 'botanic:20821', reservationId: BOTANIC_RESERVATION_ID,
    title: '서울식물원 전시온실 야간개장', category: '행사', place: '서울식물원 전시온실', url: BOTANIC_URL,
    dates: botanicDays(schedule), range: null, servicePeriod: null,
    reservation: {opensAt, closesAt: null, status: /예약마감/.test(heading) ? '예약마감' : null, url: reservationUrl},
    time: hours ? `${hours[1]} ~ ${hours[2]}` : null,
    fee: paragraphs.find(value => /^참가비\s*[:：]/.test(value))?.replace(/^참가비\s*[:：]\s*/, '').slice(0, 240) || null,
  };
}

export async function fetchBotanic() {
  return [parseBotanicEvent(await upstream(BOTANIC_URL, MAX_HTML_BYTES))];
}

function adjacentMonths(now) {
  const today = new Date(now + KST_MS);
  return [-1, 0, 1].map(offset => {
    const first = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
    return {start: first.toISOString().slice(0, 10), end: last.toISOString().slice(0, 10)};
  });
}

function datedEvent({id, title, category, place, url, range = null, dates = [], time = null, fee = null, reservation = null}) {
  return {id, title, category, place, url, dates, range, reservation, servicePeriod: null, time, fee};
}

function districtCalendarEntries(html, month) {
  assertHtml(html);
  const page = withoutActiveHtml(html);
  const dateField = page.match(/<input\b[^>]*\bname="searchDate"[^>]*>/i)?.[0] ?? '';
  const table = page.match(/<table\b[^>]*\bclass="calendar"[^>]*>[\s\S]*?<\/table\s*>/i)?.[0];
  if (attribute(dateField, 'value')?.slice(0, 7) !== month || !table) throw new Error('invalid_district_calendar');

  return table.split(/<a\b[^>]*\bclass="target"[^>]*>/i).slice(1).map(item => {
    const id = item.match(/\bmoveToDetail\('(\d{1,9})'\)/)?.[1];
    const title = text(item.split('</a>', 1)[0]);
    const category = text(item.match(/<span\b[^>]*\bclass="label-st2"[^>]*>([\s\S]*?)<\/span>/i)?.[1]);
    const place = text(item.match(/<span\b[^>]*\bclass="label-st1[^"]*"[^>]*>([\s\S]*?)<\/span>/i)?.[1]).replace(/&ZeroWidthSpace;/g, '');
    const schedule = item.match(/<strong>\s*(?:(?:공\s*연|전\s*시|행\s*사)\s*)?일(?:\s*시)?\s*<\/strong>\s*<div\b[^>]*>([\s\S]*?)<\/div>/i)?.[1];
    const dateAndTime = text(schedule).match(/^(\d{4})년 (\d{1,2})월 (\d{1,2})일(?:\([일월화수목금토]\))?\s*(.*)$/);
    const date = dateAndTime && validDate(+dateAndTime[1], +dateAndTime[2], +dateAndTime[3]);
    if (!id || !title || !category || !place || date?.slice(0, 7) !== month) throw new Error('invalid_district_calendar_item');
    return {id, title, category, place, date, time: dateAndTime[4] || null};
  });
}

export async function fetchDistrictCulture() {
  const pages = await Promise.all(adjacentMonths(Date.now()).map(async ({start}) => {
    const html = await upstream(DISTRICT_CALENDAR + '&searchDate=' + start, MAX_HTML_BYTES);
    return districtCalendarEntries(html, start.slice(0, 7));
  }));
  const events = new Map();
  for (const item of pages.flat()) {
    if (!events.has(item.id)) events.set(item.id, {item, dates: new Set()});
    events.get(item.id).dates.add(item.date);
  }
  return [...events.values()].map(({item, dates}) => {
    const days = [...dates].sort();
    // The official calendar repeats some programs on every date of their announced period.
    const isSingleEvent = days.length === 1 && item.category !== '전시';
    return datedEvent({
      id: 'district-culture:' + item.id, title: item.title, category: item.category, place: item.place,
      url: new URL('/gsfc/culture/view.do?menuNo=800038&cultureSn=' + item.id, DISTRICT_CALENDAR).href,
      dates: isSingleEvent ? days : [], range: isSingleEvent ? null : {start: days[0], end: days.at(-1)},
      time: item.time,
    });
  });
}

async function fetchJson(url, signal) {
  return JSON.parse(await upstream(url, MAX_JSON_BYTES, {signal, accept: 'application/json'}));
}

function lgPerformance(row) {
  const id = organizerId(row?.DetailsUrl);
  const title = text(row?.Title && decodeEntities(row.Title).replaceAll('<', '〈').replaceAll('>', '〉'));
  const day = value => /^\d{8}$/.test(value ?? '') ? validDate(+value.slice(0, 4), +value.slice(4, 6), +value.slice(6, 8)) : null;
  const start = day(row?.PlayBeginDate);
  const end = day(row?.PlayEndDate);
  if (!id?.startsWith('lg-art:') || !title || !start || !end || start > end) return null;
  return datedEvent({
    id, title, category: text(row.GenreName, 80) || '공연',
    place: ['LG아트센터 서울', text(row.Place, 100)].filter(Boolean).join(' '),
    url: 'https://www.lgart.com/product/performance/' + id.split(':')[1],
    range: {start, end},
  });
}

async function lgPerformanceDates(event, {start, end}, signal) {
  const [year, month] = start.split('-').map(Number);
  const id = event.id.split(':')[1];
  const url = 'https://www.lgart.com/product/ko/performance/' + id + '/calendar/' + year + '/' + month;
  const data = await fetchJson(url, signal);
  if (data?.Year !== year || data.Month !== month || !Array.isArray(data.Weeks) || !data.Weeks.every(Array.isArray)) {
    throw new Error('invalid_lg_performance_calendar');
  }
  return data.Weeks.flat().flatMap(day => {
    const date = day?.IsPlayDay === true ? listedDate(String(day.Date ?? '').slice(0, 10)) : null;
    return date && date >= start && date <= end && date >= event.range.start && date <= event.range.end ? [date] : [];
  });
}

export async function fetchLgArt() {
  const months = adjacentMonths(Date.now());
  const years = [...new Set(months.map(({start}) => start.slice(0, 4)))];
  const schedules = await Promise.all(years.map(async year => {
    const data = await fetchJson(LG_ART_SCHEDULE + '/search?year=' + year);
    if (!Array.isArray(data?.Schedule) || !data.Schedule.every(month => Array.isArray(month?.Days))) {
      throw new Error('invalid_lg_schedule');
    }
    return data.Schedule.flatMap(month => month.Days);
  }));
  const performances = new Map();
  const firstMonth = months[0];
  const lastMonth = months.at(-1);
  for (const row of schedules.flat()) {
    const event = lgPerformance(row);
    if (event && event.range.start <= lastMonth.end && event.range.end >= firstMonth.start) performances.set(event.id, event);
  }
  const events = [...performances.values()];
  // Limit subrequests. Every performance remains in the period list if its session lookup is skipped or fails.
  const sessions = months.flatMap(month => events.filter(event => event.range.start <= month.end && event.range.end >= month.start)
    .map(event => ({event, month}))).slice(0, 15);
  await bounded(16000, async signal => {
    for (let offset = 0; offset < sessions.length && !signal.aborted; offset += 4) {
      const batch = sessions.slice(offset, offset + 4);
      await Promise.all(batch.map(async ({event, month}) => {
        try {
          event.dates.push(...await lgPerformanceDates(event, month, signal));
        } catch {
          // Keep the official period and link when a specific month's sessions are unavailable.
        }
      }));
    }
  });
  for (const event of events) event.dates = [...new Set(event.dates)].sort();
  return events;
}

function relevantLibraryEvent(range, months) {
  return range && range.start <= months.at(-1).end && range.end >= months[0].start;
}

function libraryEvent(event) {
  if (event.range && event.range.start === event.range.end) {
    return datedEvent({...event, dates: [event.range.start], range: null});
  }
  return datedEvent(event);
}

export async function fetchGangseoLibrary() {
  const response = await fetchJson(GANGSEO_LIBRARY_FEED);
  const rows = response?.data?.data;
  if (response?.status !== 'OK' || !Array.isArray(rows)) throw new Error('invalid_gangseo_library_list');
  const months = adjacentMonths(Date.now());
  return rows.flatMap(row => {
    const id = String(row?.leCode ?? '');
    const group = String(row?.leLGCode ?? '');
    const title = text(row?.leLName);
    const range = period(String(row?.leOpenSDateFmt ?? '').replaceAll('.', '-'), String(row?.leOpenEDateFmt ?? '').replaceAll('.', '-'));
    if (!/^\d{1,9}$/.test(id) || !/^\d{1,9}$/.test(group) || !title || !relevantLibraryEvent(range, months)) return [];
    const url = new URL('/ApplyForPatricipate/LibCultureProgramDetail?leCode=' + id + '&leLGCode=' + group, GANGSEO_LIBRARY_PROGRAMS).href;
    const library = text(row.libNameS, 50);
    const room = text(row.leArea, 150);
    const place = /도서관|뮤지엄|센터|미술관|박물관/.test(room) || !library || library === '작은'
      ? room : [library + '도서관', room].filter(Boolean).join(' ');
    const signupTime = value => Number.isSafeInteger(value) && value > 0 && value < 4_000_000_000
      ? new Date(value * 1000).toISOString() : null;
    const fee = /^\d{1,8}$/.test(row.leMoney ?? '') ? (+row.leMoney ? (+row.leMoney).toLocaleString('ko-KR') + '원' : '무료') : null;
    return [libraryEvent({
      id: 'gangseo-library:' + id, title, place, category: '도서관 프로그램', url, range,
      time: text(row.leBeginTime, 100) || null, fee,
      reservation: {opensAt: signupTime(row.leTakeSDate), closesAt: signupTime(row.leTakeEDate), status: text(row.lectureStatusName, 50) || null, url},
    })];
  });
}

export async function fetchSeoulLibrary() {
  const html = withoutActiveHtml(await upstream(SEOUL_LIBRARY_PROGRAMS, MAX_HTML_BYTES));
  if (!/<ul\b[^>]*\bclass="teach_list"/i.test(html)) throw new Error('invalid_seoul_library_list');
  const months = adjacentMonths(Date.now());
  return [...html.matchAll(/<a\b([^>]*\bclass="detail-btn"[^>]*)>([\s\S]*?)<\/a\s*>/gi)].flatMap(([, attrs, body]) => {
    const group = attribute(attrs, 'keyValue1');
    const id = attribute(attrs, 'keyValue3');
    const title = text(body.match(/<b\b[^>]*\bclass="title"[^>]*>([\s\S]*?)<\/b>/i)?.[1]);
    const dates = body.match(/강의기간<\/span>\s*(\d{4}-\d{2}-\d{2})\s*~\s*(\d{4}-\d{2}-\d{2})/i);
    const range = dates && period(dates[1], dates[2]);
    if (!/^\d{1,9}$/.test(id ?? '') || !/^\d{1,9}$/.test(group ?? '') || !title || !relevantLibraryEvent(range, months)) return [];
    const url = new URL('/gslib/module/teach/detail.do?menu_idx=15&group_idx=' + group + '&teach_idx=' + id + '&category_idx=0&large_category_idx=16', SEOUL_LIBRARY_PROGRAMS).href;
    return [libraryEvent({id: 'seoul-library:' + id, title, place: '강서도서관', category: '독서문화행사', url, range})];
  });
}

export async function fetchNotices() {
  return parseDistrictNotices(await upstream(NOTICES_URL, MAX_HTML_BYTES));
}

export async function fetchNews() {
  return bounded(23000, async signal => {
    const items = parseNewsletterList(await upstream(NEWS_URL, MAX_HTML_BYTES, {signal}));
    for (let offset = 0; offset < items.length; offset += 2) {
      await Promise.all(items.slice(offset, offset + 2).map(async item => {
        const id = blogPostId(item.url);
        if (!id || signal.aborted) return;
        try {
          item.publishedOn = parseBlogDate(await upstream(`https://m.blog.naver.com/gangseokkachi/${id}`, MAX_HTML_BYTES, {signal, timeout: 4500}));
        } catch {
          // The archive still supplies an official title and link if the date cannot be read.
          item.publishedOn = null;
        }
      }));
    }
    return items;
  });
}
