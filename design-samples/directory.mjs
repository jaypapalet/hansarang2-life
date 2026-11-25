import { facts } from './facts.mjs';

export function createDirectory() {
  const escape = (value) => String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);

  return {
    id: 'directory',
    title: '생활정보 색인',
    description: '검색 결과에서 필요한 항목의 상세 화면을 엽니다.',
    html: `
      <div class="directory-page">
        <header class="directory-masthead">
          <p class="directory-community">${escape(facts.community)}</p>
          <p class="directory-location">${escape(facts.locality)}</p>
        </header>

        <main>
          <section class="directory-search-region" aria-labelledby="directory-title">
            <div class="directory-intro">
              <h1 id="directory-title">생활정보<br>색인</h1>
            </div>
            <div class="directory-search-area" role="search" aria-label="생활정보">
              <label for="directory-search">생활정보 검색</label>
              <div class="directory-search-field">
                <svg class="directory-search-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.8"/><path d="m15.5 15.5 5.1 5.1"/></svg>
                <input id="directory-search" type="search" placeholder="버스, 비, 전기차" autocomplete="off" spellcheck="false" aria-describedby="directory-search-help" aria-controls="directory-results">
                <button class="directory-clear" type="button" hidden>지우기</button>
              </div>
              <p id="directory-search-help">정보 이름, 장소, 노선 번호로 검색하세요.</p>
            </div>
          </section>

          <section class="directory-index" aria-labelledby="directory-index-title">
            <div class="directory-index-header">
              <h2 id="directory-index-title">전체 정보</h2>
              <p class="directory-result-status" role="status" aria-live="polite" aria-atomic="true">6개 정보</p>
            </div>
            <div class="directory-reference"><span class="directory-sample">예시 데이터</span><span>${escape(facts.date)} · ${escape(facts.time)} 기준</span></div>

            <div id="directory-results" class="directory-results">
              <article class="directory-entry" data-category="weather" data-search="날씨 기상 온도 기온 구름 조금 최고 최저 강수 확률 비 우산 외출 등촌1동 12 14 4 10">
                <h3><a href="#directory/weather">날씨</a></h3>
                <p class="directory-entry-hint">등촌1동 기온과 강수 확률</p>
              </article>

              <article class="directory-entry" data-category="rail" data-search="지하철 전철 열차 9호선 9 구호선 증미역 중앙보훈병원 개화 출근 퇴근 교통 도착 3 6">
                <h3><a href="#directory/rail">지하철</a></h3>
                <p class="directory-entry-hint">증미역 9호선 도착 시간</p>
              </article>

              <article class="directory-entry" data-category="bus" data-search="버스 정류장 6715 6632 아파트 후문 맞은편 출근 퇴근 교통 도착 2 7">
                <h3><a href="#directory/bus">버스</a></h3>
                <p class="directory-entry-hint">아파트 후문 정류장과 맞은편</p>
              </article>

              <article class="directory-entry" data-category="roads" data-search="도로 전광판 도로전광판 vms 교통 상황 운전 자동차 출근 퇴근 막힘 혼잡 정체 등촌역 양천로 공항로 원활 보통">
                <h3><a href="#directory/roads">도로·전광판</a></h3>
                <p class="directory-entry-hint">등촌역 앞, 양천로, 공항로</p>
              </article>

              <article class="directory-entry" data-category="charging" data-search="전기차 충전 충전소 충전기 ev 파워큐브 차지비 204동 앞 지상 지하 1층 사용 가능 6 10 2 4">
                <h3><a href="#directory/charging">전기차 충전</a></h3>
                <p class="directory-entry-hint">파워큐브와 차지비 충전소</p>
              </article>

              <article class="directory-entry" data-category="office" data-search="관리사무소 사무실 관리실 전화 전화번호 문의 연락 연락처 운영 업무 시간 월 화 수 목 금 평일 09 00 18 00 02 3663 1192 0236631192">
                <h3><a href="#directory/office">관리사무소</a></h3>
                <p class="directory-entry-hint">전화번호와 업무시간</p>
              </article>
            </div>

            <div class="directory-no-results" hidden>
              <h3>검색 결과가 없습니다.</h3>
              <p>버스, 증미역, 충전소처럼 이름이나 장소로 찾아보세요.</p>
              <button type="button" class="directory-reset">전체 정보 보기</button>
            </div>
          </section>
        </main>
        <footer class="directory-footer"><p>한사랑2차 주민 생활정보</p><a href="#directory-search">다른 정보 찾기</a></footer>
      </div>`,
    css: `
      .directory {
        --directory-ink: #382688;
        --directory-secondary: #685a85;
        --directory-accent: #4930b9;
        --directory-line: #d8d1e9;
        --directory-paper: #fcfbff;
        --directory-wash: #f0ebfc;
        color: var(--directory-ink);
        background: var(--directory-paper);
        font-family: 'Resident Sans Preview', 'Pretendard Variable', 'Apple SD Gothic Neo', sans-serif;
        line-height: 1.5;
        font-size: 16px;
        font-variant-numeric: tabular-nums;
        color-scheme: light;
        accent-color: var(--directory-accent);
        scrollbar-color: #a79ac9 var(--directory-paper);
      }
      .directory *, .directory *::before, .directory *::after { box-sizing: border-box; }
      .directory [hidden] { display: none !important; }
      .directory ::selection { color: #fff; background: var(--directory-accent); }
      .directory p, .directory dl, .directory dd { margin: 0; }
      .directory a { color: inherit; text-decoration-thickness: 1px; text-underline-offset: 5px; }
      .directory button, .directory input { font: inherit; }
      .directory button { cursor: pointer; }
      .directory a:focus-visible, .directory button:focus-visible, .directory input:focus-visible { outline: 3px solid var(--directory-accent); outline-offset: 5px; }
      .directory .directory-page { max-width: 1280px; margin: 0 auto; padding: 0 56px; }
      .directory .directory-masthead { display: flex; justify-content: space-between; gap: 20px; padding: 27px 0 22px; border-bottom: 1px solid var(--directory-ink); font-size: 14px; }
      .directory .directory-community { font-weight: 740; }
      .directory .directory-location { color: var(--directory-secondary); }
      .directory .directory-search-region { display: grid; grid-template-columns: .9fr 1.1fr; align-items: end; gap: 64px; padding: 43px 0 38px; }
      .directory .directory-intro { display: flex; gap: 25px; align-items: flex-end; }
      .directory .directory-intro h1 { font-size: clamp(40px, 4.8vw, 62px); font-weight: 790; letter-spacing: -.035em; line-height: 1.12; flex-shrink: 0; }
      .directory .directory-search-area { padding-bottom: 3px; min-width: 0; }
      .directory .directory-search-area > label { display: block; font-size: 14px; font-weight: 720; margin-bottom: 11px; }
      .directory .directory-search-field { display: flex; align-items: center; min-height: 64px; border-bottom: 3px solid var(--directory-accent); gap: 12px; }
      .directory .directory-search-field:focus-within { background: var(--directory-wash); }
      .directory .directory-search-icon { flex: 0 0 27px; width: 27px; height: 27px; stroke: currentColor; stroke-width: 1.8; }
      .directory #directory-search { width: 100%; min-width: 0; padding: 12px 0; color: var(--directory-ink); background: transparent; border: 0; border-radius: 0; font-size: clamp(20px, 2.1vw, 29px); font-weight: 550; letter-spacing: -.025em; caret-color: var(--directory-accent); }
      .directory #directory-search::placeholder { color: var(--directory-secondary); opacity: 1; }
      .directory #directory-search:focus-visible { outline-offset: 1px; }
      .directory .directory-clear { border: 0; background: transparent; color: var(--directory-accent); padding: 10px 7px; min-height: 44px; font-size: 14px; text-decoration: underline; text-underline-offset: 4px; flex-shrink: 0; }
      .directory #directory-search-help { color: var(--directory-secondary); font-size: 13px; margin-top: 11px; }
      .directory .directory-index { padding-top: 35px; }
      .directory .directory-index-header { display: flex; justify-content: space-between; gap: 20px; align-items: baseline; }
      .directory .directory-index-header h2 { font-size: 22px; font-weight: 740; letter-spacing: -.025em; }
      .directory .directory-result-status { font-size: 14px; color: var(--directory-secondary); text-align: right; overflow-wrap: anywhere; }
      .directory .directory-reference { display: flex; align-items: baseline; gap: 10px; margin: 10px 0 17px; font-size: .875rem; color: var(--directory-secondary); }
      .directory .directory-sample { font-weight: 700; color: var(--directory-accent); }
      .directory .directory-results { border-top: 2px solid var(--directory-ink); }
      .directory .directory-entry { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 20px; padding: 22px 0; border-bottom: 1px solid var(--directory-line); scroll-margin-top: 25px; }
      .directory .directory-entry > h3 { font-size: 19px; font-weight: 740; line-height: 1.5; letter-spacing: -.02em; padding-top: 2px; }
      .directory .directory-entry > h3 a { display:inline-flex; align-items:center; min-height:44px; }
      .directory .directory-entry-hint { align-self:center; color:var(--directory-secondary); font-size:.9375rem; }
      .directory .directory-no-results { padding: 56px 0 62px 200px; border-top: 2px solid var(--directory-ink); border-bottom: 1px solid var(--directory-line); }
      .directory .directory-no-results h3 { font-size: 21px; font-weight: 700; }
      .directory .directory-no-results p { margin-top: 12px; font-size: 14px; color: var(--directory-secondary); }
      .directory .directory-reset { display: inline-flex; align-items: center; min-height: 44px; border: 0; border-bottom: 1px solid currentColor; margin-top: 20px; padding: 4px 0; color: var(--directory-accent); background: transparent; font-weight: 650; font-size: 14px; }
      .directory .directory-footer { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 23px 0 30px; font-size: .875rem; color: var(--directory-secondary); }
      .directory .directory-footer a { display: inline-flex; align-items: center; gap: 7px; min-height: 32px; }
      @media (max-width: 1000px) {
        .directory .directory-page { padding: 0 36px; }
        .directory .directory-search-region { grid-template-columns: .85fr 1.15fr; gap: 35px; }
        .directory .directory-intro { display: block; }
        .directory .directory-entry { grid-template-columns: 145px minmax(0, 1fr); }
        .directory .directory-no-results { padding-left: 165px; }
      }
      @media (max-width: 650px) {
        .directory .directory-page { padding: 0 20px; }
        .directory .directory-masthead { display: block; padding: 20px 0 17px; }
        .directory .directory-community { font-size: 14px; }
        .directory .directory-location { font-size: .875rem; margin-top: 4px; }
        .directory .directory-search-region { display: block; padding: 28px 0 24px; }
        .directory .directory-intro { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; }
        .directory .directory-intro h1 { font-size: 42px; }
        .directory .directory-search-area { margin-top: 30px; }
        .directory .directory-search-area > label { font-size: 13px; margin-bottom: 4px; }
        .directory .directory-search-field { min-height: 60px; gap: 9px; }
        .directory .directory-search-icon { width: 22px; height: 22px; flex-basis: 22px; }
        .directory #directory-search { font-size: 20px; }
        .directory #directory-search-help { font-size: .875rem; }
        .directory .directory-index { padding-top: 25px; }
        .directory .directory-index-header h2 { font-size: 20px; }
        .directory .directory-result-status { font-size: .875rem; }
        .directory .directory-reference { flex-wrap: wrap; gap: 4px 9px; font-size: .875rem; margin-bottom: 13px; }
        .directory .directory-entry { grid-template-columns: 1fr; gap: 0; padding: 7px 0 12px; }
        .directory .directory-entry > h3 { font-size: 18px; padding: 0; }
        .directory .directory-no-results { padding: 32px 0 40px; }
        .directory .directory-no-results h3 { font-size: 19px; }
        .directory .directory-no-results p { line-height: 1.7; }
        .directory .directory-footer { font-size: .875rem; padding: 17px 0 23px; }
      }
    `,
    enhance: function (root) {
      const input = root.querySelector('#directory-search');
      const clear = root.querySelector('.directory-clear');
      const reset = root.querySelector('.directory-reset');
      const entries = Array.from(root.querySelectorAll('.directory-entry'));
      const results = root.querySelector('#directory-results');
      const heading = root.querySelector('#directory-index-title');
      const status = root.querySelector('.directory-result-status');
      const empty = root.querySelector('.directory-no-results');
      if (!input || !clear || !reset || !results || !heading || !status || !empty) return;

      const compact = function (value) {
        return value.toLocaleLowerCase('ko-KR').replace(/[\s·,./():°%–\-]+/g, '');
      };
      const aliases = {
        '비': ['weather'],
        '우산': ['weather'],
        '날씨': ['weather'],
        '출근': ['rail', 'bus', 'roads'],
        '퇴근': ['rail', 'bus', 'roads'],
        '대중교통': ['rail', 'bus'],
        '충전': ['charging'],
        '충전소': ['charging'],
        '연락처': ['office'],
        '전화': ['office'],
      };
      const searchable = entries.map(function (entry) {
        return { entry: entry, text: compact(entry.dataset.search + ' ' + entry.textContent) };
      });
      function update() {
        const query = input.value.trim();
        const tokens = query.toLocaleLowerCase('ko-KR').split(/\s+/).filter(Boolean);
        let count = 0;
        searchable.forEach(function (item) {
          const match = tokens.every(function (token) {
            const key = compact(token);
            return Object.hasOwn(aliases, key)
              ? aliases[key].includes(item.entry.dataset.category)
              : item.text.includes(key);
          });
          item.entry.hidden = !match;
          if (match) count += 1;
        });
        clear.hidden = query.length === 0;
        results.hidden = count === 0;
        empty.hidden = count !== 0;
        heading.textContent = query ? '검색 결과' : '전체 정보';
        status.textContent = query ? count + '개 정보 · 전체 ' + entries.length + '개' : entries.length + '개 정보';
      }
      function resetSearch() {
        input.value = '';
        update();
        input.focus();
      }
      input.addEventListener('input', update);
      input.addEventListener('search', update);
      input.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && input.value) {
          event.preventDefault();
          resetSearch();
        }
      });
      clear.addEventListener('click', resetSearch);
      reset.addEventListener('click', resetSearch);
      update();
    },
  };
}
