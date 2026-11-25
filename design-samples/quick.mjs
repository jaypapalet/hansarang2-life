import { facts } from './facts.mjs';

const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

const chevron = '<svg class="quick-chevron" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7 10 5 5 5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const phone = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m7.7 3.5 2 4.5-2.2 2.1a14.6 14.6 0 0 0 6.4 6.4l2.1-2.2 4.5 2v3.4a1.2 1.2 0 0 1-1.3 1.2A17.8 17.8 0 0 1 3.1 4.8a1.2 1.2 0 0 1 1.2-1.3h3.4Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export function createQuick({ photo: _photo } = {}) {
  const label = '<span class="quick-example">예시 데이터</span>';
  const departureList = (items) => `<dl class="quick-departures">${items.map((item) => `<div><dt>${escape(item.label)}<span class="quick-departure-place">${escape(item.place)}</span></dt><dd class="quick-departure-time">${item.minutes}<span>분 후</span></dd></div>`).join('')}</dl>`;
  const chargingAvailable = facts.charging.reduce((total, item) => total + Number.parseInt(item.value, 10), 0);

  return {
    id: 'quick',
    title: '빠른 조회',
    description: '원하는 항목을 펼쳐 도착 시간과 생활정보를 바로 확인합니다.',
    html: `
      <div class="quick-shell">
        <header class="quick-header" id="quick-top">
          <h1>빠른 조회</h1>
          <p class="quick-community">${facts.community}</p>
          <div class="quick-reading-time"><p>${facts.date} <strong>${facts.time}</strong></p>${label}</div>
        </header>

        <main class="quick-lookup" aria-label="생활정보 조회">

          <details class="quick-section quick-rail" name="quick-services" id="quick-rail">
            <summary>
              <span class="quick-summary-title"><strong>지하철</strong><span>증미역 · 9호선</span></span>
              <span class="quick-summary-reading"><span>중앙보훈병원 방면</span><strong>3<small>분 후</small></strong></span>
              ${chevron}
            </summary>
            <div class="quick-panel">
              <div class="quick-panel-heading"><h2>방면별 도착</h2>${label}</div>
              ${departureList(facts.rail)}
              <p class="quick-panel-note">${facts.time} 기준 · 열차 도착 시간은 바뀔 수 있어요.</p>
            </div>
          </details>

          <details class="quick-section" name="quick-services" id="quick-bus">
            <summary>
              <span class="quick-summary-title"><strong>버스</strong><span>아파트 후문 정류장</span></span>
              <span class="quick-summary-reading"><span>6715번</span><strong>2<small>분 후</small></strong></span>
              ${chevron}
            </summary>
            <div class="quick-panel">
              <div class="quick-panel-heading"><h2>노선별 도착</h2>${label}</div>
              ${departureList(facts.bus)}
              <p class="quick-panel-note">${facts.time} 기준 · 탑승할 정류장 위치를 확인하세요.</p>
            </div>
          </details>

          <details class="quick-section" name="quick-services" id="quick-weather">
            <summary>
              <span class="quick-summary-title"><strong>날씨</strong><span>서울 강서구 등촌1동</span></span>
              <span class="quick-summary-reading"><span>${facts.weather.condition}</span><strong>${facts.weather.temperature}</strong></span>
              ${chevron}
            </summary>
            <div class="quick-panel">
              <div class="quick-panel-heading"><h2>등촌1동 날씨</h2>${label}</div>
              <dl class="quick-weather-data">
                <div><dt>최고 기온</dt><dd>${facts.weather.high}</dd></div>
                <div><dt>최저 기온</dt><dd>${facts.weather.low}</dd></div>
                <div><dt>강수 확률</dt><dd>${facts.weather.rain}</dd></div>
              </dl>
              <p class="quick-panel-note">${facts.time} 기준</p>
            </div>
          </details>

          <details class="quick-section" name="quick-services" id="quick-roads">
            <summary>
              <span class="quick-summary-title"><strong>도로·전광판</strong><span>등촌역 앞 · 양천로 · 공항로</span></span>
              <span class="quick-summary-reading quick-summary-text"><span>양천로</span><strong class="quick-moderate">보통</strong></span>
              ${chevron}
            </summary>
            <div class="quick-panel">
              <div class="quick-panel-heading"><h2>주변 도로 소통</h2>${label}</div>
              <dl class="quick-road-data">${facts.roads.map((road) => `<div><dt>${escape(road.label)}</dt><dd class="${road.value === '보통' ? 'quick-moderate' : ''}">${escape(road.value)}</dd></div>`).join('')}</dl>
              <div class="quick-vms"><h3>도로전광판 안내</h3><p>전광판별 안내 문구는 이 예시에 포함하지 않았어요.</p></div>
              <p class="quick-panel-note">${facts.time} 기준</p>
            </div>
          </details>

          <details class="quick-section" name="quick-services" id="quick-charging">
            <summary>
              <span class="quick-summary-title"><strong>전기차 충전</strong><span>파워큐브 · 차지비</span></span>
              <span class="quick-summary-reading"><span>충전 가능</span><strong>${chargingAvailable}<small>대</small></strong></span>
              ${chevron}
            </summary>
            <div class="quick-panel">
              <div class="quick-panel-heading"><h2>단지 안 충전소</h2>${label}</div>
              <dl class="quick-charging-data">${facts.charging.map((station) => `<div><dt>${escape(station.label)}<span class="quick-departure-place">${escape(station.place)}</span></dt><dd class="quick-charging-count">${escape(station.value)}</dd></div>`).join('')}</dl>
              <p class="quick-panel-note">충전 가능한 기기 / 전체 기기 · ${facts.time} 기준</p>
            </div>
          </details>

          <details class="quick-section" name="quick-services" id="quick-office">
            <summary>
              <span class="quick-summary-title"><strong>관리사무소</strong><span>운영시간과 전화번호</span></span>
              <span class="quick-summary-reading quick-summary-text"><span>월–금</span><strong>09–18시</strong></span>
              ${chevron}
            </summary>
            <div class="quick-panel">
              <div class="quick-panel-heading"><h2>관리사무소 연락처</h2></div>
              <p class="quick-office-hours">${facts.office.hours}</p>
              <a class="quick-office-call" href="${facts.office.href}">${phone}<span>${facts.office.phone}<small>전화 걸기</small></span></a>
            </div>
          </details>
        </main>

        <footer class="quick-footer"><p>예시 데이터를 사용한 디자인 시안입니다.</p><p>입주민을 위한 비공식 생활정보 페이지</p><a href="#quick-top">맨 위로 ${chevron}</a></footer>
      </div>`,
    css: `
      .quick { --quick-ground: #191e24; --quick-surface: #242c35; --quick-open: #2d3742; --quick-ink: #f1f3f5; --quick-secondary: #bcc5cf; --quick-line: #46525f; --quick-blue: #b7d4eb; background: var(--quick-ground); color: var(--quick-ink); font-family: "Resident Sans Preview", "Apple SD Gothic Neo", "Noto Sans KR", sans-serif; line-height: 1.5; color-scheme: dark; }
      .quick ::selection { background: #b7d4eb; color: #182632; }
      .quick p, .quick h1, .quick h2, .quick h3, .quick dl, .quick dd { margin: 0; }
      .quick a { color: inherit; text-underline-offset: 5px; text-decoration-thickness: 1px; }
      .quick a:focus-visible, .quick summary:focus-visible { outline: 3px solid var(--quick-blue); outline-offset: -4px; }
      .quick .quick-shell { max-width: 760px; margin: 0 auto; padding: 58px 28px 32px; }
      .quick .quick-header { padding: 0 24px; }
      .quick h1 { font-size: clamp(42px, 5vw, 54px); line-height: 1.15; font-weight: 780; letter-spacing: -.04em; }
      .quick .quick-community { color: #d4dce3; font-size: 15px; margin-top: 13px; font-weight: 550; }
      .quick .quick-reading-time { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-top: 26px; padding: 17px 0; border-top: 1px solid var(--quick-line); }
      .quick .quick-reading-time p { color: var(--quick-secondary); font-size: 13px; }
      .quick .quick-reading-time strong { color: var(--quick-ink); font-size: 15px; margin-left: 8px; font-weight: 650; font-variant-numeric: tabular-nums; }
      .quick .quick-example { color: #c6ced5; font-size: .875rem; white-space: nowrap; }
      .quick .quick-section { background: var(--quick-surface); border-bottom: 1px solid var(--quick-line); }
      .quick .quick-section:first-of-type { border-top: 1px solid var(--quick-line); }
      .quick .quick-section summary { display: flex; align-items: center; gap: 22px; min-height: 114px; padding: 22px 24px; cursor: pointer; list-style: none; -webkit-tap-highlight-color: transparent; }
      .quick .quick-section summary::-webkit-details-marker { display: none; }
      .quick .quick-section summary::marker { content: ''; }
      .quick .quick-section summary:hover { background: #303b47; }
      .quick .quick-section[open] { background: var(--quick-open); }
      .quick .quick-section[open] summary { border-bottom: 1px solid var(--quick-line); }
      .quick .quick-summary-title { display: flex; flex-direction: column; gap: 7px; flex: 1 1 auto; min-width: 0; }
      .quick .quick-summary-title > strong { font-size: 23px; font-weight: 720; letter-spacing: -.03em; line-height: 1.25; }
      .quick .quick-summary-title > span { color: var(--quick-secondary); font-size: .875rem; line-height: 1.5; }
      .quick .quick-summary-reading { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; flex: 0 0 auto; }
      .quick .quick-summary-reading > span { font-size: .875rem; color: var(--quick-secondary); line-height: 1.5; }
      .quick .quick-summary-reading > strong { font-size: 38px; font-weight: 680; line-height: 1.12; letter-spacing: -.035em; font-variant-numeric: tabular-nums; }
      .quick .quick-summary-reading small { font-size: 14px; font-weight: 550; margin-left: 5px; letter-spacing: 0; }
      .quick .quick-summary-text > strong { font-size: 23px; line-height: 1.4; font-weight: 650; }
      .quick .quick-chevron { display: block; flex: 0 0 22px; width: 22px; height: 22px; color: #c1ccd5; }
      .quick .quick-section[open] summary .quick-chevron { transform: rotate(180deg); }
      .quick .quick-panel { padding: 25px 24px 23px; }
      .quick .quick-panel-heading { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 18px; }
      .quick .quick-panel-heading h2 { color: #dce4eb; font-size: 13px; font-weight: 650; }
      .quick .quick-panel-heading .quick-example { font-size: .875rem; color: var(--quick-secondary); }
      .quick .quick-departures > div, .quick .quick-charging-data > div { display: flex; justify-content: space-between; align-items: center; gap: 24px; padding: 17px 0; border-top: 1px solid #45515e; }
      .quick .quick-departures > div:first-child, .quick .quick-charging-data > div:first-child { border-top: 0; padding-top: 0; }
      .quick .quick-departures > div:last-child, .quick .quick-charging-data > div:last-child { padding-bottom: 0; }
      .quick .quick-departures dt, .quick .quick-charging-data dt { font-size: 17px; font-weight: 650; }
      .quick .quick-departure-place { display: block; margin-top: 4px; color: var(--quick-secondary); font-size: .875rem; font-weight: 400; }
      .quick .quick-departure-time { flex-shrink: 0; color: var(--quick-blue); font-size: 31px; font-weight: 700; line-height: 1.2; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }
      .quick .quick-departure-time span { font-size: .875rem; margin-left: 5px; font-weight: 500; letter-spacing: 0; }
      .quick .quick-panel-note { color: var(--quick-secondary); font-size: .875rem; margin-top: 23px; line-height: 1.65; }
      .quick .quick-weather-data { display: flex; gap: 28px; justify-content: space-between; padding: 7px 0 4px; }
      .quick .quick-weather-data div { display: flex; flex-direction: column; gap: 9px; }
      .quick .quick-weather-data dt { font-size: .875rem; color: var(--quick-secondary); }
      .quick .quick-weather-data dd { font-size: 30px; font-weight: 680; letter-spacing: -.03em; font-variant-numeric: tabular-nums; }
      .quick .quick-road-data div { display: flex; justify-content: space-between; align-items: center; gap: 20px; min-height: 46px; }
      .quick .quick-road-data dt { font-size: 16px; }
      .quick .quick-road-data dd { color: #c8dfcb; font-size: 14px; font-weight: 650; }
      .quick .quick-moderate, .quick .quick-road-data dd.quick-moderate { color: #efcea0; }
      .quick .quick-vms { border-top: 1px solid #45515e; margin-top: 15px; padding-top: 18px; }
      .quick .quick-vms h3 { font-size: .875rem; font-weight: 650; margin-bottom: 6px; }
      .quick .quick-vms p { color: var(--quick-secondary); font-size: .875rem; line-height: 1.7; max-width: 45ch; }
      .quick .quick-charging-count { white-space: nowrap; font-size: 23px; font-weight: 650; color: var(--quick-blue); font-variant-numeric: tabular-nums; letter-spacing: -.02em; }
      .quick .quick-office-hours { font-size: 14px; color: var(--quick-secondary); margin-bottom: 20px; }
      .quick .quick-office-call { display: flex; align-items: center; gap: 17px; width: 100%; min-height: 78px; padding: 15px 20px; background: #c1d7e7; color: #182a38; text-decoration: none; }
      .quick .quick-office-call:hover { background: #d5e5f1; }
      .quick .quick-office-call:focus-visible { outline-color: #f5f8fa; outline-offset: 4px; }
      .quick .quick-office-call > svg { flex: 0 0 24px; width: 24px; height: 24px; }
      .quick .quick-office-call > span { display: flex; flex-direction: column; font-size: 23px; line-height: 1.3; font-weight: 750; letter-spacing: -.025em; font-variant-numeric: tabular-nums; }
      .quick .quick-office-call small { font-size: .875rem; font-weight: 600; letter-spacing: 0; margin-top: 3px; }
      .quick .quick-footer { padding: 30px 24px 0; color: var(--quick-secondary); font-size: .875rem; line-height: 1.8; }
      .quick .quick-footer a { min-height: 44px; display: inline-flex; align-items: center; gap: 8px; text-decoration: none; margin-top: 12px; font-weight: 650; }
      .quick .quick-footer a:hover { text-decoration: underline; }
      .quick .quick-footer .quick-chevron { width: 17px; height: 17px; flex-basis: 17px; transform: rotate(180deg); }
      @media (min-width: 1000px) {
        .quick .quick-shell { padding-top: 72px; padding-bottom: 48px; }
        .quick .quick-header { padding-top: 4px; }
      }
      @media (max-width: 600px) {
        .quick .quick-shell { padding: 34px 16px 26px; }
        .quick .quick-header { padding: 0 8px; }
        .quick h1 { font-size: 42px; }
        .quick .quick-community { font-size: 13px; margin-top: 11px; }
        .quick .quick-reading-time { margin-top: 24px; padding: 15px 0; gap: 10px; }
        .quick .quick-reading-time p { font-size: .875rem; }
        .quick .quick-reading-time strong { font-size: 13px; margin-left: 5px; }
        .quick .quick-example { font-size: .875rem; }
        .quick .quick-section summary { padding: 21px 18px; min-height: 108px; gap: 14px; }
        .quick .quick-summary-title > strong { font-size: 20px; }
        .quick .quick-summary-title > span { font-size: .875rem; }
        .quick .quick-summary-reading > span { font-size: .875rem; }
        .quick .quick-summary-reading > strong { font-size: 34px; }
        .quick .quick-summary-reading small { font-size: .875rem; }
        .quick .quick-summary-text > strong { font-size: 20px; }
        .quick .quick-chevron { width: 18px; height: 18px; flex-basis: 18px; }
        .quick .quick-panel { padding: 23px 18px; }
        .quick .quick-departures > div, .quick .quick-charging-data > div { gap: 18px; }
        .quick .quick-departures dt, .quick .quick-charging-data dt { font-size: 15px; }
        .quick .quick-departure-place { font-size: .875rem; }
        .quick .quick-departure-time { font-size: 28px; }
        .quick .quick-weather-data { gap: 18px; }
        .quick .quick-weather-data dt { font-size: .875rem; }
        .quick .quick-weather-data dd { font-size: 28px; }
        .quick .quick-charging-count { font-size: 20px; }
        .quick .quick-office-call { padding: 15px 16px; gap: 14px; }
        .quick .quick-office-call > span { font-size: 23px; }
        .quick .quick-footer { padding: 25px 8px 0; font-size: .875rem; }
      }
      @media (max-width: 360px) {
        .quick .quick-shell { padding-left: 12px; padding-right: 12px; }
        .quick .quick-section summary { padding-left: 14px; padding-right: 14px; gap: 10px; }
        .quick .quick-summary-title > strong { font-size: 18px; }
        .quick .quick-summary-title > span { max-width: 130px; }
        .quick .quick-summary-reading > span { max-width: 96px; text-align: right; }
        .quick .quick-summary-reading > strong { font-size: 32px; }
        .quick .quick-summary-text > strong { font-size: 18px; }
        .quick .quick-panel { padding-left: 16px; padding-right: 16px; }
        .quick .quick-departures dt { max-width: 160px; }
        .quick .quick-office-call { gap: 12px; padding-left: 14px; padding-right: 14px; }
        .quick .quick-office-call > span { font-size: 21px; }
      }
    `,
  };
}
