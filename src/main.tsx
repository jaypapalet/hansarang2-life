import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { CloudSun, Phone } from 'lucide-react';
import { ApartmentNotices, NoticeAdmin } from './apartment-notices';
import { BusArrivals } from './bus-arrivals';
import { seoulTime, useLiveData } from './live-data';
import complexPhoto from './media/hansarang-complex.webp';
import { Neighborhood } from './neighborhood';
import { RoadBoard } from './road-board';
import './styles.css';

const pages = [
  { id: 'today', label: '오늘', title: '오늘 날씨' },
  { id: 'neighborhood', label: '동네 소식', title: '동네 소식' },
  { id: 'life', label: '단지 생활', title: '단지 생활' },
] as const;

type Arrival = { name: string; minutes: number; nextMinutes: number };

const stations = [
  {
    id: 'jeungmi',
    name: '증미역',
    arrivals: [
      { name: '중앙보훈병원 방면', minutes: 3, nextMinutes: 11 },
      { name: '개화 방면', minutes: 6, nextMinutes: 14 },
    ],
  },
  {
    id: 'deungchon',
    name: '등촌역',
    arrivals: [
      { name: '중앙보훈병원 방면', minutes: 5, nextMinutes: 13 },
      { name: '개화 방면', minutes: 4, nextMinutes: 12 },
    ],
  },
] as const;

const charging = [
  { id: 'PW801041', name: '파워큐브', place: '204동 앞 지상' },
  { id: 'PI766096', name: '차지비', place: '지하 1층' },
] as const;
type ChargingData = {
  checkedAt: string;
  stations: { id: string; total: number | null; available: number | null; unknown?: number }[];
};
const office = { phone: '02-3663-1192', href: 'tel:0236631192', hours: '월–금 09:00–18:00' };
const lifeTopics = ['charging', 'office'] as const;

function getHash() {
  return window.location.hash;
}

function subscribeToPage(listener: () => void) {
  window.addEventListener('hashchange', listener);
  return () => window.removeEventListener('hashchange', listener);
}

function Weather() {
  return (
    <section className="weather" aria-labelledby="page-title">
      <div className="weather-content">
        <h1 id="page-title" tabIndex={-1}>오늘 날씨</h1>
        <p className="weather-place">등촌1동 · <time dateTime="2026-11-25">11월 25일 수요일</time> · 예시</p>
        <div className="weather-current">
          <strong className="temperature" aria-label="섭씨 12도">12°</strong>
          <p className="weather-condition"><CloudSun size={25} aria-hidden="true" />구름 조금</p>
        </div>
        <dl className="weather-details">
          <div><dt>최저</dt><dd>4°</dd></div>
          <div><dt>최고</dt><dd>14°</dd></div>
          <div><dt>강수 확률</dt><dd>10%</dd></div>
          <div><dt>체감</dt><dd>10°</dd></div>
        </dl>
      </div>
      <img className="weather-photo" src={complexPhoto} alt="한사랑2차삼성아파트 전경" width={1050} height={1397} fetchPriority="high" />
    </section>
  );
}

function ArrivalRows({ arrivals }: { arrivals: readonly Arrival[] }) {
  return (
    <ul className="arrivals" role="list">
      {arrivals.map(({ name, minutes, nextMinutes }) => (
        <li key={`${name}-${minutes}`}>
          <span className="arrival-name">{name}</span>
          <span className="arrival-times">
            <strong>{minutes}<span>분</span></strong>
            <small>다음<span className="sr-only"> 열차</span> {nextMinutes}분</small>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Subway() {
  return (
    <section className="subway" aria-labelledby="subway-title">
      <div className="section-heading">
        <h2 id="subway-title">지하철 도착 정보</h2>
        <span className="secondary">9호선 일반 · 예시</span>
      </div>
      <div className="stations">
        {stations.map(({ id, name, arrivals }) => (
          <section key={id} className="station" aria-labelledby={`${id}-title`}>
            <h3 id={`${id}-title`}>{name}</h3>
            <ArrivalRows arrivals={arrivals} />
          </section>
        ))}
      </div>
    </section>
  );
}

function Today() {
  return (
    <>
      <Weather />
      <Subway />
      <BusArrivals />
      <RoadBoard />
    </>
  );
}

function LocalServices() {
  const { data, failed } = useLiveData<ChargingData>('/api/ev', 300_000);
  return (
    <>
      <ApartmentNotices />
      <div className="life-details">
        <section id="life-charging" tabIndex={-1} className="life-detail" aria-labelledby="charging-title">
          <h2 id="charging-title">전기차 충전</h2>
          <dl className="facts">
            {charging.map(({ id, name, place }) => {
              const station = data?.stations.find(item => item.id === id);
              const availability = station?.available != null && station.total != null
                ? `${station.available} / ${station.total}대 사용 가능`
                : station?.total != null ? `총 ${station.total}대 · 가용 미확인`
                  : data || failed ? '조회 지연' : '조회 중';
              return <div key={id}><dt>{name}<small>{place}</small></dt><dd>{availability}</dd></div>;
            })}
          </dl>
          <p className="source-note">{data ? `${failed ? '이전 조회' : '조회'} ${seoulTime.format(new Date(data.checkedAt))}`
            : failed ? '충전소 조회 지연' : '충전소 조회 중'}</p>
        </section>
        <section id="life-office" tabIndex={-1} className="life-detail" aria-labelledby="office-title">
          <h2 id="office-title">관리사무소</h2>
          <dl className="facts">
            <div><dt>업무시간</dt><dd>{office.hours}</dd></div>
            <div><dt>전화</dt><dd><a className="phone" href={office.href}><Phone size={16} aria-hidden="true" />{office.phone}</a></dd></div>
          </dl>
        </section>
      </div>
    </>
  );
}

function App() {
  const hash = useSyncExternalStore(subscribeToPage, getHash);
  const admin = ['/admin', '/admin/'].includes(window.location.pathname);
  const home = admin ? '/' : '';
  const [, route, topic] = hash.split('/');
  const page = pages.find(item => item.id === route) ?? pages[0];
  const lifeTopic = page.id === 'life' && lifeTopics.some(id => id === topic) ? topic : undefined;
  const previousHash = useRef<string | undefined>(undefined);
  const main = useRef<HTMLElement>(null);

  useEffect(() => {
    const previous = previousHash.current;
    previousHash.current = hash;
    if (previous === hash || (previous === undefined && !lifeTopic)) return;
    if (lifeTopic) {
      const target = document.getElementById(`life-${lifeTopic}`);
      target?.focus({ preventScroll: true });
      target?.scrollIntoView({ block: 'nearest' });
    } else {
      document.getElementById('page-title')?.focus({ preventScroll: true });
      window.scrollTo(0, 0);
    }
  }, [hash, lifeTopic]);

  return (
    <>
      <a className="skip" href="#main" onClick={(event) => {
        event.preventDefault();
        main.current?.focus();
      }}>본문으로 건너뛰기</a>
      <header className="site-header">
        <div className="frame masthead">
          <a className="brand" href={`${home}#/today`}>한사랑2차 생활정보</a>
          <nav className="main-nav" aria-label="주요 메뉴">
            {pages.map(({ id, label }) => (
              <a key={id} href={`${home}#/${id}`} aria-current={!admin && page.id === id ? 'page' : undefined}>{label}</a>
            ))}
          </nav>
        </div>
      </header>
      <main id="main" className="frame main" tabIndex={-1} ref={main}>
        {admin || page.id !== 'today' ? <h1 id="page-title" className="page-title" tabIndex={-1}>{admin ? '아파트 공지 관리' : page.title}</h1> : null}
        {admin ? <NoticeAdmin /> : page.id === 'today' ? <Today /> : page.id === 'neighborhood' ? <Neighborhood /> : <LocalServices />}
      </main>
      <footer className="frame footer">
        한사랑2차 입주민 생활정보
        <small className="footer-credit">도움주신 분 : 202동 입주민, 청결이</small>
      </footer>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
