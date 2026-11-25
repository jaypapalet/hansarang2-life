import {fetchCulture, fetchReservations, fetchBotanic, fetchNotices, fetchNews} from './neighborhood-sources.mjs';

const refreshMs = 3 * 60 * 60 * 1000;
const retryMs = 10 * 60 * 1000;
const retentionMs = 7 * 24 * 60 * 60 * 1000;
const sources = [
  {id: 'botanic', name: '서울식물원', url: 'https://botanicpark.seoul.go.kr/front/board/newsList.do?sCategory=%ED%96%89%EC%82%AC', kind: 'events'},
  {id: 'culture', name: '서울시 문화행사', url: 'https://data.seoul.go.kr/dataList/OA-15486/S/1/datasetView.do', kind: 'events', requiresKey: true},
  {id: 'reservations', name: '강서구 문화행사 예약', url: 'https://data.seoul.go.kr/dataList/OA-12171/S/1/datasetView.do', kind: 'events', requiresKey: true},
  {id: 'notices', name: '강서구 공지', url: 'https://www.gangseo.seoul.kr/gs040101', kind: 'notices'},
  {id: 'news', name: '주간 강서까치뉴스', url: 'https://www.gangseo.seoul.kr/gs040404', kind: 'notices'},
];
const defaults = {
  botanic: fetchBotanic,
  culture: fetchCulture,
  reservations: fetchReservations,
  notices: fetchNotices,
  news: fetchNews,
};

function normalized(value) {
  return value.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '');
}

function periods(event) {
  if (event.dates.length) return event.dates.map(date => ({start: date, end: date}));
  const period = event.range ?? event.servicePeriod;
  return period ? [period] : [];
}

function sameEvent(a, b) {
  if (a.reservationId && b.reservationId) return a.reservationId === b.reservationId;
  if (a.id === b.id) return true;
  const place = normalized(a.place);
  return place && place === normalized(b.place)
    && normalized(a.title) === normalized(b.title)
    && periods(a).some(one => periods(b).some(two => one.start <= two.end && two.start <= one.end));
}

// Earlier sources have stronger evidence for event dates. Booking data fills
// gaps without turning a service period into a set of operating dates.
export function mergeEvents(groups) {
  const merged = [];
  for (const event of groups.flat()) {
    const index = merged.findIndex(previous => sameEvent(previous, event));
    if (index === -1) {
      merged.push(event);
      continue;
    }

    const previous = merged[index];
    const first = previous.reservation;
    const second = event.reservation;
    const dates = previous.id === event.id
      ? [...new Set([...previous.dates, ...event.dates])].sort()
      : previous.dates.length ? previous.dates : event.dates;
    merged[index] = {
      ...previous,
      place: previous.place || event.place,
      category: previous.category || event.category,
      dates,
      range: dates.length ? null : previous.range ?? event.range,
      servicePeriod: previous.servicePeriod ?? event.servicePeriod,
      reservationId: previous.reservationId ?? event.reservationId,
      reservation: first && second ? {
        opensAt: first.opensAt ?? second.opensAt,
        closesAt: first.closesAt ?? second.closesAt,
        status: first.status || second.status,
        url: first.url || second.url,
      } : first ?? second,
      time: previous.time || event.time,
      fee: previous.fee || event.fee,
    };
  }
  return merged;
}

function newestPostFirst(a, b) {
  return (b.publishedOn ?? '').localeCompare(a.publishedOn ?? '');
}

export function createNeighborhoodReader({now = Date.now, loaders = defaults} = {}) {
  const localSnapshots = new Map();
  const localRequests = new Map();

  async function loadSource(source, request, key, cache) {
    if (source.requiresKey && !key) return {state: 'unconfigured', updatedAt: null, entries: []};
    const sample = source.requiresKey && key === 'sample';
    const variant = sample ? 'sample' : 'live';
    const id = source.id + '/' + variant;
    const cacheRequest = new Request(new URL('/__neighborhood_snapshot_v1/' + id, request.url));

    async function load() {
      let previous;
      try {
        previous = cache ? await (await cache.match(cacheRequest))?.json() : localSnapshots.get(id);
      } catch { /* A cache read failure does not stop source collection. */ }

      const checkedAt = now();
      const lastSuccess = previous?.updatedAt ?? null;
      const due = previous?.failed ? retryMs : refreshMs;
      let snapshot = previous;
      if (!previous || checkedAt - previous.checkedAt >= due) {
        try {
          const entries = await loaders[source.id](key);
          const completedAt = now();
          snapshot = {entries, updatedAt: completedAt, checkedAt: completedAt, failed: false};
        } catch {
          const canReuse = lastSuccess !== null && checkedAt - lastSuccess < retentionMs;
          snapshot = {
            entries: canReuse ? previous.entries : [],
            updatedAt: canReuse ? lastSuccess : null,
            checkedAt: now(),
            failed: true,
          };
        }

        if (cache) {
          try {
            await cache.put(cacheRequest, Response.json(snapshot, {
              headers: {'Cache-Control': 'public, max-age=' + Math.floor(retentionMs / 1000)},
            }));
          } catch { /* The current response still contains the available data. */ }
        } else {
          localSnapshots.set(id, snapshot);
        }
      }

      const {entries, updatedAt, failed} = snapshot;
      if (failed && (updatedAt === null || now() - updatedAt >= retentionMs)) {
        return {entries: [], updatedAt: null, state: 'unavailable'};
      }
      return {entries, updatedAt, state: failed ? 'stale' : sample ? 'limited' : 'fresh'};
    }

    // Node can coalesce requests. In Workers each fetch keeps its own I/O context.
    if (cache) return load();
    if (!localRequests.has(id)) {
      localRequests.set(id, load().finally(() => localRequests.delete(id)));
    }
    return localRequests.get(id);
  }

  return async function readNeighborhood(request, env, cache = globalThis.caches?.default) {
    const key = env.SEOUL_OPEN_DATA_KEY?.trim() || env.TOPIS_OPEN_DATA_KEY?.trim();
    const section = new URL(request.url).searchParams.get('section');
    const selected = section ? sources.filter(source => source.kind === section) : sources;
    const results = await Promise.all(selected.map(async source => ({
      ...source,
      ...await loadSource(source, request, key, cache),
    })));
    return {
      events: mergeEvents(results.filter(source => source.kind === 'events').map(source => source.entries)),
      notices: results.filter(source => source.kind === 'notices').flatMap(source => source.entries).sort(newestPostFirst),
      sources: results.map(({id, name, url, state, updatedAt}) => ({id, name, url, state, updatedAt})),
    };
  };
}

export const readNeighborhood = createNeighborhoodReader();
