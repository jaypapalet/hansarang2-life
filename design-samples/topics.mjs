import { facts } from './facts.mjs';

function rows(entries) {
  return `<dl class="topic-rows">${entries.map(({label, place, value}) => `<div>
    <dt>${label}${place ? `<small>${place}</small>` : ''}</dt><dd>${value}</dd>
  </div>`).join('')}</dl>`;
}

function arrivals(entries) {
  return rows(entries.map(({label, place, minutes}) => ({label, place, value: minutes + '분'})));
}

export const topicDetails = {
  weather: {
    title: '등촌1동 날씨',
    detail: rows([
      {label:'현재', value:`${facts.weather.temperature} · ${facts.weather.condition}`},
      {label:'최고 기온', value:facts.weather.high},
      {label:'최저 기온', value:facts.weather.low},
      {label:'강수 확률', value:facts.weather.rain},
    ]),
  },
  transit: {
    title:'출퇴근 교통',
    detail:`<div class="topic-columns"><section><h2>지하철</h2>${arrivals(facts.rail)}</section><section><h2>버스</h2>${arrivals(facts.bus)}</section></div>`,
  },
  rail: { title:'지하철', detail:arrivals(facts.rail) },
  bus: { title:'버스', detail:arrivals(facts.bus) },
  roads: { title:'도로·전광판', detail:rows(facts.roads) },
  charging: { title:'전기차 충전', detail:rows(facts.charging.map(item => ({...item, value:item.value + ' 가능'}))) },
  office: {
    title:'관리사무소',
    detail:rows([
      {label:'업무시간', value:facts.office.hours},
      {label:'전화번호', value:`<a href="${facts.office.href}">${facts.office.phone}</a>`},
    ]),
  },
};

export function topicTemplates() {
  return Object.entries(topicDetails).map(([id,{title,detail}]) => `
    <template id="topic-${id}">
      <main class="topic-page">
        <a class="topic-home" data-topic-home href="#">홈으로</a>
        <header class="topic-heading">
          <h1 tabindex="-1">${title}</h1>
          <p>예시 데이터 · ${facts.time} 기준</p>
        </header>
        ${detail}
      </main>
    </template>
  `).join('\n');
}

export const topicCss = `
  .topic-page { width:min(100% - 2rem,60rem); margin:auto; padding-block:1.5rem 3rem; }
  .topic-home { display:inline-flex; align-items:center; min-height:44px; margin-bottom:1rem; }
  .topic-heading { display:flex; flex-wrap:wrap; align-items:baseline; justify-content:space-between; gap:.5rem 1rem; padding-bottom:.85rem; border-bottom:2px solid currentColor; margin-bottom:1rem; }
  .topic-heading h1 { font-size:2.35rem; line-height:1.2; letter-spacing:-.03em; }
  .topic-heading p { font-size:.875rem; }
  .topic-columns { display:grid; grid-template-columns:1fr 1fr; gap:1.25rem 2rem; }
  .topic-columns h2 { font-size:1.2rem; margin-bottom:.5rem; }
  .topic-rows > div { display:flex; align-items:baseline; justify-content:space-between; gap:.35rem 1rem; padding:.8rem 0; border-bottom:1px solid var(--topic-rule,#d8ddd8); }
  .topic-rows dt { min-width:0; font-weight:650; }
  .topic-rows dt small { display:block; font-size:.875rem; font-weight:400; }
  .topic-rows dd { text-align:end; font-weight:750; font-variant-numeric:tabular-nums; }
  .topic-page a { color:inherit; text-underline-offset:.22em; }
  .topic-rows a { display:inline-flex; align-items:center; min-height:44px; }
  @media (max-width:40rem) {
    .topic-heading h1 { font-size:1.85rem; }
    .topic-columns { grid-template-columns:minmax(0,1fr); }
  }
`;
