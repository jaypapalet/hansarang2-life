import { seoulTime, useLiveData } from './live-data';

type Direction = 'up' | 'down';
type Train = {
  station: string; direction: Direction; destination: string; train: string;
  express: boolean; due: number | null; observed: number; message: string;
};
type SubwayData = { arrivals: Train[]; failedStations: string[]; fetchedAt: number };
const stations = ['증미', '등촌'];
const directions = [
  { id: 'up', name: '중앙보훈병원' },
  { id: 'down', name: '개화' },
] as const;

function arrivalLabel(train: Train, now: number) {
  if (train.due == null) return train.message || '시간 미제공';
  const seconds = (train.due - now) / 1000;
  return seconds < 60 ? '곧 도착' : `${Math.ceil(seconds / 60)}분`;
}

function arrivalPriority(train: Train, now: number) {
  if (train.due != null) return train.due;
  return /^(도착|진입|곧 도착)/.test(train.message) ? now : Infinity;
}

function nextTrains(rows: Train[], now: number) {
  const sorted = [...rows].sort((a, b) => arrivalPriority(a, now) - arrivalPriority(b, now));
  const trainIds = new Set<string>();
  return sorted.filter(row => {
    if (!row.train) return true;
    if (trainIds.has(row.train)) return false;
    trainIds.add(row.train);
    return true;
  }).slice(0, 2);
}

export function SubwayArrivals() {
  const { data, failed } = useLiveData<SubwayData>('/api/subway?section=arrivals', 20_000);
  const now = Date.now();
  const arrivals = failed ? [] : (data?.arrivals ?? []).filter(row => !row.express && now - row.observed <= 180_000
    && row.observed - now <= 30_000 && (row.due == null || row.due >= now - 15_000));
  const checkedAt = data && Number.isFinite(data.fetchedAt) ? new Date(data.fetchedAt) : null;
  const allUnavailable = data && stations.every(station => data.failedStations.includes(station));

  return <section className="subway" aria-labelledby="subway-title">
    <div className="section-heading">
      <h2 id="subway-title">지하철 도착 정보</h2>
      {checkedAt && <p className="secondary">
        {failed ? '이전 조회' : allUnavailable ? '마지막 시도' : '조회'} <time dateTime={checkedAt.toISOString()}>{seoulTime.format(checkedAt)}</time>
      </p>}
    </div>
    <div className="stations">
      {stations.map(station => <section key={station} className="station" aria-label={`${station}역`}>
        <h3>{station}역</h3>
        <ul className="arrivals" role="list">
          {directions.map(direction => {
            const [first, next] = nextTrains(arrivals.filter(row => row.station === station && row.direction === direction.id), now);
            const firstLabel = first ? arrivalLabel(first, now) : null;
            const loading = !data && !failed;
            const unavailable = failed || data?.failedStations.includes(station);
            return <li key={direction.id}>
              <span className="arrival-name">{first?.destination || direction.name} 방면</span>
              <span className="arrival-times">
                {firstLabel ? <strong className={firstLabel.endsWith('분') ? undefined : 'arrival-message'}>{firstLabel}</strong>
                  : <small>{loading ? '조회 중' : unavailable ? '조회 지연' : '도착 정보 없음'}</small>}
                {next && <small>다음<span className="sr-only"> 열차</span> {arrivalLabel(next, now)}</small>}
              </span>
            </li>;
          })}
        </ul>
      </section>)}
    </div>
  </section>;
}
