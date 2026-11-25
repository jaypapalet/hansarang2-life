import { Cloud, CloudFog, CloudLightning, CloudMoon, CloudRain, CloudSnow, CloudSun, Moon, Sun } from 'lucide-react';
import { useLiveData } from './live-data';
import complexPhoto from './media/hansarang-complex.webp';
import './weather.css';

type Hour = { time: string; temperature: number; code: number; isDay: boolean; probability: number | null };
type Day = { date: string; low: number | null; high: number | null; code: number; probability: number | null };
type WeatherData = {
  conditions: (Hour & { source: string; feelsLike?: number | null; hourly?: Hour[]; daily?: Day[] }) | null;
};

const seoul = 'Asia/Seoul';
const fullDate = new Intl.DateTimeFormat('ko-KR', { timeZone: seoul, month: 'long', day: 'numeric', weekday: 'long' });
const dailyDate = new Intl.DateTimeFormat('ko-KR', { timeZone: seoul, month: 'numeric', day: 'numeric', weekday: 'short' });
const hourTime = new Intl.DateTimeFormat('ko-KR', { timeZone: seoul, hour: 'numeric', hourCycle: 'h23' });
const dateKey = new Intl.DateTimeFormat('sv-SE', { timeZone: seoul, year: 'numeric', month: '2-digit', day: '2-digit' });

function outlook(code: number, isDay: boolean) {
  if (code === 0) return { Icon: isDay ? Sun : Moon, label: '맑음' };
  if (code === 1 || code === 2) return { Icon: isDay ? CloudSun : CloudMoon, label: code === 1 ? '구름 조금' : '구름 많음' };
  if (code === 3) return { Icon: Cloud, label: '흐림' };
  if (code === 45 || code === 48) return { Icon: CloudFog, label: '안개' };
  if (code === 66 || code === 67) return { Icon: CloudSnow, label: '진눈깨비' };
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { Icon: CloudSnow, label: '눈' };
  if (code >= 95) return { Icon: CloudLightning, label: '뇌우' };
  if (code >= 80 && code <= 82) return { Icon: CloudRain, label: '소나기' };
  if (code >= 51 && code <= 65) return { Icon: CloudRain, label: '비' };
  return { Icon: Cloud, label: '날씨 상태 미확인' };
}

function degrees(value: number) {
  return `${Math.round(value)}°`;
}

function HourForecast({ hour, today, tomorrow }: { hour: Hour; today: string; tomorrow: string }) {
  const { Icon, label } = outlook(hour.code, hour.isDay);
  const instant = new Date(hour.time);
  const day = dateKey.format(instant);
  const dateLabel = day === today ? '' : day === tomorrow ? '내일 ' : `${dailyDate.format(instant)} `;
  return <li>
    <time dateTime={hour.time}>{dateLabel}{hourTime.format(instant)}</time>
    <Icon size={20} aria-hidden="true" />
    <span className="sr-only">{label}</span>
    <strong>{degrees(hour.temperature)}</strong>
    {hour.probability != null && <span className="forecast-rain"><span className="sr-only">강수 확률 </span>{hour.probability}%</span>}
  </li>;
}

function DayForecast({ day, today }: { day: Day; today: string }) {
  const { Icon, label } = outlook(day.code, true);
  return <li>
    <time dateTime={day.date}>{day.date === today ? '오늘' : dailyDate.format(new Date(`${day.date}T12:00:00+09:00`))}</time>
    <span className="day-outlook"><Icon size={20} aria-hidden="true" />{label}</span>
    <span className="day-range"><span>최저 {day.low == null ? '—' : degrees(day.low)}</span><strong>최고 {day.high == null ? '—' : degrees(day.high)}</strong></span>
    {day.probability != null && <span className="forecast-rain"><span className="sr-only">강수 확률 </span>{day.probability}%</span>}
  </li>;
}

export function Weather() {
  const { data, failed } = useLiveData<WeatherData>('/api/weather', 300_000);
  const now = new Date();
  const today = dateKey.format(now);
  const tomorrow = dateKey.format(now.getTime() + 86_400_000);
  const current = failed ? null : data?.conditions;
  const hours = current?.hourly ?? [];
  const days = current?.daily ?? [];
  const todayForecast = days.find(day => day.date === today);
  const status = data || failed ? '날씨를 불러오지 못했습니다.' : '날씨를 불러오는 중입니다.';
  const forecastStatus = data || failed ? '표시할 예보가 없습니다.' : '예보를 불러오는 중입니다.';
  const { Icon, label } = current ? outlook(current.code, current.isDay) : { Icon: Cloud, label: '' };

  return <>
    <section className="weather" aria-labelledby="page-title">
      <div className="weather-content">
        <h1 id="page-title" tabIndex={-1}>오늘 날씨</h1>
        <p className="weather-place">등촌1동 · <time dateTime={today}>{fullDate.format(now)}</time></p>
        {current ? <>
          <div className="weather-current">
            <strong className="temperature" aria-label={`섭씨 ${Math.round(current.temperature)}도`}>{degrees(current.temperature)}</strong>
            <p className="weather-condition"><Icon size={25} aria-hidden="true" />{label}</p>
          </div>
          <dl className="weather-details">
            {todayForecast?.low != null && <div><dt>최저</dt><dd>{degrees(todayForecast.low)}</dd></div>}
            {todayForecast?.high != null && <div><dt>최고</dt><dd>{degrees(todayForecast.high)}</dd></div>}
            {current.probability != null && <div><dt>강수 확률</dt><dd>{current.probability}%</dd></div>}
            {current.feelsLike != null && <div><dt>체감</dt><dd>{degrees(current.feelsLike)}</dd></div>}
          </dl>
        </> : <p className="weather-current" role="status">{status}</p>}
      </div>
      <img className="weather-photo" src={complexPhoto} alt="한사랑2차삼성아파트 전경" width={1050} height={1397} fetchPriority="high" />
    </section>
    <div className="weather-forecasts">
      <section aria-labelledby="weather-hourly-title">
        <h2 id="weather-hourly-title">시간대별 예보</h2>
        {hours.length ? <ul className="hour-forecast" role="list" aria-label="시간대별 예보" tabIndex={0}>
          {hours.map(hour => <HourForecast key={hour.time} hour={hour} today={today} tomorrow={tomorrow} />)}
        </ul> : <p className="secondary">{forecastStatus}</p>}
      </section>
      <section aria-labelledby="weather-daily-title">
        <h2 id="weather-daily-title">일자별 예보</h2>
        {days.length ? <ul className="day-forecast" role="list">{days.map(day => <DayForecast key={day.date} day={day} today={today} />)}</ul>
          : <p className="secondary">{forecastStatus}</p>}
      </section>
      {current && <details className="source-details forecast-source">
        <summary>날씨 정보 출처</summary>
        <p>날씨 데이터 <a href={current.source === 'Open-Meteo' ? 'https://open-meteo.com/' : 'https://www.weather.go.kr/'}>{current.source}</a></p>
      </details>}
    </div>
  </>;
}
