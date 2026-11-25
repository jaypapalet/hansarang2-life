export const refreshInterval = 10 * 60 * 1000;
const retentionMs = 60 * 60 * 1000;
const topisBase = 'http://openapi.seoul.go.kr:8088';
let localSnapshot;
let localRefresh;
let localRetryAfter = 0;
const rateCounters = new Map();

function json(data, status = 200, headers = {}) {
  return Response.json(data, {status, headers: {'Cache-Control': 'no-store', ...headers}});
}

async function readText(message, maxBytes) {
  const length = message.headers.get('Content-Length');
  if (length !== null && Number(length) > maxBytes) throw new Error('body_too_large');
  if (!message.body) return '';
  const reader = message.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let result = '';
  try {
    while (true) {
      const {value, done} = await reader.read();
      if (done) return result + decoder.decode();
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Error('body_too_large');
      }
      result += decoder.decode(value, {stream: true});
    }
  } finally {
    reader.releaseLock();
  }
}

function xmlValue(xml, tag) {
  return xml.match(new RegExp(`<${tag}>([^<]+)</${tag}>`, 'i'))?.[1]?.trim();
}

async function linkSpeed(id, key, signal) {
  const url = `${topisBase}/${encodeURIComponent(key)}/xml/TrafficInfo/1/5/${id}`;
  try {
    const response = await fetch(url, {signal, redirect: 'error'});
    if (!response.ok) return null;
    const xml = await readText(response, 8192);
    const speed = Number(xmlValue(xml, 'prcs_spd'));
    return xmlValue(xml, 'code') === 'INFO-000' && xmlValue(xml, 'link_id') === id
      && Number.isFinite(speed) && speed > 0 && speed <= 130 ? speed : null;
  } catch {
    return null;
  }
}

export function estimateRoutes(routes, speeds) {
  return routes.map(({id, meters, baselineSeconds, links}) => {
    let seconds = baselineSeconds;
    let observedMeters = 0;
    for (const link of links) {
      const speed = speeds.get(link.id);
      if (speed === undefined) continue;
      observedMeters += link.meters;
      seconds += link.meters * 3.6 / speed - link.baselineSeconds;
    }
    return {id, meters, seconds: Math.max(1, seconds), coverage: Math.min(100, Math.round(100 * observedMeters / meters))};
  });
}

async function queryTopis(routes, key) {
  const ids = [...new Set(routes.flatMap(route => route.links.map(link => link.id)))];
  const signal = AbortSignal.timeout(9500);
  const speeds = new Map();
  // A Worker can have six outgoing connections waiting for response headers.
  for (let offset = 0; offset < ids.length && !signal.aborted; offset += 5) {
    const batch = ids.slice(offset, offset + 5);
    const results = await Promise.all(batch.map(id => linkSpeed(id, key, signal)));
    results.forEach((speed, index) => {
      if (speed !== null) speeds.set(batch[index], speed);
    });
  }
  return speeds;
}

async function refreshTopis(routes, key, previous) {
  const speeds = await queryTopis(routes, key);
  const checkedAt = Date.now();
  if (speeds.size) return {checkedAt, updatedAt: checkedAt, routes: estimateRoutes(routes, speeds)};
  if (previous?.updatedAt && checkedAt - previous.updatedAt < retentionMs) return {...previous, checkedAt};
  return {checkedAt, updatedAt: null, routes: estimateRoutes(routes, new Map())};
}

export async function fixedRoads(request, env, routes) {
  const key = env.TOPIS_OPEN_DATA_KEY?.trim();
  if (!key) return json({error: 'topis_not_configured'}, 503);

  const cache = globalThis.caches?.default;
  if (cache) {
    const cacheKey = new Request(new URL('/__topis_snapshot_v1', request.url));
    let previous;
    try {
      previous = await (await cache.match(cacheKey))?.json();
    } catch { /* The source can still be queried when the cache is unavailable. */ }
    const snapshot = previous && Date.now() - previous.checkedAt < refreshInterval
      ? previous
      : await refreshTopis(routes, key, previous);
    if (snapshot !== previous) {
      try {
        await cache.put(cacheKey, Response.json(snapshot, {headers: {'Cache-Control': 'public, max-age=3600'}}));
      } catch { /* Return fresh data even if cache storage fails. */ }
    }
    return json(snapshot);
  }

  if (localSnapshot && Date.now() < localRetryAfter) return json(localSnapshot);
  localRefresh ??= refreshTopis(routes, key, localSnapshot).then(snapshot => {
    localSnapshot = snapshot;
    localRetryAfter = snapshot.checkedAt + refreshInterval;
    return snapshot;
  }).finally(() => { localRefresh = undefined; });
  return json(await localRefresh);
}

function inKorea(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon)
    && lat >= 32.9 && lat <= 39 && lon >= 124 && lon <= 132;
}

function takeRequest(kind, ip) {
  const now = Date.now();
  const windowStart = Math.floor(now / 60000) * 60000;
  for (const [key, value] of rateCounters) {
    if (value.windowStart !== windowStart) rateCounters.delete(key);
  }
  const id = `${kind}:${ip}`;
  const entry = rateCounters.get(id) ?? {windowStart, count: 0};
  const limit = kind === 'search' ? 24 : 10;
  if (entry.count >= limit || (!rateCounters.has(id) && rateCounters.size >= 2048)) return false;
  entry.count += 1;
  rateCounters.set(id, entry);
  return true;
}

async function kakao(url, key) {
  const response = await fetch(url, {
    headers: {Authorization: `KakaoAK ${key}`, Accept: 'application/json'},
    redirect: 'error',
    signal: AbortSignal.timeout(7000),
    cache: 'no-store',
  });
  if (response.status === 429) return {error: 'quota_exceeded', status: 429};
  if (response.status === 401 || response.status === 403) return {error: 'kakao_access', status: 503};
  const data = JSON.parse(await readText(response, 65536));
  if (data?.code === -10) return {error: 'quota_exceeded', status: 429};
  if (!response.ok) return {error: 'kakao_unavailable', status: 502};
  return {data};
}

async function findPlaces(body, key, origin) {
  const query = typeof body.query === 'string' ? body.query.trim() : '';
  if (query.length < 2 || query.length > 80) return json({error: 'invalid_query'}, 400);
  const url = new URL('https://dapi.kakao.com/v2/local/search/keyword.json');
  url.search = new URLSearchParams({query, size: '6', x: String(origin.lon), y: String(origin.lat)});
  const {data, error, status} = await kakao(url, key);
  if (error) return json({error}, status);
  if (!Array.isArray(data?.documents)) return json({error: 'kakao_unavailable'}, 502);
  const places = data.documents.slice(0, 6).flatMap(place => {
    const lat = Number(place?.y);
    const lon = Number(place?.x);
    if (!inKorea(lat, lon) || typeof place?.place_name !== 'string') return [];
    return [{
      id: String(place.id ?? `${lon},${lat}`),
      name: place.place_name,
      address: String(place.road_address_name || place.address_name || ''),
      lat, lon,
    }];
  });
  return json({places});
}

async function findDirections(body, key, origin) {
  const {lat, lon} = body;
  if (!inKorea(lat, lon)) return json({error: 'invalid_destination'}, 400);
  const url = new URL('https://apis-navi.kakaomobility.com/v1/directions');
  url.search = new URLSearchParams({
    origin: `${origin.lon},${origin.lat}`,
    destination: `${lon},${lat}`,
    priority: 'RECOMMEND',
    summary: 'true',
  });
  const {data, error, status} = await kakao(url, key);
  if (error) return json({error}, status);
  const route = data?.routes?.[0];
  if (!route || route.result_code !== 0) return json({error: 'no_route'}, 404);
  const {distance, duration} = route.summary ?? {};
  if (!Number.isFinite(distance) || !Number.isFinite(duration) || distance < 0 || duration < 0) {
    return json({error: 'kakao_unavailable'}, 502);
  }
  return json({meters: distance, seconds: duration, updatedAt: Date.now()});
}

export async function kakaoRoads(kind, request, env, origin) {
  const key = env.KAKAO_MOBILITY_REST_API_KEY?.trim();
  if (!key) return json({error: 'kakao_not_configured'}, 503);
  const source = request.headers.get('Origin');
  if (source && source !== new URL(request.url).origin) return json({error: 'forbidden'}, 403);
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    return json({error: 'invalid_request'}, 415);
  }

  let body;
  try {
    body = JSON.parse(await readText(request, 2048));
  } catch {
    return json({error: 'invalid_request'}, 400);
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({error: 'invalid_request'}, 400);
  const ip = request.headers.get('CF-Connecting-IP') ?? 'local';
  if (!takeRequest(kind, ip)) return json({error: 'too_many_requests'}, 429, {'Retry-After': '60'});

  try {
    return await (kind === 'search' ? findPlaces(body, key, origin) : findDirections(body, key, origin));
  } catch {
    return json({error: 'kakao_unavailable'}, 502);
  }
}
