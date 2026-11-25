import { facts } from './facts.mjs';

const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

export function createGuide({ photo } = {}) {
  const topics = [
    ['weather', '날씨', '기온과 강수 확률'],
    ['rail', '지하철', '증미역 9호선'],
    ['bus', '버스', '아파트 후문 정류장'],
    ['roads', '도로·전광판', '주변 도로 소통'],
    ['charging', '전기차 충전', '단지 안 충전소'],
    ['office', '관리사무소', '운영시간과 전화번호'],
  ];
  const dataLabel = '<span class="guide-example">예시 데이터</span>';

  return {
    id: 'guide',
    title: '동네 안내서',
    description: '단지 전경을 표지에 두고, 목차에서 원하는 생활정보를 엽니다.',
    html: `
      <div class="guide-shell">
        <header class="guide-masthead">
          <a class="guide-brand" href="#guide-home">한사랑2차<span>삼성아파트 생활정보</span></a>
          <a class="guide-contents-link" href="#guide-directory">목차 보기</a>
        </header>

        <main id="guide-home">
          <div class="guide-cover">
            <div class="guide-cover-type">
              <h1>동네<br>안내서</h1>
              <div class="guide-cover-weather">
                <div class="guide-cover-weather-heading"><p>오늘의 등촌1동</p>${dataLabel}</div>
                <div class="guide-cover-weather-reading"><strong>${facts.weather.temperature}</strong><div><span>${facts.weather.condition}</span><small><span>최고 ${facts.weather.high}</span><span>최저 ${facts.weather.low}</span></small></div></div>
                <p class="guide-date">${facts.date} · ${facts.time} 기준</p>
              </div>
            </div>
            <figure class="guide-photo">
              <img src="${escape(photo ?? '')}" alt="한사랑2차삼성아파트 단지 전경" width="1200" height="900" fetchpriority="high">
              <figcaption><span>${facts.community}</span><span>${facts.locality}</span></figcaption>
            </figure>
          </div>

          <div class="guide-directory" id="guide-directory">
            <aside class="guide-index">
              <nav aria-labelledby="guide-index-title">
                <h2 id="guide-index-title">찾아보기</h2>
                ${topics.map(([id, title, detail]) => `<a href="#guide/${id}"><span><strong>${title}</strong><small>${detail}</small></span></a>`).join('')}
              </nav>
            </aside>

          </div>
        </main>

        <footer class="guide-footer"><p>한사랑2차 생활정보</p><p>입주민을 위한 비공식 생활정보 페이지 · 디자인 시안</p></footer>
      </div>`,
    css: `
      .guide { --guide-paper: #f2f0e5; --guide-ink: #243c2f; --guide-secondary: #53604b; --guide-line: #c4c7b3; --guide-forest: #243e30; background: var(--guide-paper); color: var(--guide-ink); font-family: "Resident Sans Preview", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif; line-height: 1.5; }
      .guide ::selection { background: #d6dba7; color: #1a3023; }
      .guide a { color: inherit; text-decoration-thickness: 1px; text-underline-offset: 5px; }
      .guide a:focus-visible { outline: 3px solid #77863a; outline-offset: 5px; }
      .guide a:hover { text-decoration: underline; }
      .guide p, .guide h1, .guide h2, .guide h3, .guide figure, .guide dl, .guide dd { margin: 0; }
      .guide .guide-shell { max-width: 1280px; padding: 0 48px; margin: 0 auto; }
      .guide .guide-masthead { min-height: 104px; display: flex; align-items: center; justify-content: space-between; gap: 20px; border-bottom: 1px solid var(--guide-ink); }
      .guide .guide-brand { min-height: 44px; display: flex; flex-direction: column; justify-content: center; font-size: 21px; font-weight: 800; letter-spacing: -.03em; text-decoration: none; }
      .guide .guide-brand span { font-size: .875rem; font-weight: 550; letter-spacing: 0; margin-top: 2px; }
      .guide .guide-contents-link { display: inline-flex; align-items: center; min-height: 44px; font-size: 14px; text-decoration: none; font-weight: 700; }
      .guide .guide-cover { display: grid; grid-template-columns: .8fr 1.5fr; gap: 56px; padding: 44px 0 58px; align-items: stretch; }
      .guide .guide-cover-type { display: flex; flex-direction: column; justify-content: space-between; gap: 38px; }
      .guide .guide-cover-type h1 { font-size: clamp(64px, 6.7vw, 92px); font-weight: 780; letter-spacing: -.04em; line-height: 1.06; text-wrap: balance; }
      .guide .guide-cover-weather { padding-top: 20px; border-top: 1px solid var(--guide-line); }
      .guide .guide-cover-weather-heading { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
      .guide .guide-cover-weather-heading p { font-size: 14px; font-weight: 700; }
      .guide .guide-example { display: inline-block; color: #576447; font-size: .875rem; font-weight: 650; white-space: nowrap; }
      .guide .guide-cover-weather-reading { display: flex; align-items: center; gap: 18px; margin: 8px 0 6px; }
      .guide .guide-cover-weather-reading > strong { font-size: 56px; font-weight: 650; line-height: 1.15; letter-spacing: -.04em; font-variant-numeric: tabular-nums; }
      .guide .guide-cover-weather-reading div { display: flex; flex-direction: column; gap: 3px; }
      .guide .guide-cover-weather-reading div > span { font-size: 16px; font-weight: 600; }
      .guide .guide-cover-weather-reading small { display: flex; flex-wrap: wrap; column-gap: .5rem; font-size: .875rem; color: var(--guide-secondary); }
      .guide .guide-cover-weather-reading small span { white-space: nowrap; }
      .guide .guide-date { font-size: .875rem; color: var(--guide-secondary); }
      .guide .guide-photo { display: flex; flex-direction: column; min-width: 0; }
      .guide .guide-photo img { display: block; width: 100%; height: 100%; min-height: 360px; max-height: 480px; object-fit: cover; object-position: center 44%; background: #d1d2be; }
      .guide .guide-photo figcaption { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 4px 20px; font-size: .875rem; padding-top: 12px; color: var(--guide-secondary); }
      .guide .guide-directory { padding: 32px 0 52px; border-top: 1px solid var(--guide-ink); scroll-margin-top: 24px; }
      .guide .guide-index { background: var(--guide-forest); color: #f1f1df; padding: 28px 24px 24px; }
      .guide .guide-index nav { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:0 24px; }
      .guide .guide-index h2 { grid-column: 1 / -1; font-size: 25px; letter-spacing: -.03em; line-height: 1.2; padding-bottom: 26px; }
      .guide .guide-index nav a { display: flex; align-items: center; min-height: 78px; padding: 10px 0; border-top: 1px solid #5d6d55; text-decoration: none; }
      .guide .guide-index nav a:hover { color: #e0e8a5; }
      .guide .guide-index nav a:focus-visible { outline-color: #d2df9d; }
      .guide .guide-index nav a span { display: flex; flex-direction: column; gap: 4px; }
      .guide .guide-index nav strong { font-size: 16px; font-weight: 650; }
      .guide .guide-index nav small { font-size: .875rem; color: #c2ccb6; }
      .guide .guide-footer { display: flex; justify-content: space-between; gap: 16px; padding: 26px 0 32px; border-top: 1px solid var(--guide-ink); color: var(--guide-secondary); font-size: .875rem; }
      .guide .guide-footer p:first-child { font-weight: 750; color: var(--guide-ink); }
      @media (max-width: 1000px) {
        .guide .guide-shell { padding: 0 32px; }
        .guide .guide-cover { column-gap: 32px; grid-template-columns: .85fr 1.3fr; }
        .guide .guide-photo img { min-height: 350px; }
        .guide .guide-index { padding: 26px 20px; }
      }
      @media (max-width: 700px) {
        .guide .guide-shell { padding: 0 20px; }
        .guide .guide-masthead { min-height: 88px; gap: 14px; }
        .guide .guide-brand { font-size: 19px; }
        .guide .guide-brand span { font-size: .875rem; }
        .guide .guide-contents-link { font-size: .875rem; }
        .guide .guide-cover { grid-template-columns: 1fr; gap: 30px; padding: 32px 0 36px; }
        .guide .guide-cover-type { flex-direction: row; align-items: flex-end; gap: 26px; }
        .guide .guide-cover-type h1 { font-size: clamp(46px, 10vw, 66px); flex-shrink: 0; }
        .guide .guide-cover-weather { flex: 1; padding-top: 14px; }
        .guide .guide-cover-weather-heading { align-items: flex-start; flex-direction: column; gap: 1px; }
        .guide .guide-cover-weather-reading { gap: 10px; margin: 7px 0; }
        .guide .guide-cover-weather-reading > strong { font-size: 42px; }
        .guide .guide-cover-weather-reading div > span { font-size: 13px; }
        .guide .guide-cover-weather-reading small { font-size: .875rem; }
        .guide .guide-date { font-size: .875rem; }
        .guide .guide-photo img { height: auto; min-height: 0; max-height: none; aspect-ratio: 4 / 3; object-position: center; }
        .guide .guide-photo figcaption { font-size: .875rem; padding-top: 10px; }
        .guide .guide-directory { padding: 28px 0 36px; }
        .guide .guide-index nav { grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 14px; }
        .guide .guide-index { position: static; padding: 24px; }
        .guide .guide-index h2 { padding-bottom: 20px; font-size: 23px; }
        .guide .guide-index nav a { min-height: 68px; }
        .guide .guide-footer { flex-direction: column; gap: 7px; padding: 24px 0; font-size: .875rem; }
      }
      @media (max-width: 380px) {
        .guide .guide-shell { padding: 0 16px; }
        .guide .guide-cover-type { gap: 19px; }
        .guide .guide-cover-type h1 { font-size: 45px; }
        .guide .guide-cover-weather-heading p { font-size: .875rem; }
        .guide .guide-cover-weather-reading { gap: 7px; }
        .guide .guide-cover-weather-reading > strong { font-size: 36px; }
        .guide .guide-cover-weather-reading div > span { font-size: .875rem; }
        .guide .guide-cover-weather-reading small { font-size: .875rem; }
        .guide .guide-date { max-width: 140px; line-height: 1.6; }
        .guide .guide-index { padding: 22px 20px; }
      }
    `,
  };
}
