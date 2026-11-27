const issuer = 'https://token.actions.githubusercontent.com';
const audience = 'https://hansarang2.jaypapa.kr/api/apartment-notices/kapt-sync';
const repository = 'jaypapalet/hansarang2-life';
const repositoryId = '1469943713';
const branch = 'refs/heads/main';
const workflow = `${repository}/.github/workflows/refresh-kapt-notices.yml@${branch}`;
const algorithm = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
const keyIdPattern = /^[A-Za-z0-9._-]{1,128}$/;
let cachedKeys;

function bytes(segment) {
  return Uint8Array.from(atob(segment.replaceAll('-', '+').replaceAll('_', '/')), character => character.charCodeAt(0));
}

function decode(segment) {
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes(segment)));
}

async function readKeys(fetcher) {
  const response = await fetcher(`${issuer}/.well-known/jwks`, { redirect: 'error', signal: AbortSignal.timeout(4500) });
  if (!response.ok) throw new Error('GitHub signing keys unavailable');
  const { keys } = await response.json();
  if (!Array.isArray(keys)) throw new Error('Invalid GitHub signing keys');
  return keys;
}

async function githubKeys(fetcher, now) {
  if (!cachedKeys || cachedKeys.fetcher !== fetcher || cachedKeys.expiresAt <= now) {
    const entry = { fetcher, expiresAt: now + 5 * 60_000 };
    entry.pending = readKeys(fetcher).catch(error => {
      entry.expiresAt = now + 15_000;
      throw error;
    });
    cachedKeys = entry;
  }
  return cachedKeys.pending;
}

function validClaims(claims, now) {
  const current = Math.floor(now / 1000);
  return claims?.iss === issuer && claims.aud === audience && claims.repository === repository &&
    claims.repository_id === repositoryId && claims.ref === branch && claims.workflow_ref === workflow &&
    ['schedule', 'workflow_dispatch'].includes(claims.event_name) &&
    [claims.iat, claims.nbf, claims.exp].every(Number.isSafeInteger) &&
    claims.iat <= current + 30 && claims.nbf <= current + 30 && claims.exp > current &&
    claims.exp > Math.max(claims.iat, claims.nbf) && claims.exp - claims.iat <= 600;
}

export async function authorizeKaptSync(request, fetcher, now) {
  const bearer = request.headers.get('Authorization') ?? '';
  if (bearer.length > 8192) return false;
  const match = /^Bearer ([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/i.exec(bearer);
  if (!match) return false;
  const [, header, payload, signature] = match;
  let keyId;
  try {
    const details = decode(header);
    if (details?.alg !== 'RS256' || details.crit !== undefined || typeof details.kid !== 'string' ||
      !keyIdPattern.test(details.kid) || !validClaims(decode(payload), now)) return false;
    keyId = details.kid;
  } catch {
    return false;
  }
  const keys = await githubKeys(fetcher, now);
  const jwk = keys.find(key => key?.kid === keyId && key.kty === 'RSA' && (!key.use || key.use === 'sig') &&
    (!key.alg || key.alg === 'RS256') && typeof key.n === 'string' && key.n.length >= 342);
  if (!jwk) return false;
  try {
    const key = await crypto.subtle.importKey('jwk', jwk, algorithm, false, ['verify']);
    return await crypto.subtle.verify(algorithm, key, bytes(signature), new TextEncoder().encode(`${header}.${payload}`));
  } catch {
    return false;
  }
}
