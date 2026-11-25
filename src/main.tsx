import { useEffect, useRef, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { Phone } from 'lucide-react';
import { ApartmentNotices, NoticeAdmin } from './apartment-notices';
import { BusArrivals } from './bus-arrivals';
import { seoulTime, useLiveData } from './live-data';
import { Neighborhood } from './neighborhood';
import { RoadBoard, RoadDataCredit } from './road-board';
import { SubwayArrivals } from './subway-arrivals';
import { Weather } from './weather';
import './styles.css';

const pages = [
  { id: 'today', label: '오늘', title: '오늘 날씨' },
  { id: 'neighborhood', label: '동네 소식', title: '동네 소식' },
  { id: 'life', label: '단지 생활', title: '단지 생활' },
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

function Today() {
  return (
    <>
      <Weather />
      <SubwayArrivals />
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
        {!admin && page.id === 'today' && <RoadDataCredit />}
      </footer>
    </>
  );
}

createRoot(document.getElementById('root')!).render(<App />);
