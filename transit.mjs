import {publicRail} from './subway-public.mjs';
const nearbyStations = ['증미', '등촌'];
const allStations = ['가양', ...nearbyStations, '염창'];
const stops = [
  {id:'16251', name:'태영.삼성한사랑아파트', direction:'도심 방향'},
  {id:'16252', name:'금호.한솔아파트', direction:'공항 방향'},
  {id:'16004', name:'등촌역.강서보건소', direction:'도심 방향'},
  {id:'16003', name:'등촌역.강서보건소', direction:'공항 방향'},
];
const cache = new Map();

async function json(url, timeout = 9000, redirect = 'follow') {
  const response = await fetch(url, {signal:AbortSignal.timeout(timeout), headers:{Accept:'application/json'}, redirect});
  if (!response.ok) throw new Error('교통정보 조회 실패', {cause:response.status});
  return response.json();
}

function seoulTimestamp(value) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(raw)) return null;
  const iso = raw.replace(' ', 'T');
  const time = Date.parse(/(Z|[+-]\d\d:\d\d)$/.test(iso) ? iso : iso + '+09:00');
  return Number.isFinite(time) ? time : null;
}

async function railRows(key, service, station, field) {
  const url = 'http://swopenapi.seoul.go.kr/api/subway/' + encodeURIComponent(key)
    + '/json/' + service + '/0/100/' + encodeURIComponent(station);
  const data = await json(url, 9000, 'manual');
  if (Array.isArray(data[field])) return data[field];
  const code = data.errorMessage?.code ?? data.code ?? data.RESULT?.CODE;
  if (code === 'INFO-200') return [];
  const reason = typeof code === 'string' && /^(INFO|ERROR)-\d{3}$/.test(code) ? code : 'unexpected response';
  throw new Error('열차 조회 실패', {cause:reason});
}

function dir(value, destination='') {
  if (['개화','김포공항','마곡나루'].includes(destination)) return 'down';
  if (['중앙보훈병원','보훈병원','신논현','동작','삼전','여의도','종합운동장'].includes(destination)) return 'up';
  if (['상행','1'].includes(String(value))) return 'up';
  if (['하행','0'].includes(String(value))) return 'down';
  return null;
}

async function rail(env, arrivalsOnly) {
  const stations = arrivalsOnly ? nearbyStations : allStations;
  const publicOptions = {stations, includePositions: !arrivalsOnly};
  const key = env.SEOUL_SUBWAY_KEY?.trim();
  if (!key) return publicRail(publicOptions);
  const queries = stations.map(name => railRows(key,'realtimeStationArrival',name,'realtimeArrivalList'));
  if (!arrivalsOnly) queries.push(railRows(key,'realtimePosition','9호선','realtimePositionList'));
  const results = await Promise.allSettled(queries);
  const now = Date.now();
  const arrivals = [];
  const failedStations = [];
  for (const [index, result] of results.slice(0, stations.length).entries()) {
    const station = stations[index];
    if (result.status !== 'fulfilled') { failedStations.push(station); continue; }
    for (const row of result.value) {
      const direction = dir(row.updnLine,row.bstatnNm);
      const observed = seoulTimestamp(row.recptnDt);
      if (String(row.subwayId) !== '1009' || row.statnNm !== station || !direction || !observed || now-observed > 180000) continue;
      const seconds = Number(row.barvlDt);
      let due = Number.isFinite(seconds) && seconds > 0 ? observed + seconds*1000 : null;
      if (due !== null && now - due > 20000) continue;
      // A zero time can mean “unavailable”; the provider's message carries the actual state.
      arrivals.push({station, direction, train:String(row.btrainNo||''), destination:row.bstatnNm,
        express: /급행|특급/.test(row.btrainSttus||''), message:row.arvlMsg2||'', due, observed});
    }
  }
  const positions = results[stations.length];
  const trains = positions?.status === 'fulfilled' ? positions.value.filter(row => {
    const observed = seoulTimestamp(row.recptnDt);
    return String(row.subwayId)==='1009' && stations.includes(row.statnNm) && dir(row.updnLine,row.statnTnm)
      && observed && now - observed <= 180000;
  }).map(row => ({station:row.statnNm, direction:dir(row.updnLine,row.statnTnm), train:String(row.trainNo),
    destination:row.statnTnm, express:['1','7'].includes(String(row.directAt)),
    state:['진입','도착','출발','전역 출발'][Number(row.trainSttus)]||'운행', observed:seoulTimestamp(row.recptnDt)})) : [];
  const failures = results.filter(r=>r.status==='rejected').length;
  if (failures===results.length) {
    console.warn('Seoul subway API unavailable', results.map(({reason}) => {
      if (typeof reason?.cause === 'number') return 'HTTP ' + reason.cause;
      if (typeof reason?.cause === 'string') return reason.cause;
      return ['TimeoutError','AbortError','SyntaxError','TypeError'].includes(reason?.name) ? reason.name : 'unknown';
    }));
    return publicRail(publicOptions);
  }
  return {status:failures?'partial':'ok', stations, arrivals, trains,
    failedStations, positionFailed:positions?.status==='rejected', fetchedAt:now,
    source:'서울 열린데이터광장 공식 API'};
}

async function stationBus(stop, key) {
  const url = new URL('https://ws.bus.go.kr/api/rest/stationinfo/getStationByUid');
  url.search = new URLSearchParams({serviceKey:key, arsId:stop.id, resultType:'json'});
  const data = await json(url, 4000);
  const code = String(data.msgHeader?.headerCd);
  if (code === '4') return {...stop,status:'ok',routes:[],source:'서울특별시 버스정보시스템'};
  if (code !== '0') throw new Error('버스 조회 실패');
  const items = data.msgBody?.itemList || [];
  const routes = (Array.isArray(items)?items:[items]).filter(r=>r.rtNm).map(r=>({
    name:r.rtNm, direction:r.adirection||r.direction||'', next:r.nxtStn||'',
    type:String(r.routeType), first:r.arrmsg1||'도착 정보 없음', second:r.arrmsg2||'도착 정보 없음',
  }));
  return {...stop,status:'ok',routes,source:'서울특별시 버스정보시스템'};
}

async function makkaBus(stop) {
  const url = new URL('https://makka.co.kr/api/seoul-bus-stop-arrivals');
  url.searchParams.set('arsId', stop.id);
  const response = await fetch(url, {
    redirect: 'manual', signal: AbortSignal.timeout(8000),
    headers: {Accept: 'application/json', 'Cache-Control': 'no-cache'},
  });
  const servedAt = Date.parse(response.headers.get('Date'));
  const age = Number(response.headers.get('Age') || 0);
  if (!response.ok || age > 120 || (Number.isFinite(servedAt) && Date.now() - servedAt > 120_000)) {
    throw new Error('버스 조회 지연');
  }
  const data = await response.json();
  if (data.status !== 'ready' || !Array.isArray(data.arrivals)) throw new Error('버스 조회 실패');
  const routes = data.arrivals.filter(row => typeof row?.routeName === 'string' && row.routeName).map(row => ({
    name: row.routeName, direction: row.direction || '', next: row.nextStation || '', type: String(row.routeType || ''),
    first: row.arrmsg1 || '도착 정보 없음', second: row.arrmsg2 || '도착 정보 없음',
  }));
  return {...stop, status: 'ok', routes, source: 'makka'};
}

async function bus(env) {
  const key = env.DATA_GO_KR_KEY?.trim();
  const data = await Promise.all(stops.map(async stop => {
    if (key) {
      try {
        return await stationBus(stop, key);
      } catch { /* Try Makka for this stop. */ }
    }
    try {
      return await makkaBus(stop);
    } catch {
      return {...stop, status: 'unavailable', routes: []};
    }
  }));
  const sources = [...new Set(data.map(stop => stop.source).filter(Boolean))];
  return {status:data.every(s=>s.status==='ok')?'ok':data.some(s=>s.status==='ok')?'partial':'unavailable',
    fetchedAt:Date.now(), stops:data,
    source:sources.join(' / ') || null};
}

export async function transit(kind, env={}, {arrivalsOnly = false} = {}) {
  if (!['bus','subway'].includes(kind)) throw new Error('Unknown transit service');
  const cacheKey = kind === 'subway' && arrivalsOnly ? 'subway-arrivals' : kind;
  const prior=cache.get(cacheKey);
  if (prior && Date.now()<prior.expires) return prior.value;
  const value=await (kind==='bus'?bus(env):rail(env, arrivalsOnly));
  // Workers subrequests are bound to their originating request.
  cache.set(cacheKey,{value,expires:Date.now()+(kind==='bus'?60000:10000)});
  return value;
}
