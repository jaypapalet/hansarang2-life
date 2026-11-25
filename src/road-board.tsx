import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import roadPlaces from './road-places.json';
import roadTimes from './road-times.json';
import { VmsDialog } from './vms-dialog';

const refreshMs = 10 * 60 * 1000;
const { origin, destinations } = roadPlaces;

type TravelTime = { meters: number; seconds: number };
type FixedTimes = {
  checkedAt: number;
  routes: (TravelTime & { id: string; updatedAt: number })[];
};
type Place = { id: string; name: string; address: string; lat: number; lon: number };

const routeErrors: Record<string, string> = {
  kakao_not_configured: '카카오 길찾기 API 키가 등록되면 사용할 수 있습니다.',
  kakao_access: '카카오 API 사용 권한을 확인해 주세요.',
  quota_exceeded: '조회 한도에 도달했습니다. 카카오맵에서 길찾기를 확인해 주세요.',
  too_many_requests: '잠시 뒤 다시 조회해 주세요.',
  no_route: '이 목적지까지 자동차 경로를 찾지 못했습니다.',
};

function minutes(seconds: number) {
  return seconds === 0 ? '0분' : `약 ${Math.ceil(seconds / 60)}분`;
}

function kakaoDirections(destination: Pick<Place, 'lat' | 'lon' | 'name'>) {
  const encode = (place: Pick<Place, 'lat' | 'lon' | 'name'>) =>
    `${encodeURIComponent(place.name)},${place.lat},${place.lon}`;
  return `https://map.kakao.com/link/by/car/${encode(origin)}/${encode(destination)}`;
}

async function roadRequest<T>(path: string, body: unknown, signal: AbortSignal): Promise<T> {
  if (window.location.protocol === 'file:') throw new Error('file_preview');
  const response = await fetch(`/api/roads/${path}`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(body),
    signal,
    cache: 'no-store',
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error);
  return data as T;
}

function DestinationSearch() {
  const inputId = useId();
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<Place[]>([]);
  const [result, setResult] = useState<{ place: Place; time: TravelTime } | null>(null);
  const [status, setStatus] = useState('');
  const active = useRef<AbortController | null>(null);

  useEffect(() => () => active.current?.abort(), []);

  function start(message: string) {
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setResult(null);
    setStatus(message);
    return controller;
  }

  function report(error: unknown, signal: AbortSignal) {
    if (signal.aborted) return;
    const code = error instanceof Error ? error.message : '';
    setStatus(code === 'file_preview' ? '서버에서 연 화면에서 목적지를 검색할 수 있습니다.'
      : routeErrors[code] ?? '카카오에 연결하지 못했습니다. 잠시 뒤 다시 시도해 주세요.');
  }

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const keyword = query.trim();
    if (keyword.length < 2) return;
    const {signal} = start('목적지를 찾는 중입니다.');
    setPlaces([]);
    try {
      const data = await roadRequest<{ places: Place[] }>('search', {query: keyword}, signal);
      if (signal.aborted) return;
      setPlaces(data.places);
      setStatus(data.places.length ? '목적지를 선택해 주세요.' : '검색 결과가 없습니다.');
    } catch (error) {
      report(error, signal);
    }
  }

  async function select(place: Place) {
    const {signal} = start(`${place.name}까지의 경로를 조회 중입니다.`);
    try {
      const time = await roadRequest<TravelTime>('directions', {lat: place.lat, lon: place.lon}, signal);
      if (signal.aborted) return;
      setResult({place, time});
      setStatus('');
    } catch (error) {
      report(error, signal);
    }
  }

  return (
    <div className="destination-search">
      <form onSubmit={search}>
        <label htmlFor={inputId}>목적지 검색</label>
        <div className="destination-field">
          <input id={inputId} type="search" autoComplete="off" maxLength={80} placeholder="장소 이름이나 주소"
            value={query} onChange={event => {
              active.current?.abort();
              setQuery(event.currentTarget.value);
              setPlaces([]);
              setResult(null);
              setStatus('');
            }} />
          <button type="submit" disabled={query.trim().length < 2}>검색</button>
        </div>
      </form>
      <div className="destination-status" role="status">
        {status && <p className="secondary">{status}</p>}
        {result && (
          <p><strong>{result.place.name}</strong>까지 <strong>{minutes(result.time.seconds)}</strong> · {(result.time.meters / 1000).toFixed(1)}km
            {' '}<a href={kakaoDirections(result.place)} target="_blank" rel="noopener noreferrer">카카오맵 길찾기<span className="sr-only"> (새 탭)</span></a>
          </p>
        )}
      </div>
      {places.length > 0 && (
        <ul className="destination-results" aria-label="목적지 검색 결과" role="list">
          {places.map(place => (
            <li key={place.id}>
              <button type="button" onClick={() => select(place)}>
                <strong>{place.name}</strong>{place.address && <span>{place.address}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function RoadBoard() {
  const [fixed, setFixed] = useState<FixedTimes | null>(null);
  const [failed, setFailed] = useState(false);
  const [vmsOpen, setVmsOpen] = useState(false);
  const filePreview = window.location.protocol === 'file:';

  useEffect(() => {
    if (filePreview) return;
    const controller = new AbortController();
    let timer: number | undefined;
    let pending = false;

    async function update() {
      window.clearTimeout(timer);
      if (pending || document.hidden) return;
      pending = true;
      let delay = refreshMs;
      try {
        const response = await fetch('/api/roads/fixed', {signal: controller.signal, cache: 'no-store'});
        if (!response.ok) throw new Error('road_data_unavailable');
        const snapshot: FixedTimes = await response.json();
        if (controller.signal.aborted) return;
        setFixed(snapshot);
        setFailed(false);
        delay = Math.max(1000, Math.min(refreshMs + 500, snapshot.checkedAt + refreshMs - Date.now() + 500));
      } catch {
        if (!controller.signal.aborted) setFailed(true);
      } finally {
        pending = false;
        if (!controller.signal.aborted) timer = window.setTimeout(update, delay);
      }
    }

    const onVisible = () => { if (!document.hidden) void update(); };
    document.addEventListener('visibilitychange', onVisible);
    void update();
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [filePreview]);

  return (
    <section id="today-roads" className="road-board" aria-labelledby="today-roads-title">
      <h2 id="today-roads-title">주변 도로 전광판</h2>
      <div className="road-heading-row">
        <p className="secondary">{origin.name} 출발 · 자동차</p>
        {!filePreview && <button className="road-vms-button" type="button" aria-haspopup="dialog"
          onClick={() => setVmsOpen(true)}>실제 전광판</button>}
      </div>
      <ul className="road-list" role="list">
        {destinations.map(destination => {
          const estimate = fixed?.routes.find(item => item.id === destination.id);
          const time = estimate ?? (filePreview ? roadTimes.estimates.find(item => item.id === destination.id) : undefined);
          const stale = estimate && (failed || estimate.updatedAt !== fixed?.checkedAt);
          return (
            <li key={destination.id}>
              <a href={kakaoDirections(destination)} target="_blank" rel="noopener noreferrer">
                <span className="road-place">
                  <strong>{destination.name}</strong>
                  {time && <small>{(time.meters / 1000).toFixed(1)}km</small>}
                </span>
                <span className="road-time">
                  <strong>{time ? minutes(time.seconds) : failed || fixed ? '조회 지연' : '조회 중'}</strong>
                  <span>{stale && '이전 값 · '}길찾기<span className="sr-only"> (새 탭)</span></span>
                </span>
              </a>
            </li>
          );
        })}
      </ul>
      <DestinationSearch />
      {vmsOpen && <VmsDialog onClose={() => setVmsOpen(false)} />}
    </section>
  );
}

export function RoadDataCredit() {
  return <small className="footer-credit">
    도로 데이터 © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>
    {' · '}<a href={`https://www.openstreetmap.org/#map=15/${origin.lat}/${origin.lon}`}>지도 수정</a>
  </small>;
}
