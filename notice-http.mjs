export const noticeHeaders = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };

export function noticeJson(data, status = 200, extraHeaders = {}) {
  return Response.json(data, { status, headers: { ...noticeHeaders, ...extraHeaders } });
}

export function noticeFailure(error, status) {
  return noticeJson({ error }, status);
}

export function noticeUnsupported(methods) {
  return new Response(null, { status: 405, headers: { ...noticeHeaders, Allow: methods } });
}

export function noticeOriginMatches(request) {
  return request.headers.get('Origin') === new URL(request.url).origin;
}

export async function readNoticeBytes(request, limit) {
  if (Number(request.headers.get('Content-Length')) > limit) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) return new Blob(chunks);
      size += value.byteLength;
      if (size > limit) return null;
      chunks.push(value);
    }
  } catch {
    return null;
  } finally {
    void reader.cancel().catch(() => {});
  }
}

export async function readNoticeJson(request, limit = 48 * 1024) {
  if (request.headers.get('Content-Type')?.split(';', 1)[0].trim().toLowerCase() !== 'application/json') return null;
  const blob = await readNoticeBytes(request, limit);
  if (!blob) return null;
  try {
    return JSON.parse(await blob.text());
  } catch {
    return null;
  }
}
