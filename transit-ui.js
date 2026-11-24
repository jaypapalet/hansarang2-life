const names = ['가양','증미','등촌','염창'];
const stops = [
  {id:'16251',name:'태영.삼성한사랑아파트',direction:'도심 방향'},
  {id:'16252',name:'금호.한솔아파트',direction:'공항 방향'}
];
const esc = value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clock = value=>new Intl.DateTimeFormat('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:'Asia/Seoul'}).format(value);
const directions = {up:'중앙보훈병원 방면',down:'개화·김포공항 방면'};

// 적응형 폴링: 운행 시간에만 조회하고, 다음 차까지 남은 시간에 따라 간격을 바꾼다.
// 공식 API(1일 1,000회)일 때는 보수적으로, 제3자 경유일 때는 빠르게 조회한다.
// 운행 시간은 대략적인 게이트(지하철 05:30-24:00, 버스 04:30-23:30)이며,
// 표시되는 첫차·막차 시각이 아니라 조회 여부만 정한다.
function seoulMinutes(now = Date.now()) {
  const d = new Date(new Date(now).toLocaleString('en-US', {timeZone: 'Asia/Seoul'}));
  return d.getHours() * 60 + d.getMinutes();
}
function inService(kind, now = Date.now()) {
  const m = seoulMinutes(now);
  return kind === 'subway' ? m >= 330 : m >= 270 && m < 1410;
}
export function computeDelay(railData, busData, now = Date.now()) {
  let minDue = Infinity;
  for (const r of (railData?.arrivals || [])) if (r.due && r.due > now) minDue = Math.min(minDue, r.due - now);
  for (const s of (busData?.stops || [])) for (const r of (s.routes || [])) {
    const text = String(r.first || '');
    const m = text.match(/(\d+)\s*분/);
    if (m) minDue = Math.min(minDue, Number(m[1]) * 60000);
    else if (/곧|바로/.test(text)) minDue = Math.min(minDue, 30000);
  }
  const official = (railData?.source || '').includes('공식') || (busData?.source || '').includes('공식');
  if (!inService('subway', now) && !inService('bus', now)) return 600000;
  if (!Number.isFinite(minDue)) return official ? 480000 : 300000;
  if (minDue <= 60000) return official ? 60000 : 15000;
  if (minDue <= 180000) return official ? 60000 : 30000;
  if (minDue <= 600000) return official ? 180000 : 120000;
  return official ? 480000 : 300000;
}
const busSource = 'https://topis.seoul.go.kr/map/openBusMap.do';

function status(data) {
  if (!data) return '조회 중';
  if (data.status==='unconfigured') return '실시간 연결 대기';
  if (data.status==='unavailable') return '조회 지연';
  return (data.status==='partial'?'일부 조회 지연 · ':'')+clock(data.fetchedAt)+' 조회';
}
function eta(row) {
  if (!row.due) return row.message||'시간 미제공';
  const minutes=Math.ceil((row.due-Date.now())/60000);
  return minutes>0?minutes+'분':'곧 도착';
}
const windows = {증미:names.slice(0,3), 등촌:names.slice(1)};
const directionsInView = ['down','up'];
const expressStops = new Set(['가양','염창']);

function trainPos(train, selected) {
  const index = names.indexOf(train.station);
  if (index < 0) return null;
  const phase = {'진입':-0.25,'출발':0.2,'전역 출발':-0.5}[train.state] || 0;
  const relative = index - names.indexOf(windows[selected][0]) + phase*(train.direction==='up'?1:-1);
  if (relative < -0.4 || relative > 2.4) return null;
  return (relative + 0.5)*100/3;
}

function firstArrivalSeconds(message) {
  const text = String(message || '').split('[')[0];
  if (/곧|잠시 후|바로|도착\s*(?:예정)?\s*$/.test(text) && !/\d|없|미정|정보/.test(text)) return 0;
  const minutes = text.match(/(\d+)\s*분/);
  const seconds = text.match(/(\d+)\s*초/);
  return minutes || seconds ? Number(minutes?.[1] || 0)*60 + Number(seconds?.[1] || 0) : Infinity;
}
function laneShell(direction) {
  return '<div class="rt-caption">' + (direction === 'up' ? '상행' : '하행') + ' · ' + directions[direction] + '</div>'
    + '<div class="rt-lane" data-lane="' + direction + '"><div class="rt-track-line"></div><div class="rt-dots" data-lane="' + direction + '"></div></div>';
}
function buildRail(root, selected) {
  const tabs = Object.keys(windows).map(n=>'<button type="button" data-station="'+n+'" aria-pressed="'+(selected===n)+'">'+n+'역</button>').join('');
  root.innerHTML = '<div class="rt-rail"><div class="rt-tabs" role="group" aria-label="도착정보 기준역">'+tabs+'</div>'
    +laneShell('down')+'<div class="rt-line"></div>'+laneShell('up')
    +'<div class="rt-detail"></div><div class="rt-foot"></div></div>';
}
// 마커 노드는 재사용한다: left만 바꾸면 CSS transition이 9초간 미끄러지듯 이동시킨다.
function syncTrains(root, trains, selected) {
  for (const direction of directionsInView) {
    const dots = root.querySelector('.rt-dots[data-lane="' + direction + '"]');
    if (!dots) continue;
    const seen = new Set();
    for (const t of trains.filter(row => row.direction === direction)) {
      const pos = trainPos(t,selected);
      if (pos === null) continue;
      const key = t.train || (t.station + '-' + t.state);
      seen.add(key);
      let node = dots.querySelector('[data-train="' + CSS.escape(key) + '"]');
      if (!node) {
        node = document.createElement('div');
        node.className = 'rt-train-dot';
        node.dataset.train = key;
        node.innerHTML = '<span class="rt-train-number"></span><span class="rt-train-shape" aria-hidden="true"><i></i><i></i><i></i><i></i></span><span class="rt-train-meta"></span>';
        node.style.left = pos + '%';
        dots.appendChild(node);
      }
      node.style.left = pos + '%';
      node.classList.toggle('is-express', Boolean(t.express));
      node.querySelector('.rt-train-number').textContent = t.train || '번호 미제공';
      const pass = t.express && !expressStops.has(selected);
      node.querySelector('.rt-train-meta').textContent = (t.express ? '급행' : '일반') + ' · ' + (pass ? selected + ' 통과' : (t.state || '운행'));
      node.title = [t.train ? t.train + ' 열차' : '', t.destination ? t.destination + '행' : '', t.express ? '급행' : '일반', pass ? selected + '역 무정차 통과' : t.state].filter(Boolean).join(' · ');
    }
    for (const node of [...dots.children]) if (!seen.has(node.dataset.train)) node.remove();
  }
}
function updateRail(root, data, selected) {
  const arrivals = [...(data?.arrivals || [])].sort((a,b)=>(a.due??Infinity)-(b.due??Infinity)), trains = data?.trains || [];
  const windowStations=windows[selected];
  root.querySelector('.rt-line').innerHTML=windowStations.map(n=>'<span class="'+(n===selected?'rt-selected':'')+'"><i></i>'+n+'</span>').join('');
  root.querySelectorAll('[data-station]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.station === selected)));
  let detail = '';
  if (['ok', 'partial'].includes(data?.status)) {
    const groups = directionsInView.map(d => {
      const rows = arrivals.filter(r => r.station === selected && r.direction === d && (!r.due || Date.now() - r.due < 20000) && (!r.express || expressStops.has(selected)));
      return '<div><b>' + directions[d] + '</b>' + (rows.length ? rows.map(r => '<div class="rt-arrival"><span>' + esc(r.destination ? r.destination + '행' : '행선지 미제공') + ' ' + esc(r.express ? '급행' : '일반') + '</span><strong>' + esc(eta(r)) + '</strong></div>').join('') : '<p>' + (data.failedStations?.includes(selected) ? '조회 지연' : '도착예정 정보 없음') + '</p>') + '</div>';
    }).join('');
    detail = '<div><h3>' + selected + '역 도착 예정</h3><div class="rt-etas">' + groups + '</div></div>';
  }
  root.querySelector('.rt-detail').innerHTML = detail;
  root.querySelector('.rt-foot').innerHTML = '<span>' + esc(status(data)) + (data?.positionFailed ? ' · 열차 위치 조회 지연' : '') + (!inService('subway') && !(data?.arrivals || []).length ? ' · 운행 시간 외' : '') + '</span><a href="https://subway-live.com/" target="_blank" rel="noopener">subway-live에서 보기</a>';
  syncTrains(root, trains, selected);
}
function renderBus(root,data) {
  root.innerHTML='<div class="rt-buses">'+(data?.stops||stops).map(stop=>{
    const rows=[...(stop.routes||[])].sort((a,b)=>firstArrivalSeconds(a.first)-firstArrivalSeconds(b.first)).map(r=>'<div class="rt-bus-row"><div><b class="rt-bus-no rt-b'+esc(r.type)+'">'+esc(r.name)+'</b><span>'+esc(r.direction?r.direction+' 방면':r.next?r.next+' 방면':'방면 정보 없음')+'</span></div><div class="rt-bus-times"><strong>'+esc(r.first)+'</strong><small>다음 '+esc(r.second)+'</small></div></div>').join('');
    return '<article class="rt-stop"><div class="rt-stop-head"><span>'+esc(stop.direction)+'</span><small>'+esc(stop.id)+'</small></div><h3>'+esc(stop.name)+'</h3>'
      +(rows||'<p class="rt-empty">'+(stop.status==='ok'?'도착예정 정보 없음':stop.status==='unavailable'?'도착정보 조회 지연':data?'실시간 연결 대기':'도착정보 조회 중')+'</p><a class="rt-stop-link" href="https://makka.co.kr/bus/seoul/'+stop.id+'" target="_blank" rel="noopener">이 정류소 도착정보 보기</a>')+'</article>';
  }).join('')+'</div><div class="rt-foot"><span>'+esc(status(data))+(!inService('bus')?' · 운행 시간 외':'')+'</span><a href="'+busSource+'" rel="noopener" target="_blank">TOPIS에서 확인</a></div>';
}

export function initTransit() {
  const railRoot=document.querySelector('#subway'), busRoot=document.querySelector('#bus');
  let selected='등촌', rail=null, buses=null, busy=false;
  railRoot.addEventListener('click',event=>{
    const button=event.target.closest('button[data-station]');
    if(!button)return;
    if (button.dataset.station === selected) return;
    selected=button.dataset.station;
    railRoot.querySelectorAll('.rt-dots').forEach(container=>container.replaceChildren());
    updateRail(railRoot,rail,selected);
    railRoot.querySelector('[data-station="'+selected+'"]').focus({preventScroll:true});
  });
  buildRail(railRoot,selected);
  updateRail(railRoot,rail,selected);
  renderBus(busRoot,buses);
  async function refresh(kind) {
    let result;
    try {
      const res=await fetch('/api/'+kind,{cache:'no-store',signal:AbortSignal.timeout(22000)});
      if(!res.ok)throw Error();
      result=await res.json();
      if(!['ok','partial','unconfigured','unavailable'].includes(result.status))throw Error();
    } catch {result={status:'unavailable',stops:stops.map(s=>({...s,status:'unavailable'}))};}
    if(kind==='subway'){rail=result;updateRail(railRoot,rail,selected);}
    else{buses=result;renderBus(busRoot,buses);}
  }
  async function update() {
    if (document.hidden || busy) return;
    busy=true;
    try {await Promise.all([refresh('subway'),refresh('bus')]);} finally {busy=false;}
  }
  let timer = null;
  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(async () => {
      if (document.hidden) { schedule(); return; }
      await update();
      schedule();
    }, computeDelay(rail, buses));
  }
  update().then(schedule);
  // 카운트다운은 로컬에서 10초마다 다시 그린다. 조회는 하지 않는다.
  setInterval(() => { updateRail(railRoot, rail, selected); renderBus(busRoot, buses); }, 10000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) update().then(schedule); });
}
