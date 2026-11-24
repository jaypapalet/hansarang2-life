const officialMap = 'https://topis.seoul.go.kr/map/openVmsMap.do';
const signs = {
  yangcheon: { id: 'VMO9000060', count: 4 },
  gonghang: { id: 'VMA9000180', count: 5 },
};

function failure(status) {
  return new Response(null, { status, headers: { 'Cache-Control': 'no-store' } });
}

// The feed is an operator-configured static directory populated by vms-capture.py.
// Visitors can request only the two known signs and their documented frame numbers.
export async function boards(request, env = {}) {
  const path = new URL(request.url).pathname;
  if (request.method !== 'GET') return failure(405);
  if (path === '/api/boards/deungchon') {
    // Primary: TOPIS live tiles for VMS 1028 "등촌역 앞 (신규 VMS Test 중)".
    // TOPIS renders this new-type sign as canvas tiles, not smartway images:
    // selectVmsImgList.do returns one 192x248 IMAGE tile plus three 192x24
    // TEXT strips (one per rotating frame) with updateDate. The Worker proxies
    // them server-side because TOPIS sends no Access-Control-Allow-Origin,
    // so a browser cannot fetch them directly from a static page.
    try {
      const topisHeaders = { Accept: 'application/json', Referer: officialMap };
      const [listRes] = await Promise.all([
        fetch('https://topis.seoul.go.kr/map/selectVmsImgList.do?sVmsId=1028', {
          headers: topisHeaders, signal: AbortSignal.timeout(8000),
        }),
      ]);
      if (!listRes.ok) throw new Error('topis');
      const listData = await listRes.json();
      const rows = Array.isArray(listData.rows) ? listData.rows : [];
      const image = rows.find(r => r.areaType === 'IMAGE');
      const texts = rows.filter(r => r.areaType === 'TEXT')
        .sort((a, b) => a.areaFormSeq - b.areaFormSeq);
      const updatedAt = rows[0]?.updateDate;
      const stamp = updatedAt ? Date.parse(updatedAt.replace(' ', 'T') + '+09:00') : NaN;
      if (!image?.bmpData || texts.length !== 3 || !texts.every(t => t.bmpData) || !Number.isFinite(stamp)) {
        throw new Error('topis format');
      }
      return Response.json({
        capturedAt: new Date(stamp).toISOString(),
        image: image.bmpData,
        texts: texts.map(t => t.bmpData),
        width: image.areaWidth || 192,
        height: (image.areaHeight || 248) + (texts[0].areaHeight || 24),
        textTop: texts[0].areaTop ?? 248,
      }, { headers: { 'Cache-Control': 'public, max-age=30' } });
    } catch {
      // Fall through to the operator-configured Playwright feed, if any.
    }
    if (!env.DEUNGCHON_VMS_FEED) return failure(502);
    try {
      const feed = new URL(env.DEUNGCHON_VMS_FEED);
      if (feed.protocol !== 'https:') return failure(503);
      const upstream = await fetch(feed, { signal: AbortSignal.timeout(8000), redirect: 'error' });
      if (!upstream.ok) return failure(502);
      const data = await upstream.json();
      if (!Array.isArray(data.frames) || data.frames.length !== 3 ||
          !Number.isFinite(Date.parse(data.capturedAt)) ||
          !data.frames.every(name => /^vms-\d{10,16}-[123]\.png$/.test(name))) return failure(502);
      return Response.json({
        capturedAt: data.capturedAt,
        frames: data.frames.map(name => new URL(name, feed).href),
      }, { headers: { 'Cache-Control': 'public, max-age=30' } });
    } catch {
      return failure(502);
    }
  }
  const match = path.match(/^\/api\/boards\/(yangcheon|gonghang)\/([1-5])$/);
  if (!match || Number(match[2]) > signs[match[1]].count) return failure(404);
  const url = new URL('https://smartway.seoul.go.kr/cctv/VmsImage.do');
  url.searchParams.set('vmsId', signs[match[1]].id);
  url.searchParams.set('msgDispSeq', match[2]);
  try {
    const upstream = await fetch(url, {
      headers: { Accept: 'image/*', Referer: officialMap },
      signal: AbortSignal.timeout(7000),
    });
    const type = upstream.headers.get('content-type') || '';
    if (!upstream.ok) return failure(502);
    const bytes = new Uint8Array(await upstream.arrayBuffer());
    // Some TOPIS responses carry only application/octet-stream.
    const mime = bytes[0] === 0x89 && bytes[1] === 0x50 ? 'image/png'
      : bytes[0] === 0x42 && bytes[1] === 0x4d ? 'image/bmp'
      : bytes[0] === 0xff && bytes[1] === 0xd8 ? 'image/jpeg'
      : bytes[0] === 0x47 && bytes[1] === 0x49 ? 'image/gif'
      : /^image\/(png|bmp|gif|jpeg|webp)(;|$)/i.test(type) ? type : null;
    if (!mime || bytes.length < 8) return failure(502);
    return new Response(bytes, { headers: {
      'Content-Type': mime, 'Cache-Control': 'public, max-age=60', 'X-Content-Type-Options': 'nosniff',
    } });
  } catch {
    return failure(502);
  }
}
