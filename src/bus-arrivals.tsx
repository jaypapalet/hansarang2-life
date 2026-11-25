import { useId, useState, type KeyboardEvent } from 'react';

type BusArrival = readonly [
  route: string,
  destination: string,
  first: string,
  next: string,
  color?: 'blue' | 'green',
];

type BusStop = {
  id: string;
  name: string;
  direction: string;
  arrivals: readonly BusArrival[];
};

const groups = [
  {
    label: '후문',
    stops: [
      {
        id: '16251',
        name: '태영·삼성한사랑아파트',
        direction: '도심 방향',
        arrivals: [
          ['660', '온수동', '1분 후 · 1정류장 전', '26분 후 · 17정류장 전', 'blue'],
          ['6631', '영등포시장', '5분 후 · 2정류장 전', '16분 후 · 9정류장 전'],
          ['6712', '서강대학교', '5분 후 · 2정류장 전', '18분 후 · 9정류장 전'],
          ['강서04', '경복여고', '7분 후 · 3정류장 전', '19분 후 · 11정류장 전'],
          ['672', '이대후문', '10분 후 · 7정류장 전', '28분 후 · 17정류장 전', 'blue'],
          ['6627', '이대목동병원', '12분 후 · 6정류장 전', '32분 후 · 17정류장 전'],
          ['1002김포', '염창동아3차아파트', '21분 후 · 13정류장 전', '46분 후 · 23정류장 전', 'blue'],
        ],
      },
      {
        id: '16252',
        name: '금호·한솔아파트',
        direction: '공항 방향',
        arrivals: [
          ['6631', '강서공영차고지·개화역', '곧 도착', '9분 후 · 5정류장 전'],
          ['1002김포', '해병2사단입구', '곧 도착', '35분 후 · 21정류장 전', 'blue'],
          ['강서04', '염창역', '2분 후 · 1정류장 전', '출발 대기'],
          ['660', '가양역', '5분 후 · 3정류장 전', '16분 후 · 8정류장 전', 'blue'],
          ['6712', '방화동', '7분 후 · 3정류장 전', '18분 후 · 10정류장 전'],
          ['6627', '양천공영차고지', '12분 후 · 5정류장 전', '29분 후 · 16정류장 전'],
          ['672', '방화동기점', '16분 후 · 7정류장 전', '27분 후 · 11정류장 전', 'blue'],
        ],
      },
    ],
  },
  {
    label: '등촌역',
    stops: [
      {
        id: '16004',
        name: '등촌역·강서보건소',
        direction: '도심 방향',
        arrivals: [
          ['601', '혜화역', '곧 도착', '12분 후 · 8정류장 전', 'blue'],
          ['6632', '당산역', '2분 후 · 1정류장 전', '13분 후 · 9정류장 전'],
          ['605', '서울역·후암동', '4분 후 · 2정류장 전', '15분 후 · 10정류장 전', 'blue'],
          ['602', '시청앞', '5분 후 · 3정류장 전', '17분 후 · 12정류장 전', 'blue'],
          ['5712', '홍대입구역', '6분 후 · 4정류장 전', '18분 후 · 11정류장 전'],
          ['6623', '여의도', '8분 후 · 5정류장 전', '20분 후 · 13정류장 전'],
          ['606', '조계사', '10분 후 · 6정류장 전', '22분 후 · 14정류장 전', 'blue'],
        ],
      },
      {
        id: '16003',
        name: '등촌역·강서보건소',
        direction: '공항 방향',
        arrivals: [
          ['605', '강서공영차고지·개화역', '1분 후 · 1정류장 전', '13분 후 · 8정류장 전', 'blue'],
          ['601', '개화동', '3분 후 · 2정류장 전', '15분 후 · 9정류장 전', 'blue'],
          ['6623', '양천공영차고지', '4분 후 · 2정류장 전', '16분 후 · 10정류장 전'],
          ['6632', '강서공영차고지·개화역', '6분 후 · 4정류장 전', '18분 후 · 11정류장 전'],
          ['602', '양천공영차고지', '7분 후 · 4정류장 전', '19분 후 · 12정류장 전', 'blue'],
          ['5712', '가산동기점', '9분 후 · 5정류장 전', '21분 후 · 13정류장 전'],
          ['606', '부천상동', '11분 후 · 7정류장 전', '23분 후 · 15정류장 전', 'blue'],
        ],
      },
    ],
  },
] as const satisfies readonly { label: string; stops: readonly BusStop[] }[];

function normalizeRoute(value: string) {
  return value.normalize('NFKC').replace(/\s+/g, '').replace(/번$/, '').toLowerCase();
}

export function BusArrivals() {
  const [selected, setSelected] = useState(0);
  const [search, setSearch] = useState('');
  const id = useId();
  const query = normalizeRoute(search);
  const visibleGroups = groups.map(({ label, stops }) => ({
    label,
    stops: stops.map(stop => ({ ...stop, arrivals: stop.arrivals.filter(([route]) => normalizeRoute(route).includes(query)) })),
  }));
  const matchedCount = visibleGroups[selected].stops.reduce((count, stop) => count + stop.arrivals.length, 0);

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
              tabIndex={selected === index ? 0 : -1} onClick={() => setSelected(index)}>
              {label}
            </button>
          ))}
        </div>
        <label className="bus-search">
          <span>노선 번호</span>
          <input type="search" placeholder="660 또는 강서04" value={search} autoComplete="off"
            onChange={event => setSearch(event.currentTarget.value)} />
        </label>
      </div>
      <span className="sr-only" role="status">{query ? `${groups[selected].label} 검색 결과 ${matchedCount}건` : ''}</span>
      <p className="secondary bus-example">도착 시간 예시</p>
      {visibleGroups.map(({ label, stops }, index) => (
        <div key={label} id={`${id}-panel-${index}`} role="tabpanel" aria-labelledby={`${id}-tab-${index}`}
          tabIndex={0} hidden={selected !== index}>
          <div className="bus-stops">
            {stops.map(stop => <StopArrivals key={stop.id} stop={stop} headingId={`${id}-stop-${stop.id}`} />)}
          </div>
          <div className="bus-source">
            <a href="https://topis.seoul.go.kr/map/openBusMap.do" target="_blank" rel="noopener noreferrer">TOPIS 실시간 도착 정보<span className="sr-only"> (새 탭)</span></a>
          </div>
        </div>
      ))}
    </section>
  );
}

function StopArrivals({ stop, headingId }: { stop: BusStop; headingId: string }) {
  const { arrivals } = stop;
  return (
    <section className="bus-stop" aria-labelledby={headingId}>
      <div className="bus-stop-meta"><span>{stop.direction}</span><span>ARS {stop.id}</span></div>
      <h3 id={headingId}>{stop.name}</h3>
      {arrivals.length > 0 ? (
        <ul className="bus-routes" role="list">
          {arrivals.map(([route, destination, first, next, color = 'green']) => (
            <li key={route}>
              <div className="bus-route"><strong data-color={color}>{route}</strong><span>{destination} 방면</span></div>
              <div className="bus-times"><strong>{first}</strong><span>다음 {next}</span></div>
            </li>
          ))}
        </ul>
      ) : <p className="secondary bus-empty">검색 결과가 없습니다.</p>}
    </section>
  );
}
