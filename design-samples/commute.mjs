import { facts } from './facts.mjs';

export function createCommute() {
  const { community, locality, weather, time, rail, bus } = facts;
  const departures = [
    ...rail.map(row => ({...row, mode:'지하철'})),
    ...bus.map(row => ({...row, mode:'버스'})),
  ].sort((a,b)=>a.minutes-b.minutes);
  return {
    id: 'commute',
    title: '출근 시간표',
    description: '지하철과 버스를 한 시간표에 모아 먼저 오는 순서대로 보여줘요.',
    html: `
      <div class="commute-shell">
        <aside class="commute-rail">
          <p class="commute-name">${community}</p>
          <p class="commute-address">${locality}</p>
          <nav aria-label="시간표 메뉴">
            <a href="#commute">출퇴근 교통</a><a href="#commute/weather">날씨</a>
            <a href="#commute/roads">도로 상황</a><a href="#commute/charging">전기차 충전</a>
            <a href="#commute/office">관리사무소</a>
          </nav>
        </aside>
        <main class="commute-main">
          <div class="commute-head"><h1>출퇴근 교통</h1><p>예시 데이터 · ${time} 기준</p></div>
          <section id="commute-weather" class="commute-weather" aria-label="등촌1동 날씨"><strong>등촌1동 날씨</strong><span>${weather.temperature} · ${weather.condition}</span><span>최고 ${weather.high} / 최저 ${weather.low}</span><span>강수 확률 ${weather.rain}</span></section>
          <section id="commute-departures">
            <h2>다음 도착</h2>
            <table>
              <thead><tr><th scope="col">수단</th><th scope="col">행선지·정류장</th><th scope="col">남은 시간</th></tr></thead>
              <tbody>${departures.map(({mode,label,place,minutes})=>`<tr><th scope="row">${mode}</th><td><strong>${label}</strong><small>${place}</small></td><td class="commute-minute">${minutes}<span>분</span></td></tr>`).join('')}</tbody>
            </table>
          </section>
        </main>
      </div>`,
    css: `
      .commute { --ink:#11283b; --muted:#465c6e; --accent:#145788; --rule:#cfdee8; --rail:#103451; color:var(--ink); background:#f4f9fc; }
      .commute .commute-shell { display:grid; grid-template-columns:minmax(12.75rem,1fr) minmax(0,4.2fr); max-width:90rem; margin-inline:auto; }
      .commute .commute-rail { background:var(--rail); color:#fff; padding:1.9rem 1.55rem; }
      .commute .commute-name { font-size:1.25rem; line-height:1.25; font-weight:800; letter-spacing:-.02em; }
      .commute .commute-address { margin-top:.5rem; color:#d5e7f4; font-size:.875rem; }
      .commute nav { display:grid; gap:.2rem; margin-top:2rem; }
      .commute nav a { display:flex; align-items:center; min-height:44px; color:#fff; text-underline-offset:.3em; }
      .commute nav a:hover, .commute nav a:focus-visible { background:#1c4b6f; }
      .commute nav a:focus-visible { outline-color:white; }
      .commute .commute-main { padding:2rem 3rem 3rem; min-width:0; }
      .commute .commute-head { display:flex; justify-content:space-between; gap:.5rem 1rem; flex-wrap:wrap; align-items:baseline; margin-bottom:1rem; }
      .commute h1 { font-size:3rem; line-height:1.12; letter-spacing:-.035em; }
      .commute .commute-head p { color:var(--muted); font-size:.875rem; }
      .commute .commute-weather { display:flex; flex-wrap:wrap; align-items:baseline; gap:.3rem .9rem; padding:.85rem 1rem; background:#e3f0f7; color:var(--muted); margin-bottom:1.65rem; }
      .commute .commute-weather strong { color:var(--ink); }
      .commute h2 { font-size:1.35rem; letter-spacing:-.02em; line-height:1.25; margin-bottom:.5rem; }
      .commute table { width:100%; border-collapse:collapse; font-variant-numeric:tabular-nums; table-layout:fixed; }
      .commute th, .commute td { text-align:left; border-bottom:1px solid var(--rule); padding:.65rem .55rem; overflow-wrap:anywhere; }
      .commute thead th { background:var(--rail); color:#fff; font-size:.875rem; font-weight:700; }
      .commute thead th:first-child { width:6rem; }
      .commute thead th:last-child { width:6rem; }
      .commute tr > :last-child { text-align:end; }
      .commute tbody th { font-size:.9375rem; }
      .commute td strong { display:block; }
      .commute small { display:block; color:var(--muted); font-size:.875rem; }
      .commute .commute-minute { color:var(--accent); font-weight:800; font-size:1.9rem; white-space:nowrap; }
      .commute .commute-minute span { font-size:.9375rem; margin-left:.08rem; }
      @media (max-width:60rem) { .commute .commute-main { padding-inline:1.5rem; } }
      @media (max-width:43rem) {
        .commute .commute-shell { grid-template-columns:minmax(0,1fr); }
        .commute .commute-rail { padding:.9rem 1rem .5rem; }
        .commute nav { display:flex; flex-wrap:wrap; gap:0 .9rem; margin-top:.35rem; }
        .commute .commute-main { padding:1.25rem 1rem 2rem; }
        .commute h1 { font-size:2.05rem; }
        .commute .commute-weather { gap:.2rem .6rem; font-size:.9375rem; }
        .commute thead th:first-child { width:4.1rem; }
        .commute thead th:last-child { width:4.75rem; }
        .commute .commute-minute { font-size:1.5rem; }
      }
    `,
  };
}
