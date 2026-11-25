import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { ArrowUpRight, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import './neighborhood.css';

type DateRange = { start: string; end: string };
type NeighborhoodEvent = {
  id: string;
  title: string;
  category: string;
  place: string;
  url: string;
  dates: string[];
  range: DateRange | null;
  reservation: { opensAt: string | null; closesAt: string | null; status: string | null; url: string | null } | null;
  servicePeriod: DateRange | null;
  time?: string;
  fee?: string;
};
type Notice = { id: string; kind: 'notice' | 'news'; title: string; publishedOn: string | null; url: string };
type Source = {
  id: string;
  name: string;
  url: string;
  state: 'fresh' | 'stale' | 'unavailable' | 'unconfigured' | 'limited';
  updatedAt: number | null;
};
type NeighborhoodData = { events: NeighborhoodEvent[]; notices: Notice[]; sources: Source[] };
type Section = 'events' | 'notices';

const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
const postsPerPage = 10;
const officialSources = [
  { section: 'events', id: 'district-culture', name: '강서구 문화시설', url: 'https://culture.gangseo.seoul.kr/gsfc/culture/calendar.do?menuNo=800038' },
  { section: 'events', id: 'lg-art', name: 'LG아트센터 서울', url: 'https://www.lgart.com/product/performance/year' },
  { section: 'events', id: 'gangseo-library', name: '강서구립도서관', url: 'https://lib.gangseo.seoul.kr/ApplyForParticipate' },
  { section: 'events', id: 'seoul-library', name: '서울시교육청 강서도서관', url: 'https://gslib.sen.go.kr/gslib/module/teach/index.do?menu_idx=15&searchCate1=16' },
  { section: 'events', id: 'culture', name: '서울시 문화행사', url: 'https://data.seoul.go.kr/dataList/OA-15486/S/1/datasetView.do' },
  { section: 'events', id: 'reservations', name: '서울시 공공서비스예약', url: 'https://yeyak.seoul.go.kr/' },
  { section: 'notices', id: 'notices', name: '강서구 공지', url: 'https://www.gangseo.seoul.kr/gs040101' },
  { section: 'notices', id: 'news', name: '강서까치뉴스', url: 'https://www.gangseo.seoul.kr/gs040404' },
] satisfies { section: Section; id: string; name: string; url: string }[];
const dateFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' });
const updatedFormatter = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const reservationFormatter = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function koreaToday() {
  const parts = dateFormatter.formatToParts(new Date());
  return ['year', 'month', 'day'].map(type => parts.find(part => part.type === type)?.value).join('-');
}

function asDate(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = asDate(value);
  return Number.isFinite(date.getTime()) && dateKey(date) === value;
}

function usableRange(range: DateRange | null | undefined) {
  return range && validDate(range.start) && validDate(range.end) && range.start <= range.end ? range : null;
}

function exactDates(event: NeighborhoodEvent) {
  return [...new Set((Array.isArray(event.dates) ? event.dates : []).filter(validDate))].sort();
}

function monthBounds(key: string) {
  const first = asDate(`${key.slice(0, 7)}-01`);
  const last = new Date(first);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  return { start: dateKey(first), end: dateKey(last) };
}

function overlaps(range: DateRange | null, bounds: DateRange) {
  return Boolean(range && range.start <= bounds.end && range.end >= bounds.start);
}

function shiftMonth(key: string, amount: number) {
  const date = asDate(key);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + amount);
  const last = new Date(date);
  last.setUTCMonth(last.getUTCMonth() + 1, 0);
  date.setUTCDate(Math.min(day, last.getUTCDate()));
  return dateKey(date);
}

function shortDate(key: string, includeYear = false) {
  const [year, month, day] = key.split('-').map(Number);
  return `${includeYear ? `${year}년 ` : ''}${month}월 ${day}일`;
}

function dayLabel(key: string) {
  return `${shortDate(key)} (${weekdays[asDate(key).getUTCDay()]})`;
}

function periodLabel(range: DateRange) {
  if (range.start === range.end) return shortDate(range.start, true);
  return `${shortDate(range.start, true)}–${shortDate(range.end, range.start.slice(0, 4) !== range.end.slice(0, 4))}`;
}

function dateSummary(event: NeighborhoodEvent, month: string) {
  const dates = exactDates(event).filter(date => date.startsWith(month));
  if (dates.length) return `${Number(month.slice(5))}월 ${dates.map(date => Number(date.slice(-2))).join('·')}일`;
  const range = usableRange(event.range);
  if (range) return periodLabel(range);
  return '일정 확인 필요';
}

function officialUrl(value: string | null | undefined) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : undefined;
  } catch {
    return undefined;
  }
}

function OfficialLink({ url, children, label }: { url: string | null | undefined; children: ReactNode; label?: string }) {
  const href = officialUrl(url);
  return href ? <a href={href} target="_blank" rel="noopener noreferrer" aria-label={label ? `${label} (새 탭)` : undefined}>
    {children}<ArrowUpRight size={14} aria-hidden="true" /><span className="sr-only"> (새 탭)</span>
  </a> : null;
}

function reservationStatus(reservation: NonNullable<NeighborhoodEvent['reservation']>) {
  const status = reservation.status?.trim() || '';
  const normalized = status.toLowerCase();
  const labels: Record<string, string> = {
    open: '예약 접수 중', available: '예약 접수 중', accepting: '예약 접수 중',
    closed: '예약 마감', ended: '예약 마감', full: '예약 마감', sold_out: '예약 마감', 'sold-out': '예약 마감',
    upcoming: '예약 시작 전', scheduled: '예약 시작 전', pending: '예약 시작 전',
    unknown: '예약 상태 확인 필요', unavailable: '예약 상태 확인 필요',
  };
  if (labels[normalized]) return labels[normalized];
  if (/[가-힣]/.test(status)) return status;
  return '예약 상태 확인 필요';
}

function reservationTime(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? reservationFormatter.format(date) : null;
}

function EventItem({ event, month, showDates = false, unconfirmed = false }: { event: NeighborhoodEvent; month: string; showDates?: boolean; unconfirmed?: boolean }) {
  const range = usableRange(event.range);
  const service = usableRange(event.servicePeriod);
  const reservation = event.reservation;
  const opens = reservation ? reservationTime(reservation.opensAt) : null;
  const closes = reservation ? reservationTime(reservation.closesAt) : null;
  const label = [showDates ? dateSummary(event, month) : null, event.category].filter(Boolean).join(' · ');
  return <li className="nb-event">
    {label && <p className="nb-event-label">{label}</p>}
    <h4>{event.title}</h4>
    {[event.time, event.place, event.fee].some(Boolean) && <p className="nb-meta">{[event.time, event.place, event.fee].filter(Boolean).join(' · ')}</p>}
    {!showDates && range && <p className="nb-meta">안내 기간 {periodLabel(range)}</p>}
    {unconfirmed && service && <p className="nb-meta">예약 페이지의 이용기간 {periodLabel(service)} · 실제 진행일은 공식 안내에서 확인해 주세요.</p>}
    {unconfirmed && !service && <p className="nb-meta">실제 진행일은 공식 안내에서 확인해 주세요.</p>}
    {reservation && <p className="nb-reservation">{reservationStatus(reservation)}</p>}
    {(opens || closes) && <p className="nb-meta">예약 접수 {opens && `${opens}부터`}{opens && closes ? ' ' : ''}{closes && `${closes}까지`}</p>}
    <div className="nb-event-links">
      <OfficialLink url={event.url} label={`${event.title} 공식 안내`}>공식 안내</OfficialLink>
      {reservation?.url !== event.url && <OfficialLink url={reservation?.url} label={`${event.title} 예약 안내`}>예약 안내</OfficialLink>}
    </div>
  </li>;
}

function SourceNotes({ sources, section, failed }: { sources: Source[]; section: Section; failed: boolean }) {
  const definitions = officialSources.filter(source => source.section === section);
  const states: Record<Source['state'], string> = {
    fresh: '', stale: '이전 정보 · 새 소식 확인 필요', unavailable: '현재 불러올 수 없음',
    unconfigured: '공식 사이트에서 확인', limited: section === 'events' ? '일부 일정만 확인됨' : '일부 게시물만 확인됨',
  };
  return <div className="nb-sources" aria-label="공식 출처와 확인 시각">
    <p className="nb-source-heading">공식 출처</p>
    <ul>
      {definitions.map(definition => {
        const source = sources.find(item => item.id === definition.id);
        const state = failed ? (source ? 'stale' : 'unavailable') : source?.state ?? 'unconfigured';
        const updated = source?.updatedAt;
        const hasUpdated = typeof updated === 'number' && Number.isFinite(updated);
        return <li key={definition.id}>
          <OfficialLink url={officialUrl(source?.url) ?? definition.url}>{source?.name || definition.name}</OfficialLink>
          {hasUpdated && <time dateTime={new Date(updated).toISOString()}>{updatedFormatter.format(updated)} 확인</time>}
          {states[state] && <span className="nb-source-state">{states[state]}</span>}
        </li>;
      })}
    </ul>
  </div>;
}

function useNeighborhoodData(section: Section) {
  const [data, setData] = useState<NeighborhoodData | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 40_000);
    setLoading(true);
    setFailed(false);
    async function load() {
      try {
        const response = await fetch(`/api/neighborhood?section=${section}`, { signal: controller.signal, cache: 'no-store' });
        if (!response.ok) throw new Error('neighborhood response failed');
        const result: unknown = await response.json();
        if (!result || typeof result !== 'object' || !('events' in result) || !('notices' in result) || !('sources' in result)
          || !Array.isArray(result.events) || !Array.isArray(result.notices) || !Array.isArray(result.sources)) {
          throw new Error('invalid neighborhood response');
        }
        if (mounted) setData(result as NeighborhoodData);
      } catch {
        if (mounted) setFailed(true);
      } finally {
        window.clearTimeout(timeout);
        if (mounted) setLoading(false);
      }
    }
    void load();
    return () => {
      mounted = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [retry, section]);

  return { data, loading, failed, refresh: () => setRetry(value => value + 1) };
}

function SectionHeading({ id, title, request }: {
  id: string; title: string; request: ReturnType<typeof useNeighborhoodData>;
}) {
  const { data, loading, failed, refresh } = request;
  return <>
    <div className="section-heading nb-heading">
      <h2 id={id}>{title}</h2>
      <button className="nb-refresh" type="button" onClick={refresh} disabled={loading}>
        <RefreshCw size={15} aria-hidden="true" />{loading ? '확인 중' : failed ? '다시 시도' : '새로 확인'}
      </button>
    </div>
    {loading && <p className="nb-load" role="status">{title}을 불러오는 중입니다.</p>}
    {failed && <p className="nb-load nb-error" role="alert">
      {data ? '새로 불러오지 못했습니다. 이전 정보를 표시합니다.' : '불러오지 못했습니다. 다시 시도하거나 아래 공식 출처를 확인해 주세요.'}
    </p>}
  </>;
}

export function Neighborhood() {
  const id = useId();
  const [view, setView] = useState<'calendar' | 'list'>('calendar');
  const [filter, setFilter] = useState<'all' | Notice['kind']>('all');
  const [search, setSearch] = useState('');
  const [postPage, setPostPage] = useState(1);
  const [today] = useState(koreaToday);
  const [selected, setSelected] = useState(today);
  const eventRequest = useNeighborhoodData('events');
  const noticeRequest = useNeighborhoodData('notices');
  const dayButtons = useRef(new Map<string, HTMLButtonElement>());
  const focusDate = useRef<string | null>(null);
  const postResults = useRef<HTMLDivElement>(null);
  const month = selected.slice(0, 7);
  const [year, monthNumber] = month.split('-').map(Number);
  const bounds = monthBounds(selected);

  useEffect(() => {
    if (focusDate.current) {
      dayButtons.current.get(focusDate.current)?.focus();
      focusDate.current = null;
    }
  }, [selected]);

  const events = eventRequest.data?.events ?? [];
  const monthEvents = useMemo(() => events.filter(event => {
    const dates = exactDates(event);
    const range = usableRange(event.range);
    if (dates.length || range) return dates.some(date => date.startsWith(month)) || overlaps(range, bounds);
    const service = usableRange(event.servicePeriod);
    return !service || overlaps(service, bounds);
  }).sort((a, b) => {
    const firstDate = (event: NeighborhoodEvent) => exactDates(event).find(date => date.startsWith(month)) ?? usableRange(event.range)?.start ?? usableRange(event.servicePeriod)?.start ?? '9999';
    return firstDate(a).localeCompare(firstDate(b)) || a.title.localeCompare(b.title, 'ko');
  }), [events, month]);
  const selectedEvents = monthEvents.filter(event => exactDates(event).includes(selected));
  const periodEvents = monthEvents.filter(event => usableRange(event.range) && !exactDates(event).some(date => date.startsWith(month)));
  const unconfirmedEvents = monthEvents.filter(event => !exactDates(event).length && !usableRange(event.range));
  const monthDatedEvents = monthEvents.filter(event => exactDates(event).length || usableRange(event.range));
  const visibleEvents = view === 'calendar' ? selectedEvents : monthDatedEvents;
  const counts = new Map<string, number>();
  monthEvents.forEach(event => exactDates(event).filter(date => date.startsWith(month)).forEach(date => counts.set(date, (counts.get(date) ?? 0) + 1)));
  const firstWeekday = asDate(bounds.start).getUTCDay();
  const dayCount = Number(bounds.end.slice(-2));
  const rows = Array.from({ length: Math.ceil((firstWeekday + dayCount) / 7) }, (_, week) => Array.from({ length: 7 }, (_, weekday) => {
    const day = week * 7 + weekday - firstWeekday + 1;
    return day > 0 && day <= dayCount ? `${month}-${String(day).padStart(2, '0')}` : null;
  }));
  const terms = search.normalize('NFKC').toLowerCase().split(/\s+/).filter(Boolean);
  const notices = (noticeRequest.data?.notices ?? []).filter(notice => {
    if (filter !== 'all' && notice.kind !== filter) return false;
    const title = notice.title.normalize('NFKC').toLowerCase().replace(/\s+/g, '');
    return terms.every(term => title.includes(term));
  }).sort((a, b) => (b.publishedOn ?? '').localeCompare(a.publishedOn ?? '') || a.title.localeCompare(b.title, 'ko'));
  const pageCount = Math.max(1, Math.ceil(notices.length / postsPerPage));
  const visiblePage = Math.min(postPage, pageCount);
  const pagePosts = notices.slice((visiblePage - 1) * postsPerPage, visiblePage * postsPerPage);

  useEffect(() => {
    setPostPage(page => Math.min(page, pageCount));
  }, [pageCount]);

  function changePostPage(page: number) {
    if (page === visiblePage) return;
    setPostPage(page);
    postResults.current?.focus({ preventScroll: true });
    postResults.current?.scrollIntoView({ block: 'start' });
  }

  function navigateDay(event: KeyboardEvent<HTMLButtonElement>, key: string) {
    const date = asDate(key);
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    let next: string;
    if (event.key in steps) {
      date.setUTCDate(date.getUTCDate() + steps[event.key]);
      next = dateKey(date);
    } else if (event.key === 'Home' || event.key === 'End') {
      date.setUTCDate(date.getUTCDate() + (event.key === 'Home' ? -date.getUTCDay() : 6 - date.getUTCDay()));
      next = dateKey(date);
    } else if (event.key === 'PageUp' || event.key === 'PageDown') {
      next = shiftMonth(key, (event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1));
    } else return;
    event.preventDefault();
    focusDate.current = next;
    setSelected(next);
  }

  return <div className="neighborhood">
    <section aria-labelledby={`${id}-events-title`}>
      <SectionHeading id={`${id}-events-title`} title="행사 일정" request={eventRequest} />
      <div className="nb-events-toolbar">
        <p className="nb-meta">강서구 공연·전시·도서관 프로그램</p>
        <div className="nb-view" role="group" aria-label="행사 보기 방식">
          <button type="button" aria-pressed={view === 'calendar'} aria-controls={`${id}-schedule`} onClick={() => setView('calendar')}>달력</button>
          <button type="button" aria-pressed={view === 'list'} aria-controls={`${id}-schedule`} onClick={() => setView('list')}>목록</button>
        </div>
      </div>
      <div className="nb-months">
        <button type="button" className="nb-month-button" aria-label="이전 달" onClick={() => setSelected(value => shiftMonth(value, -1))}><ChevronLeft size={20} aria-hidden="true" /></button>
        <h3 id={`${id}-month`}>{year}년 {monthNumber}월</h3>
        <button type="button" className="nb-month-button" aria-label="다음 달" onClick={() => setSelected(value => shiftMonth(value, 1))}><ChevronRight size={20} aria-hidden="true" /></button>
        <button type="button" className="nb-today" onClick={() => setSelected(koreaToday())}>오늘</button>
      </div>
      <div id={`${id}-schedule`} className={`nb-schedule ${view === 'calendar' ? 'nb-with-calendar' : ''}`}>
        <div className="nb-calendar-panel" hidden={view !== 'calendar'}>
          <table className="nb-calendar" aria-labelledby={`${id}-month`} aria-describedby={`${id}-calendar-note ${id}-keyboard`}>
            <thead><tr>{weekdays.map(day => <th scope="col" key={day} aria-label={`${day}요일`}>{day}</th>)}</tr></thead>
            <tbody>{rows.map((week, index) => <tr key={index}>{week.map((key, weekday) => <td key={key ?? `empty-${weekday}`}>
              {key && <button type="button" className="nb-day" ref={button => { if (button) dayButtons.current.set(key, button); else dayButtons.current.delete(key); }}
                tabIndex={selected === key ? 0 : -1} aria-pressed={selected === key} aria-current={today === key ? 'date' : undefined}
                aria-label={`${dayLabel(key)}${key === today ? ', 오늘' : ''}${counts.has(key) ? `, 확정 일정 ${counts.get(key)}건` : ''}`}
                onClick={() => setSelected(key)} onKeyDown={event => navigateDay(event, key)}>
                <span>{Number(key.slice(-2))}</span><span className="nb-day-marker">{counts.has(key) && <span className="nb-day-dot" aria-hidden="true" />}</span>
              </button>}
            </td>)}</tr>)}</tbody>
          </table>
          <p id={`${id}-calendar-note`} className="nb-calendar-note"><span className="nb-day-dot" aria-hidden="true" />날짜가 확정된 일정</p>
          <p id={`${id}-keyboard`} className="sr-only">방향키로 날짜를 이동하고 Page Up과 Page Down으로 달을 바꿀 수 있습니다.</p>
        </div>
        <section className="nb-agenda" aria-labelledby={`${id}-agenda`}>
          <h3 id={`${id}-agenda`}>{view === 'calendar' ? `${dayLabel(selected)} 일정` : `${monthNumber}월 일정`}</h3>
          {visibleEvents.length > 0 && <ul className="nb-event-list">{visibleEvents.map(event => <EventItem key={event.id} event={event} month={month} showDates={view === 'list'} />)}</ul>}
          {!visibleEvents.length && (!eventRequest.loading || eventRequest.data) && <p className="nb-empty">{eventRequest.failed && !eventRequest.data ? '공식 사이트에서 일정을 확인해 주세요.' : view === 'calendar' ? '이 날짜에 확인된 일정이 없습니다.' : '이 달에 확인된 일정이 없습니다.'}</p>}
          {view === 'calendar' && periodEvents.length > 0 && <div className="nb-extra-events">
            <h4>이달의 기간 행사·전시</h4>
            <p className="nb-meta">운영일과 관람 시간은 공식 안내를 확인해 주세요.</p>
            <ul className="nb-event-list">{periodEvents.map(event => <EventItem key={event.id} event={event} month={month} showDates />)}</ul>
          </div>}
          {unconfirmedEvents.length > 0 && <div className="nb-extra-events">
            <h4>일정 확인 필요</h4>
            <ul className="nb-event-list">{unconfirmedEvents.map(event => <EventItem key={event.id} event={event} month={month} unconfirmed />)}</ul>
          </div>}
        </section>
      </div>
      <p className="sr-only" role="status">{!eventRequest.loading ? `${year}년 ${monthNumber}월, ${view === 'calendar' ? `${dayLabel(selected)} 확정 일정 ${selectedEvents.length}건` : `일정 ${monthEvents.length}건`}` : ''}</p>
      {(!eventRequest.loading || eventRequest.data) && <SourceNotes sources={eventRequest.data?.sources ?? []} section="events" failed={eventRequest.failed} />}
    </section>

    <section className="nb-board" aria-labelledby={`${id}-board-title`}>
      <SectionHeading id={`${id}-board-title`} title="구청 소식" request={noticeRequest} />
      <div className="nb-board-toolbar">
        <div className="nb-post-filters" role="group" aria-label="게시물 종류">
          {(['all', 'notice', 'news'] as const).map(kind => <button type="button" key={kind} aria-pressed={filter === kind} aria-controls={`${id}-posts`} onClick={() => {
            setFilter(kind);
            setPostPage(1);
          }}>{kind === 'all' ? '전체' : kind === 'notice' ? '공지' : '까치뉴스'}</button>)}
        </div>
        <label className="nb-post-search">
          <span className="sr-only">게시물 제목 검색</span>
          <input type="search" value={search} placeholder="게시물 제목 검색" aria-controls={`${id}-posts`}
            onChange={event => {
              setSearch(event.currentTarget.value);
              setPostPage(1);
            }} />
        </label>
      </div>
      <div id={`${id}-posts`} className="nb-post-results" ref={postResults} role="region" aria-label="구청 소식 목록" tabIndex={-1}>
        {pagePosts.length > 0 && <ul className="nb-posts">{pagePosts.map(notice => <li className="nb-post" key={notice.id}>
          <span className="nb-post-kind">{notice.kind === 'notice' ? '공지' : '뉴스'}</span>
          <div className="nb-post-content">
            <OfficialLink url={notice.url} label={`${notice.title} 원문`}>{notice.title}</OfficialLink>
            <p className="nb-post-source">{notice.kind === 'notice' ? '강서구청 공식 공지' : '강서구청 · 강서까치뉴스'}</p>
          </div>
          {validDate(notice.publishedOn) ? <time dateTime={notice.publishedOn}>{notice.publishedOn.replaceAll('-', '.')}</time> : <span className="nb-post-date">게시일 확인 필요</span>}
        </li>)}</ul>}
        {!notices.length && (!noticeRequest.loading || noticeRequest.data) && <p className="nb-empty">
          {noticeRequest.failed && !noticeRequest.data ? '아래 공식 출처에서 최신 소식을 확인해 주세요.' : terms.length ? '검색어와 일치하는 게시물이 없습니다.' : '현재 표시할 게시물이 없습니다.'}
        </p>}
      </div>
      {pageCount > 1 && <nav className="nb-pagination" aria-label="구청 소식 페이지">
        <button type="button" aria-label="이전 페이지" aria-controls={`${id}-posts`} disabled={visiblePage === 1} onClick={() => changePostPage(visiblePage - 1)}>
          <ChevronLeft size={18} aria-hidden="true" />
        </button>
        {Array.from({ length: pageCount }, (_, index) => index + 1).map(page => <button type="button" key={page}
          aria-label={`${page}페이지`} aria-current={page === visiblePage ? 'page' : undefined} aria-controls={`${id}-posts`} onClick={() => changePostPage(page)}>{page}</button>)}
        <button type="button" aria-label="다음 페이지" aria-controls={`${id}-posts`} disabled={visiblePage === pageCount} onClick={() => changePostPage(visiblePage + 1)}>
          <ChevronRight size={18} aria-hidden="true" />
        </button>
      </nav>}
      <p className="sr-only" role="status">{!noticeRequest.loading ? `${terms.length ? '검색 결과' : '게시물'} ${notices.length}건${pageCount > 1 ? `, ${pageCount}페이지 중 ${visiblePage}페이지` : ''}` : ''}</p>
      {(!noticeRequest.loading || noticeRequest.data) && <SourceNotes sources={noticeRequest.data?.sources ?? []} section="notices" failed={noticeRequest.failed} />}
    </section>
  </div>;
}
