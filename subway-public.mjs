const stationCodes = new Map([['가양', 941], ['증미', 942], ['등촌', 943], ['염창', 944]]);
// 열차 위치 애니메이션용: 4개 역 바깥 이웃 역에 있는 열차도 미리 보여준다.
const trackStations = new Set([...stationCodes.keys(), '양천향교', '마곡나루', '신방화', '신목동', '선유도', '당산']);
const freshnessLimit = 180_000;
const liveBase = 'https://subway-live.com/api/subway/json';

function seoulTimestamp(value) {
  const raw = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}/.test(raw)) return null;
  const iso = raw.replace(' ', 'T');
  const time = Date.parse(/(Z|[+-]\d\d:\d\d)$/.test(iso) ? iso : iso + '+09:00');
  return Number.isFinite(time) ? time : null;
}

function dir(value, destination = '') {
  if (['개화', '김포공항', '마곡나루'].includes(destination)) return 'down';
  if (['중앙보훈병원', '보훈병원', '신논현', '동작', '삼전', '여의도', '종합운동장'].includes(destination)) return 'up';
  if (['상행', '1'].includes(String(value))) return 'up';
  if (['하행', '0'].includes(String(value))) return 'down';
  return null;
}

// 1순위: subway-live 실시간 도착정보 (서울 열린데이터광장 데이터를 키 없이 중계).
// 열차번호(btrainNo)와 도착까지 남은 초(barvlDt)를 그대로 준다.
async function liveArrivals(station) {
  const url = liveBase + '/realtimeStationArrival/0/5/' + encodeURIComponent(station);
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8000), headers: {Accept: 'application/json', 'Cache-Control': 'no-cache'},
  });
  if (!response.ok) throw new Error('열차 도착 조회 실패');
  const data = await response.json();
  if ([data.code, data.errorMessage?.code].includes('INFO-200')) return [];
  if (!Array.isArray(data.realtimeArrivalList)) throw new Error('도착정보 형식 확인 불가');
  const now = Date.now();
  const rows = [];
  for (const row of data.realtimeArrivalList) {
    if (String(row.subwayId) !== '1009' || row.statnNm !== station) continue;
    const direction = dir(row.updnLine, row.bstatnNm);
    const observed = seoulTimestamp(row.recptnDt);
    if (!direction || !observed || now - observed > freshnessLimit) continue;
    const seconds = Number(row.barvlDt);
    const due = Number.isFinite(seconds) && seconds > 0 ? observed + seconds * 1000 : null;
    if (due !== null && now - due > 15000) continue;
    rows.push({station, direction, destination: String(row.bstatnNm || '').replace(/행$/, ''),
      express: /급행|특급/.test(String(row.btrainSttus || '')), message: String(row.arvlMsg2 || ''),
      due, observed, train: String(row.btrainNo || '')});
  }
  return rows;
}

function plain(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim();
}

function attr(tag, name) {
  return tag.match(new RegExp('\\b' + name + '=["\']([^"\']*)["\']', 'i'))?.[1];
}

// 폴백: subway-live가 안 될 때 도착 보드 HTML을 직접 긁어온다.
async function dochakArrivals(station, code) {
  const url = new URL('https://dochak.kr/stations/' + code + '/board');
  url.searchParams.set('line', '9호선');
  const response = await fetch(url, {
    signal: AbortSignal.timeout(8000), headers: {Accept: 'text/html', 'Cache-Control':'no-cache'},
  });
  if (!response.ok) throw new Error('역별 안내 조회 실패');
  const html = await response.text();
  const now = Date.now();
  const serverDate = Date.parse(response.headers.get('date'));
  const age = Number(response.headers.get('age') || 0) * 1000;
  const rendered = Math.min(now-age, Number.isFinite(serverDate) ? serverDate : now);
  const checked = attr(html, 'data-checked-age');
  if (checked === undefined || !/^\d+$/.test(checked)) throw new Error('갱신 시각 확인 불가');
  const observed = rendered - Number(checked)*1000;
  if (now - observed > freshnessLimit) throw new Error('오래된 도착정보');
  const rows = [];
  let recognizedGroup = false;
  for (const match of html.matchAll(/<section\b([^>]*\bdata-line-id=["']1009["'][^>]*)>([\s\S]*?)<\/section>/gi)) {
    const group = match[2];
    const header = plain(group.split(/<li\b/i)[0]);
    const direction = header.includes('상행') ? 'up' : header.includes('하행') ? 'down' : null;
    if (!direction) continue;
    recognizedGroup = true;
    for (const item of group.matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/gi)) {
      const body = item[1];
      const destination = plain(body.match(/<strong\b[^>]*>([\s\S]*?)<\/strong>/i)?.[1] || '').replace(/행$/, '');
      if (!destination) continue;
      const text = plain(body);
      const remaining = attr(body, 'data-remaining');
      const seconds = remaining !== undefined && /^\d+$/.test(remaining) ? Number(remaining) : null;
      const due = seconds !== null ? rendered + seconds * 1000 : null;
      const validFor = attr(body, 'data-fresh-for');
      if (validFor !== undefined && /^\d+$/.test(validFor) && now-rendered >= Number(validFor)*1000) continue;
      if (due !== null && now-due>15000) continue;
      const message = text.match(/(?:곧 도착|도착 중|전역 (?:출발|도착)|진입 중|도착|진입)/)?.[0] || '시간 미제공';
      rows.push({station, direction, destination, express:/급행|특급/.test(text), message, due, observed, train:''});
    }
  }
  if (!recognizedGroup && !/첫차 운행 전|운행 종료|막차 종료|도착 정보가 없습니다|도착정보가 없습니다/.test(plain(html))) {
    throw new Error('도착정보 형식 확인 불가');
  }
  return rows;
}

async function linePositions() {
  const path = 'https://subway-live.com/api/subway/json/realtimePosition/0/200/' + encodeURIComponent('9호선');
  const response = await fetch(path, {signal:AbortSignal.timeout(8000),headers:{Accept:'application/json'}});
  if (!response.ok) throw new Error('열차 위치 조회 실패');
  const data = await response.json();
  if (data.errorMessage?.code === 'INFO-200' || data.code === 'INFO-200') return [];
  if (!Array.isArray(data.realtimePositionList)) throw new Error('열차 위치 형식 확인 불가');
  const now = Date.now();
  let freshRows = 0;
  const trains = [];
  for (const row of data.realtimePositionList) {
    const raw = String(row.recptnDt || '').replace(' ','T');
    if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/.test(raw)) continue;
    const observed = Date.parse(/Z$|[+-]\d\d:\d\d$/.test(raw)?raw:raw+'+09:00');
    if (!Number.isFinite(observed) || now-observed>freshnessLimit || observed-now>30000) continue;
    freshRows++;
    if (!trackStations.has(row.statnNm) || String(row.subwayId)!=='1009') continue;
    const destination = String(row.statnTnm||'').trim();
    let direction = null;
    if (['개화','김포공항'].includes(destination)) direction='down';
    else if (['중앙보훈병원','신논현','종합운동장','동작','샛강'].includes(destination)) direction='up';
    else if (['1','상행'].includes(String(row.updnLine))) direction='up';
    else if (['0','하행'].includes(String(row.updnLine))) direction='down';
    if (!direction) continue;
    const state = {0:'진입',1:'도착',2:'출발',3:'전역 출발'}[row.trainSttus] || '운행';
    trains.push({station:row.statnNm, direction, train:String(row.trainNo||''), destination,
      express:['1','7'].includes(String(row.directAt)), state, observed});
  }
  if (data.realtimePositionList.length && !freshRows) throw new Error('열차 위치 갱신 지연');
  return trains;
}

export async function publicRail({stations = [...stationCodes.keys()], includePositions = true} = {}) {
  // 도착정보: subway-live 1순위, 실패한 역만 도착 폴백.
  const arrivals = Promise.allSettled(stations.map(async station => {
    try { return await liveArrivals(station); }
    catch { return dochakArrivals(station, stationCodes.get(station)); }
  }));
  const positions = includePositions ? linePositions().then(
    trains => ({trains, failed: false}),
    () => ({trains: [], failed: true})) : null;
  const [arrivalResults, position] = await Promise.all([arrivals, positions]);
  const failedStations = stations.filter((_, i) => arrivalResults[i].status === 'rejected');
  const positionFailed = position?.failed ?? false;
  const unavailable = failedStations.length === stations.length && (!includePositions || positionFailed);
  return {
    status: unavailable ? 'unavailable' : failedStations.length || positionFailed ? 'partial' : 'ok',
    stations, failedStations,
    arrivals: arrivalResults.flatMap(r => r.status === 'fulfilled' ? r.value : []),
    trains: position?.trains ?? [], positionFailed, fetchedAt: Date.now(),
    source: 'subway-live · 지하철 실시간',
  };
}
