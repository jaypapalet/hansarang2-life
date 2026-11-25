const officialMap = 'https://topis.seoul.go.kr/map/openVmsMap.do';
const signs = {
  yangcheon: {id: 'VMO9000060', count: 4},
  gonghang: {id: 'VMA9000180', count: 5},
};

function boardError(status, upstream = '') {
  return new Response(null, {status, headers: {
    'Cache-Control': 'no-store', ...(upstream ? {'X-VMS-Upstream': upstream} : {}),
  }});
}

function failureType(error) {
  const message = String(error?.message ?? '');
  const status = message.match(/^(?:TOPIS |Relay )?HTTP (\d{3})$/)?.[1];
  if (status) return status;
  if (error?.name === 'TimeoutError' || /timeout|timed out/i.test(message)) return 'timeout';
  if (/denied|blocked|allowlist|not allowed/i.test(message)) return 'blocked';
  if (/Invalid TOPIS display|Invalid time value|Unexpected token/i.test(message)) return 'format';
  return 'unavailable';
}

function topisRequest(url, accept) {
  return fetch(url, {
    headers: {Accept: accept, Referer: officialMap},
    signal: AbortSignal.timeout(8000),
    redirect: 'follow',
  });
}

function isTile(value) {
  return typeof value === 'string' && value.length <= 1_000_000 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function portraitResponse({capturedAt, image, texts, width, height, textTop}) {
  if (!isTile(image) || !Array.isArray(texts) || texts.length !== 3 || !texts.every(isTile)
      || !Number.isFinite(Date.parse(capturedAt)) || !Number.isInteger(width) || width < 1 || width > 1024
      || !Number.isInteger(textTop) || !Number.isInteger(height) || textTop < 1 || height <= textTop || height > 1024) {
    throw new Error('Invalid TOPIS display');
  }
  return Response.json({capturedAt, image, texts, width, height, textTop}, {headers: {'Cache-Control': 'public, max-age=30'}});
}

async function officialPortrait() {
  const response = await topisRequest('https://topis.seoul.go.kr/map/selectVmsImgList.do?sVmsId=1028', 'application/json');
  if (!response.ok) throw new Error(`TOPIS HTTP ${response.status}`);
  const payload = await response.json();
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  const image = rows.find(row => row.areaType === 'IMAGE');
  const texts = rows.filter(row => row.areaType === 'TEXT').sort((a, b) => a.areaFormSeq - b.areaFormSeq);
  const stamp = Date.parse(String(rows[0]?.updateDate ?? '').replace(' ', 'T') + '+09:00');
  return portraitResponse({capturedAt: new Date(stamp).toISOString(), image: image?.bmpData,
    texts: texts.map(tile => tile.bmpData), width: Number(image?.areaWidth || 192),
    textTop: Number(texts[0]?.areaTop ?? 248), height: Number(image?.areaHeight || 248) + Number(texts[0]?.areaHeight || 24)});
}

async function portraitBoard(relayUrl) {
  try {
    return await officialPortrait();
  } catch (error) {
    if (!relayUrl) return boardError(502, 'topis=' + failureType(error));
    try {
      const url = new URL(relayUrl);
      if (url.protocol !== 'https:') return boardError(502);
      const relay = await fetch(url, {
        headers: {Accept: 'application/json'}, signal: AbortSignal.timeout(9000), redirect: 'error',
      });
      if (!relay.ok) throw new Error(`Relay HTTP ${relay.status}`);
      return portraitResponse(await relay.json());
    } catch (relayError) {
      return boardError(502, `topis=${failureType(error)}; relay=${failureType(relayError)}`);
    }
  }
}

async function landscapeBoard(sign, frame) {
  const url = new URL('https://smartway.seoul.go.kr/cctv/VmsImage.do');
  url.searchParams.set('vmsId', sign.id);
  url.searchParams.set('msgDispSeq', frame);
  const upstream = await topisRequest(url.href, 'image/*');
  if (!upstream.ok) return boardError(502);
  const bytes = new Uint8Array(await upstream.arrayBuffer());
  if (bytes.length < 8 || bytes.length > 1_000_000) return boardError(502);
  const mime = bytes[0] === 0x89 && bytes[1] === 0x50 ? 'image/png'
    : bytes[0] === 0x42 && bytes[1] === 0x4d ? 'image/bmp'
      : bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg'
        : bytes[0] === 0x47 && bytes[1] === 0x49 ? 'image/gif' : null;
  if (!mime) return boardError(502);
  return new Response(bytes, {headers: {
    'Content-Type': mime, 'Cache-Control': 'public, max-age=45', 'X-Content-Type-Options': 'nosniff',
  }});
}

export async function boards(request, env) {
  if (request.method !== 'GET') return boardError(405);
  const path = new URL(request.url).pathname;
  try {
    if (path === '/api/boards/deungchon') return await portraitBoard(env?.DEUNGCHON_VMS_RELAY_URL?.trim());
    const match = path.match(/^\/api\/boards\/(yangcheon|gonghang)\/([1-5])$/);
    if (!match || Number(match[2]) > signs[match[1]].count) return boardError(404);
    return await landscapeBoard(signs[match[1]], match[2]);
  } catch {
    return boardError(502);
  }
}
