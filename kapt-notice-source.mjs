const apiRoot = 'https://apis.data.go.kr/1613000/';
const kaptCode = 'A15783907';
const apiTimeoutMs = 6500;
const dayMs = 86_400_000;
const seoulOffsetMs = 9 * 60 * 60 * 1000;
const bidPageSize = 100;
const maxBidPages = 5;

const commonFees = 'AptCmnuseManageCostServiceV3';
const usageFees = 'AptIndvdlzManageCostServiceV3';
const feeItems = [
  [commonFees, 'getHsmpCleaningCostInfoV3', '청소비', ['cleanCost']],
  [commonFees, 'getHsmpGuardCostInfoV3', '경비비', ['guardCost']],
  [commonFees, 'getHsmpElevatorMntncCostInfoV3', '승강기 유지비', ['elevCost']],
  [usageFees, 'getHsmpElectricityCostInfoV2', '전기료', ['electC', 'electP']],
  [usageFees, 'getHsmpWaterCostInfoV2', '수도료', ['waterCoolC', 'waterCoolP']],
];

const bidSources = {
  bids: ['ApHusBidPblAncInfoOfferServiceV3', '입찰공고', 'https://www.k-apt.go.kr/bid/bidList.do'],
  results: ['ApHusBidResultNoticeInfoOfferServiceV3', '입찰결과', 'https://www.k-apt.go.kr/bid/bidList.do?type=3'],
};

export function kaptSeoulDay(time) {
  return new Date(time + seoulOffsetMs).toISOString().slice(0, 10);
}

export class KaptSourceError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

async function readKapt(fetcher, key, service, operation, params) {
  const url = new URL(`${service}/${operation}`, apiRoot);
  for (const [name, value] of Object.entries({ serviceKey: key, kaptCode, ...params })) url.searchParams.set(name, value);
  const response = await fetcher(url, {
    headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(apiTimeoutMs),
  });
  if ([401, 403].includes(response.status)) throw new KaptSourceError('api_access_denied');
  if (!response.ok) throw new KaptSourceError('upstream_unavailable');
  const payload = await response.json();
  const document = payload?.response ?? payload;
  const code = String(document?.header?.resultCode ?? payload?.OpenAPI_ServiceResponse?.cmmMsgHeader?.returnReasonCode ?? '');
  if (code === '03' || code === '3') return null;
  if (['20', '30', '31', '32'].includes(code)) throw new KaptSourceError('api_access_denied');
  if (code !== '00' && code !== '0') throw new KaptSourceError('upstream_unavailable');
  if (!document.body || typeof document.body !== 'object') throw new KaptSourceError('incomplete_data');
  return document.body;
}

function money(value) {
  const raw = typeof value === 'number' || typeof value === 'string' ? String(value).trim() : '';
  const amount = /^-?(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(raw) ? Number(raw.replaceAll(',', '')) : NaN;
  return Number.isSafeInteger(amount) ? amount : null;
}

function won(amount) {
  return `${amount.toLocaleString('ko-KR')}원`;
}

async function loadFee(fetcher, key, period, [service, operation, label, columns]) {
  const body = await readKapt(fetcher, key, service, operation, { searchDate: period });
  const item = body?.item;
  if (item == null || item === '') return null;
  if (item.kaptCode !== kaptCode || (item.searchDate != null && String(item.searchDate) !== period)) {
    throw new KaptSourceError('incomplete_data');
  }
  const amounts = columns.map(column => money(item[column]));
  const total = amounts.reduce((sum, amount) => sum + (amount ?? 0), 0);
  if (amounts.includes(null) || !Number.isSafeInteger(total)) throw new KaptSourceError('incomplete_data');
  return `${label} ${won(total)}`;
}

export async function loadKaptFees(fetcher, key, day, publishedPeriods) {
  const [year, month] = day.split('-').map(Number);
  for (let offset = 1; offset <= 3; offset++) {
    const period = new Date(Date.UTC(year, month - 1 - offset, 1)).toISOString().slice(0, 7).replace('-', '');
    const sourceKey = `fees:${period}`;
    if (publishedPeriods.has(sourceKey)) return [];
    const amounts = await Promise.all(feeItems.map(item => loadFee(fetcher, key, period, item)));
    if (amounts.every(amount => amount === null)) continue;
    if (amounts.includes(null)) throw new KaptSourceError('incomplete_data');
    return [{
      sourceKey,
      title: `${period.slice(0, 4)}년 ${Number(period.slice(4))}월 관리비 공개 내역`,
      body: ['한사랑2차삼성아파트 단지 전체 금액입니다. 전기료와 수도료는 공용과 전용 금액을 합산했습니다.', ...amounts].join('\n'),
      sourceUrl: 'https://www.k-apt.go.kr/apiinfo/mnbyManagectList.do',
    }];
  }
  return [];
}

function bidDate(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-?(\d{2})-?(\d{2})(?=$|[T\s]|\d{2})/.exec(value.trim());
  if (!match) return null;
  const day = match.slice(1).join('-');
  const time = Date.parse(day);
  return Number.isFinite(time) && new Date(time).toISOString().startsWith(day) ? day : null;
}

export async function loadKaptBids(fetcher, key, source, day) {
  const [service, label, sourceUrl] = bidSources[source];
  const firstDay = new Date(Date.parse(day) - 29 * dayMs).toISOString().slice(0, 10);
  const notices = new Map();
  let total = 0;
  let read = 0;
  for (let pageNo = 1; pageNo <= maxBidPages; pageNo++) {
    const body = await readKapt(fetcher, key, service, 'getHsmpCdSearchV3', { pageNo, numOfRows: bidPageSize });
    if (pageNo === 1 && !body) return [];
    const count = body?.totalCount == null || body.totalCount === '' ? NaN : Number(body.totalCount);
    if (pageNo === 1) total = count;
    if (!Number.isSafeInteger(total) || total !== count || total < 0 || total > maxBidPages * bidPageSize) {
      throw new KaptSourceError('incomplete_data');
    }
    const rows = body.items ?? [];
    if (!Array.isArray(rows) || (!rows.length && total > read)) throw new KaptSourceError('incomplete_data');
    for (const row of rows) {
      if (row?.aptCode !== kaptCode) continue;
      const registered = bidDate(row.bidRegDate ?? row.bidRegdate);
      const deadline = bidDate(row.bidDeadline);
      const date = source === 'results' && deadline && deadline <= day && (!registered || deadline > registered) ? deadline : registered;
      if (!date) throw new KaptSourceError('incomplete_data');
      if (date < firstDay || date > day) continue;
      const id = String(row.bidNum ?? '').trim();
      const title = typeof row.bidTitle === 'string' ? row.bidTitle.replace(/\s+/g, ' ').trim() : '';
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(id) || !title) throw new KaptSourceError('incomplete_data');
      const amount = source === 'results' ? money(row.amount) : null;
      const body = [
        `입찰번호 ${id}`,
        registered && `공고일 ${registered}`,
        deadline && `입찰 마감일 ${deadline}`,
        amount !== null && `낙찰금액 ${won(amount)}`,
      ].filter(Boolean).join('\n');
      const sourceKey = `${source}:${id}`;
      notices.set(sourceKey, { sourceKey, title: `${label} · ${title}`.slice(0, 120), body, sourceUrl, date });
    }
    read += rows.length;
    if (read === total) return [...notices.values()].sort((a, b) => a.date.localeCompare(b.date));
    if (read > total) break;
  }
  throw new KaptSourceError('incomplete_data');
}
