import { facts } from './facts.mjs';

function travelList(label, rows) {
  return `<div><h3>${label}</h3><ul>${rows.map(row => `
    <li><span>${row.label}<small>${row.place}</small></span><strong>${row.minutes}분</strong></li>`).join('')}</ul></div>`;
}

export function createBulletin({photo}) {
  const { locality, date, time, weather, rail, bus } = facts;
  return {
    id: 'bulletin',
    title: '단지 게시판',
    description: '첫 화면에 날씨와 가까운 도착 시간을 보여주고, 단지 생활은 항목별로 열어봅니다.',
    html: `
      <header class="bulletin-mast bulletin-frame">
        <h1>한사랑2차 <span>생활정보</span></h1>
        <div><p>${locality}</p><p>${date} · ${time} 기준</p><strong>예시 데이터</strong></div>
      </header>
      <main class="bulletin-frame">
        <nav aria-label="단지 게시판 메뉴">
          <a href="#bulletin/weather">날씨</a><a href="#bulletin/transit">출퇴근 교통</a>
          <a href="#bulletin/roads">도로 상황</a><a href="#bulletin/charging">전기차 충전</a>
          <a href="#bulletin/office">관리사무소</a>
        </nav>
        <div class="bulletin-grid">
          <section id="bulletin-weather">
            <h2>등촌1동 날씨</h2>
            <div class="bulletin-weather">
              <p><strong>${weather.temperature}</strong> ${weather.condition}</p>
              <dl><div><dt>최고</dt><dd>${weather.high}</dd></div><div><dt>최저</dt><dd>${weather.low}</dd></div><div><dt>강수 확률</dt><dd>${weather.rain}</dd></div></dl>
            </div>
          </section>
          <section id="bulletin-travel">
            <h2>다음 도착</h2>
            <div class="bulletin-travel">${travelList('지하철', rail.slice(0, 1))}${travelList('버스', bus.slice(0, 1))}</div>
            <a class="bulletin-detail" href="#bulletin/transit">전체 도착 정보</a>
          </section>
        </div>
        <div class="bulletin-resident">
          <figure><img src="${photo}" width="1050" height="1397" alt="한사랑2차삼성아파트 입구와 아파트 동 전경"><figcaption>한사랑2차삼성아파트</figcaption></figure>
          <section><h2>단지 생활</h2><ul class="bulletin-links">
            <li><a href="#bulletin/charging">전기차 충전</a></li>
            <li><a href="#bulletin/office">관리사무소</a></li>
          </ul></section>
        </div>
      </main>`,
    css: `
      .bulletin { --paper:#fffaf1; --ink:#28241e; --muted:#665b50; --red:#903323; --rule:#d8c9b8; background:var(--paper); color:var(--ink); padding:2.5rem 0 3.5rem; }
      .bulletin .bulletin-frame { width:min(calc(100% - 4rem),72rem); margin-inline:auto; }
      .bulletin a { color:var(--red); text-underline-offset:.22em; }
      .bulletin .bulletin-mast { display:flex; justify-content:space-between; flex-wrap:wrap; align-items:end; gap:1rem 2rem; padding:.85rem 0 1.2rem; border-top:5px solid var(--red); }
      .bulletin h1 { font-family: "NanumMyeongjo", "AppleMyungjo", Batang, serif; font-size:3.8rem; letter-spacing:-.035em; line-height:1.1; font-weight:800; }
      .bulletin h1 span { white-space:nowrap; }
      .bulletin .bulletin-mast > div { font-size:.9375rem; color:var(--muted); text-align:end; }
      .bulletin .bulletin-mast strong { display:block; margin-top:.3rem; color:var(--red); font-size:.875rem; }
      .bulletin nav { display:flex; flex-wrap:wrap; gap:.1rem 1.45rem; border-block:1px solid var(--rule); }
      .bulletin nav a { display:flex; align-items:center; min-height:44px; font-size:.9375rem; font-weight:700; }
      .bulletin .bulletin-grid, .bulletin .bulletin-resident { display:grid; grid-template-columns:minmax(0,1fr) minmax(0,2.25fr); gap:2rem 3rem; margin-top:2rem; }
      .bulletin .bulletin-resident { border-top:1px solid var(--rule); padding-top:1.45rem; }
      .bulletin h2 { border-bottom:1px solid var(--red); padding-bottom:.5rem; font-size:1.52rem; letter-spacing:-.025em; line-height:1.25; }
      .bulletin h3 { margin:.7rem 0 .3rem; font-size:1.03rem; }
      .bulletin .bulletin-weather { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:.5rem 1.5rem; padding:.8rem 0 0; }
      .bulletin .bulletin-weather p strong { font-variant-numeric:tabular-nums; font-size:2.4rem; margin-right:.35rem; }
      .bulletin .bulletin-weather dl { display:flex; flex-wrap:wrap; gap:.35rem 1.25rem; }
      .bulletin .bulletin-weather dt, .bulletin small { display:block; font-size:.875rem; color:var(--muted); }
      .bulletin dd { font-weight:700; font-variant-numeric:tabular-nums; }
      .bulletin .bulletin-travel { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:1.3rem; }
      .bulletin .bulletin-travel ul { list-style:none; padding:0; }
      .bulletin .bulletin-travel li { display:flex; align-items:center; justify-content:space-between; gap:.5rem; border-bottom:1px solid var(--rule); min-height:3.6rem; padding:.55rem 0; }
      .bulletin .bulletin-travel strong { white-space:nowrap; color:var(--red); font-variant-numeric:tabular-nums; }
      .bulletin figure img { display:block; width:100%; height:auto; aspect-ratio:4/3; object-fit:cover; object-position:50% 38%; }
      .bulletin figcaption { font-size:.875rem; color:var(--muted); margin-top:.35rem; }
      .bulletin .bulletin-links { list-style:none; padding:0; }
      .bulletin .bulletin-links li { border-bottom:1px solid var(--rule); }
      .bulletin .bulletin-links a, .bulletin .bulletin-detail { display:inline-flex; align-items:center; min-height:44px; }
      @media (max-width:54rem) { .bulletin .bulletin-grid, .bulletin .bulletin-resident { column-gap:1.5rem; } .bulletin h1 { font-size:2.8rem; } }
      @media (max-width:43rem) {
        .bulletin { padding:1.4rem 0 2.5rem; }
        .bulletin .bulletin-frame { width:calc(100% - 2rem); }
        .bulletin .bulletin-mast > div { text-align:start; }
        .bulletin .bulletin-grid, .bulletin .bulletin-resident { grid-template-columns:minmax(0,1fr); }
        .bulletin .bulletin-travel { gap:.9rem; }
        .bulletin figure img { aspect-ratio:3/2; }
      }
      @media (max-width:27rem) { .bulletin .bulletin-travel { grid-template-columns:1fr; } .bulletin h1 { font-size:2.45rem; } }
    `,
  };
}
