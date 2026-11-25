import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';

const placesPath = new URL('../src/road-places.json', import.meta.url);
const output = new URL('../src/road-times.json', import.meta.url);
const { origin, destinations } = JSON.parse(await readFile(placesPath, 'utf8'));
const points = [origin, ...destinations].map(({ lon, lat }) => `${lon},${lat}`).join(';');
const url = new URL(`https://routing.openstreetmap.de/routed-car/table/v1/driving/${points}`);
url.searchParams.set('sources', '0');
url.searchParams.set('destinations', destinations.map((_, index) => index + 1).join(';'));
url.searchParams.set('annotations', 'duration,distance');

const response = await fetch(url, {
  headers: { 'User-Agent': 'Hansarang2Life/1.0 (https://github.com/jaypapalet/hansarang2-life)' },
  signal: AbortSignal.timeout(15000),
});
if (!response.ok) throw new Error(`OSRM responded with HTTP ${response.status}`);

const result = await response.json();
const durations = result.durations?.[0];
const distances = result.distances?.[0];
const complete = row => Array.isArray(row) && row.length === destinations.length
  && row.every(value => Number.isFinite(value) && value > 0);
if (result.code !== 'Ok' || !complete(durations) || !complete(distances)) {
  throw new Error('OSRM did not return a route to every destination.');
}

const snapshot = {
  calculatedAt: new Date().toISOString(),
  estimates: destinations.map(({ id }, index) => ({
    id,
    seconds: durations[index],
    meters: distances[index],
  })),
};

const temp = new URL(`road-times-${randomUUID()}.tmp`, output);
try {
  await writeFile(temp, JSON.stringify(snapshot, null, 2) + '\n');
  await rename(temp, output);
} finally {
  await rm(temp, { force: true });
}
console.log(`Updated ${destinations.length} driving estimates from OSRM.`);
