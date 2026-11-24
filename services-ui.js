const DATA_GO_KR_KMA = 'https://www.data.go.kr/data/15084084/openapi.do';
const DATA_GO_KR_EV = 'https://www.data.go.kr/data/15076352/openapi.do';
const evFallback = [
  {id:'PI766096', operator:'차지비', name:'한사랑2차삼성아파트', location:'지하 1층', residentsOnly:true},
  {id:'PW801041', operator:'파워큐브', name:'한사랑2차삼성아파트(SP)', location:'204동 앞 지상', residentsOnly:true}
];

const timeFormat = new Intl.DateTimeFormat('ko-KR', {timeZone:'Asia/Seoul', month:'numeric', day:'numeric', hour:'2-digit', minute:'2-digit', hour12:false});
const stamp = time => time ? timeFormat.format(new Date(time)) : '';
function el(tag, className, value) {
  const node = document.createElement(tag);
  node.className = className;
  if (value !== undefined) node.textContent = value;
  return node;
}
function link(text, href) {
  const node = el('a', 'svc-link', text);
  node.href = href;
  node.target = '_blank';
  node.rel = 'noopener noreferrer';
  return node;
}
function sky(code, day) {
  if (code === 0) return [day ? 'sun' : 'moon','맑음'];
  if (code === 1 || code === 2) return [day ? 'mixed' : 'cloud', '구름 조금'];
  if (code === 3) return ['cloud','흐림'];
  if ([45,48].includes(code)) return ['fog','안개'];
  if ([71,73,75,77,85,86].includes(code)) return ['snow','눈'];
  if (code >= 95) return ['storm','뇌우'];
  if ([51,53,55,56,57].includes(code)) return ['rain','이슬비'];
  if ([61,63,65,66,67,80,81,82].includes(code)) return ['rain','비'];
  return ['unknown','날씨 확인 중'];
}
function skyIcon(type) {
  const icon = el('span','svc-sky svc-sky-' + type);
  icon.setAttribute('aria-hidden','true');
  icon.append(el('i','svc-orb'), el('i','svc-cloud'), el('i','svc-fall'));
  return icon;
}

function renderWeather(root, data, loading = false) {
  const current = data?.conditions;
  const [icon, label] = current ? sky(current.code, current.isDay) : ['unknown', loading ? '날씨 조회 중' : '날씨 조회 지연'];
  const card = el('div','svc-weather');
  const main = el('div','svc-weather-main');
  main.append(skyIcon(icon));
  const metric = el('div','svc-weather-metric');
  metric.append(el('span','svc-place','강서구 등촌1동'), el('strong','svc-temp',current ? Math.round(current.temperature) + '°' : '—'),el('span','svc-condition',label));
  main.append(metric);
  const rain = el('div','svc-rain');
  rain.append(el('span','svc-rain-label','이번 시간 강수확률'), el('strong','svc-percent',Number.isFinite(current?.probability) ? current.probability + '%' : '—'));
  main.append(rain);
  const bottom = el('div','svc-weather-bottom');
  const alerts = data?.alerts;
  const warning = link('', 'https://www.weather.go.kr/w/special-report/overall.do');
  warning.className = 'svc-warning' + (alerts?.length ? ' svc-warning-active' : '');
  const alertText = !Array.isArray(alerts) ? (loading ? '특보 조회 중' : '특보 확인 필요') : alerts.length ? alerts.join(' · ') : '발효 특보 없음';
  warning.textContent = (alerts?.length ? '⚠ ' : 'ⓘ ') + alertText;
  bottom.append(warning);
  const source = el('span','svc-weather-source');
  if (current?.source === '기상청') source.append(link('기상청 동네예보' + (current.via ? ' · ' + current.via : ''), DATA_GO_KR_KMA));
  else if (current?.source === 'Open-Meteo') source.append(link('기상청 조회 지연 · Open-Meteo 보조', 'https://open-meteo.com/'));
  else source.append(document.createTextNode(loading ? '자료원 연결 중' : '날씨 자료 조회 지연'));
  if (current) source.append(document.createTextNode(' · ' + stamp(current.time) + ' 기준'));
  bottom.append(source);
  card.append(main, bottom);
  root.replaceChildren(card);
}

function renderEv(root, data, loading = false) {
  const grid = el('div','svc-ev-grid');
  for (const configured of evFallback) {
    const station = data?.stations?.find(item => item.id === configured.id) ?? configured;
    const row = el('article','svc-ev-station');
    const title = el('div','svc-ev-top');
    title.append(el('strong','svc-operator',station.operator), el('span','svc-location',station.location));
    if (station.residentsOnly) title.append(el('span','svc-residents-only','입주민 전용'));
    row.append(title,el('div','svc-station-name',station.name));
    const count = el('div','svc-ev-count');
    if (Number.isInteger(station.available)) {
      count.append(el('strong','svc-available',station.available + '대'),document.createTextNode(' 충전 가능 / 전체 ' + station.total + '대'));
    } else {
      count.append(el('strong','svc-unconfirmed',loading ? '조회 중' : '가용 대수 미확인'));
      if (station.total) count.append(document.createTextNode(' / 전체 ' + station.total + '대'));
    }
    row.append(count);
    const foot = el('div','svc-station-foot');
    const notes = [];
    if (station.status === 'stale') notes.push('집계 지연');
    if (station.responded === true) notes.push(station.status === 'unavailable' ? '자료원 응답 · 상태 해석 불가' : (station.source || '자료원') + ' 응답');
    else if (station.responded === false) notes.push('자료원 연결 실패');
    else if (!loading) notes.push('조회 결과 미수신');
    if (station.unknown) notes.push('상태 미확인 ' + station.unknown + '대');
    if (station.sourceTime) notes.push((station.source === '한국환경공단' ? '최근 상태 변경 ' : '자료 집계 ') + stamp(station.sourceTime));
    if (station.checkedAt) notes.push('조회 ' + stamp(station.checkedAt));
    foot.append(el('span','',notes.join(' · ')), link('원문', station.source === '한국환경공단' ? DATA_GO_KR_EV : 'https://evstat.seotory.com/s/' + station.id));
    row.append(foot);
    grid.append(row);
  }
  root.replaceChildren(grid,el('p','svc-ev-note','충전소별 5분마다 조회 · 한국환경공단 / EVStat'));
}

export function initServices() {
  for (const [kind, render] of [['weather',renderWeather], ['ev',renderEv]]) {
    const root = document.getElementById(kind);
    if (!root) continue;
    let lastAttempt = 0;
    let busy = false;
    const refresh = async () => {
      if (busy || document.hidden || Date.now()-lastAttempt < 15000) return;
      busy = true;
      lastAttempt = Date.now();
      try {
        const response = await fetch('/api/' + kind,{cache:'no-store',signal:AbortSignal.timeout(25000)});
        if (!response.ok) throw new Error('조회 지연');
        render(root, await response.json());
      } catch {
        render(root, null);
      } finally {
        busy = false;
      }
    };
    render(root,null,true);
    refresh();
    setInterval(refresh, 300000);
    document.addEventListener('visibilitychange', () => {
      if (Date.now()-lastAttempt >= 300000) refresh();
    });
  }
}
