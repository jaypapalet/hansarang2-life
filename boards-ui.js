const sourceMap = 'https://topis.seoul.go.kr/map/openVmsMap.do';
const definitions = [
  { key: 'yangcheon', label: '양천로', location: '등촌동 633-3', id: 'VMO9000060', count: 4 },
  { key: 'gonghang', label: '공항로', location: '현대정유 앞', id: 'VMA9000180', count: 5 },
  { key: 'deungchon', label: '등촌역 앞', location: '시험 운영', count: 3 },
];
const archiveFrames = [1, 2, 3].map(n => new URL('./vms-archive-' + n + '.png', import.meta.url).href);
const archiveLabel = '2026.11.24 저장 화면';
const maxCaptureAge = 15 * 60 * 1000;

function card(sign) {
  const figure = document.createElement('figure');
  figure.className = 'road-sign sign-' + sign.key;
  figure.innerHTML = '<figcaption><strong></strong><span></span></figcaption>' +
    '<div class="sign-screen"><img hidden><span class="sign-unavailable">조회 중</span></div>' +
    '<div class="sign-foot"><small></small><span class="sign-index"></span></div>';
  figure.querySelector('strong').textContent = sign.label;
  figure.querySelector('figcaption span').textContent = sign.location;
  return figure;
}

function officialFrame(sign, index, bucket) {
  const url = new URL('https://smartway.seoul.go.kr/cctv/VmsImage.do');
  url.searchParams.set('vmsId', sign.id);
  url.searchParams.set('msgDispSeq', index + 1);
  url.searchParams.set('_', bucket);
  return url.href;
}

export function initBoards() {
  const root = document.querySelector('#boards');
  if (!root || root.dataset.boardsReady) return;
  root.dataset.boardsReady = 'true';
  root.innerHTML = '<div class="sign-grid"></div><div class="sign-controls">' +
    '<details><summary>전광판 더보기</summary><p>서울시 TOPIS 지도에서 전광판 이름을 검색해 표출 내용을 확인할 수 있어요.</p>' +
    '<a target="_blank" rel="noopener noreferrer">TOPIS 전광판 지도 열기</a></details>' +
    '<button type="button" class="sign-pause"></button></div>';
  root.querySelector('details a').href = sourceMap;
  let paused = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const toggle = root.querySelector('.sign-pause');
  function setToggle() {
    toggle.dataset.state = paused ? 'paused' : 'playing';
    toggle.setAttribute('aria-label', paused ? '전광판 순환 일시정지 중. 재생하기' : '전광판 순환 재생 중. 일시정지하기');
    toggle.title = toggle.getAttribute('aria-label');
  }
  setToggle();
  toggle.onclick = () => { paused = !paused; setToggle(); };
  const time = new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' });
  let live = null;
  let feedLoading = false;
  let previousBucket = -1;
  const rows = definitions.map(sign => {
    const node = card(sign);
    root.querySelector('.sign-grid').append(node);
    return { sign, node, index: 0, generation: 0, receipts: [] };
  });

  async function compositeTiles(payload) {
    const loadTile = b64 => new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      // TOPIS labels the payload data:image/jpg but the bytes are BMP;
      // browsers draw it the same way TOPIS itself does.
      image.src = 'data:image/bmp;base64,' + b64;
    });
    const [base, ...strips] = await Promise.all(
      [loadTile(payload.image), ...payload.texts.map(loadTile)]);
    return strips.map(strip => {
      const canvas = document.createElement('canvas');
      canvas.width = payload.width || 192;
      canvas.height = payload.height || 272;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(base, 0, 0);
      ctx.drawImage(strip, 0, payload.textTop ?? 248);
      return canvas.toDataURL('image/png');
    });
  }

  async function refreshFeed() {
    if (feedLoading) return;
    feedLoading = true;
    let next = null;
    try {
      for (const path of ['/api/boards/deungchon', './vms-live/latest.json']) {
        try {
          const response = await fetch(path, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
          if (!response.ok) continue;
          const payload = await response.json();
          if (payload.image && Array.isArray(payload.texts) && payload.texts.length === 3) {
            // TOPIS live tiles: freshness is the fetch itself; updateDate is
            // when TOPIS last changed the message, which can be older.
            const frames = await compositeTiles(payload);
            next = { timestamp: Date.now(), timeLabel: '수신', frames };
            break;
          }
          const timestamp = Date.parse(payload.capturedAt);
          const age = Date.now() - timestamp;
          if (!(age >= -60000 && age < maxCaptureAge) || !Array.isArray(payload.frames) || payload.frames.length !== 3) continue;
          const frames = payload.frames.map(name => new URL(name, response.url));
          if (frames.some(url => !['http:', 'https:'].includes(url.protocol))) continue;
          next = { timestamp, timeLabel: '수집', frames: frames.map(url => url.href) };
          break;
        } catch { /* Try the next feed source. */ }
      }
    } finally {
      const changed = next?.timestamp !== live?.timestamp;
      live = next;
      feedLoading = false;
      if (changed) draw(rows[2]);
    }
  }

  function draw(row) {
    const { sign, node, index } = row;
    const portrait = sign.key === 'deungchon';
    const ticket = ++row.generation;
    const bucket = Math.floor(Date.now() / 60000);
    const validFeed = live && Date.now() - live.timestamp < maxCaptureAge ? live : null;
    const label = node.querySelector('small');
    const message = node.querySelector('.sign-unavailable');
    const choices = portrait
      ? [...(validFeed ? [[validFeed.frames[index], time.format(validFeed.timestamp) + ' ' + validFeed.timeLabel]] : []), [archiveFrames[index], archiveLabel]]
      : [[officialFrame(sign, index, bucket)], ['/api/boards/' + sign.key + '/' + (index + 1) + '?t=' + bucket]];
    const load = n => {
      if (ticket !== row.generation) return;
      if (n === choices.length) {
        node.querySelector('img').hidden = true;
        message.hidden = false;
        message.textContent = '화면 수신 지연';
        label.textContent = time.format(Date.now()) + ' 조회 실패';
        node.querySelector('.sign-index').textContent = '';
        return;
      }
      const [url, caption] = choices[n];
      const image = new Image();
      image.referrerPolicy = 'no-referrer';
      image.alt = sign.label + ' 전광판 ' + (index + 1) + '번 화면';
      image.onload = () => {
        if (ticket !== row.generation) return;
        node.querySelector('img').replaceWith(image);
        message.hidden = true;
        if (portrait) {
          label.textContent = caption;
        } else {
          // Replaying a cached frame in this minute must keep its original receipt.
          if (row.receipts[index]?.bucket !== bucket) row.receipts[index] = { bucket, at: Date.now() };
          label.textContent = time.format(row.receipts[index].at) + ' 수신';
        }
        node.querySelector('.sign-index').textContent = (index + 1) + ' / ' + sign.count;
      };
      image.onerror = () => load(n + 1);
      image.src = url;
    };
    load(0);
  }
  function tick(rotate) {
    if (document.hidden) return;
    const bucket = Math.floor(Date.now() / 60000);
    const refresh = bucket !== previousBucket;
    previousBucket = bucket;
    if (refresh) refreshFeed();
    for (const row of rows) {
      if (rotate && !paused) row.index = (row.index + 1) % row.sign.count;
      if (refresh || (rotate && !paused)) draw(row);
    }
  }
  tick(false);
  setInterval(() => tick(true), 5500);
  document.addEventListener('visibilitychange', () => tick(false));
  window.addEventListener('resident:refresh', () => { previousBucket = -1; tick(false); });
}
