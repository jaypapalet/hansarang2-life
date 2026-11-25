import { useId, useState, type KeyboardEvent } from 'react';
import { seoulTime, useLiveData } from './live-data';

type Route = {
  name: string; direction: string; next: string; type: string; first: string; second: string;
};
type BusStop = { id: string; status: 'ok' | 'unavailable'; routes: Route[] };
type BusData = { fetchedAt: number; source: string | null; stops: BusStop[] };
type StopInfo = { id: string; name: string; direction: string };

const groups = [
  { label: '후문', stops: [
    { id: '16251', name: '태영·삼성한사랑아파트', direction: '도심 방향' },
    { id: '16252', name: '금호·한솔아파트', direction: '공항 방향' },
  ] },
  { label: '등촌역', stops: [
    { id: '16004', name: '등촌역·강서보건소', direction: '도심 방향' },
    { id: '16003', name: '등촌역·강서보건소', direction: '공항 방향' },
  ] },
];

function normalizeRoute(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, '').replace(/번$/, '').toLowerCase();
}

function arrivalSeconds(value: string) {
  const text = value.split('[')[0];
  const minutes = text.match(/(\d+)\s*분/);
  const seconds = text.match(/(\d+)\s*초/);
  if (minutes || seconds) return Number(minutes?.[1] || 0) * 60 + Number(seconds?.[1] || 0);
  return /곧 도착|잠시 후|바로 도착|^도착$/.test(text.trim()) ? 0 : Infinity;
}

export function BusArrivals() {
  const { data, failed } = useLiveData<BusData>('/api/bus', 60_000);
  const [selected, setSelected] = useState(0);
  const [search, setSearch] = useState('');
  const id = useId();
  const query = normalizeRoute(search);
  const results = new Map(data?.stops.map(stop => [stop.id, stop]));
  const visibleGroups = groups.map(({ label, stops }) => ({
    label,
    stops: stops.map(stop => {
      const response = results.get(stop.id);
      const routes = [...(response?.routes ?? [])]
        .filter(route => normalizeRoute(route.name).includes(query))
        .sort((a, b) => arrivalSeconds(a.first) - arrivalSeconds(b.first));
      return { ...stop, status: response?.status, routes };
    }),
  }));
  const matchedCount = visibleGroups[selected].stops.reduce((count, stop) => count + stop.routes.length, 0);

  function moveTab(event: KeyboardEvent<HTMLDivElement>) {
    let next: number;
    switch (event.key) {
      case 'ArrowLeft': next = (selected + groups.length - 1) % groups.length; break;
      case 'ArrowRight': next = (selected + 1) % groups.length; break;
      case 'Home': next = 0; break;
      case 'End': next = groups.length - 1; break;
      default: return;
    }
    event.preventDefault();
    setSelected(next);
    event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]')[next]?.focus();
  }

  return (
    <section className="bus" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>버스 도착 정보</h2>
      <div className="bus-toolbar">
        <div className="bus-tabs" role="tablist" aria-label="버스 정류장" onKeyDown={moveTab}>
          {groups.map(({ label }, index) => (
            <button key={label} id={`${id}-tab-${index}`} type="button" role="tab"
              aria-selected={selected === index} aria-controls={`${id}-panel-${index}`}
              tabIndex={selected === index ? 0 : -1} onClick={() => setSelected(index)}>{label}</button>
          ))}
        </div>
        <label className="bus-search">
          <span>노선 번호</span>
          <input type="search" placeholder="660 또는 강서04" value={search} autoComplete="off"
            onChange={event => setSearch(event.currentTarget.value)} />
        </label>
      </div>
      <span className="sr-only" role="status">{query ? `${groups[selected].label} 검색 결과 ${matchedCount}건` : ''}</span>
      <p className="secondary bus-example">{data
        ? `${failed ? '이전 조회' : '조회'} ${seoulTime.format(data.fetchedAt)}${data.source ? ' · ' + data.source : ''}`
        : (failed ? '조회 지연' : '조회 중')}</p>
      {visibleGroups.map(({ label, stops }, index) => (
        <div key={label} id={`${id}-panel-${index}`} role="tabpanel" aria-labelledby={`${id}-tab-${index}`}
          tabIndex={0} hidden={selected !== index}>
          <div className="bus-stops">
            {stops.map(stop => <StopArrivals key={stop.id} stop={stop} headingId={`${id}-stop-${stop.id}`} searching={Boolean(query)} loading={!data && !failed} />)}
          </div>
          <div className="bus-source">
            <a href="https://topis.seoul.go.kr/map/openBusMap.do" target="_blank" rel="noopener noreferrer">TOPIS 실시간 도착 정보<span className="sr-only"> (새 탭)</span></a>
          </div>
        </div>
      ))}
    </section>
  );
}

function StopArrivals({ stop, headingId, searching, loading }: {
  stop: StopInfo & { status?: BusStop['status']; routes: Route[] };
  headingId: string; searching: boolean; loading: boolean;
}) {
  const empty = loading ? '조회 중입니다.' : stop.status !== 'ok' ? '도착정보 조회가 지연되고 있습니다.'
    : searching ? '검색 결과가 없습니다.' : '도착정보가 없습니다.';
  return (
    <section className="bus-stop" aria-labelledby={headingId}>
      <div className="bus-stop-meta"><span>{stop.direction}</span><span>ARS {stop.id}</span></div>
      <h3 id={headingId}>{stop.name}</h3>
      {stop.routes.length ? (
        <ul className="bus-routes" role="list">
          {stop.routes.map((route, index) => (
            <li key={`${route.name}-${index}`}>
              <div className="bus-route"><strong data-color={['3', '6'].includes(route.type) ? 'blue' : 'green'}>{route.name}</strong>
                <span>{route.direction || route.next ? `${route.direction || route.next} 방면` : '방면 정보 없음'}</span></div>
              <div className="bus-times"><strong>{route.first}</strong><span>다음 {route.second}</span></div>
            </li>
          ))}
        </ul>
      ) : <p className="secondary bus-empty">{empty}</p>}
    </section>
  );
}
