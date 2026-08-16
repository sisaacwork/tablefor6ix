const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.osm.ch/api/interpreter',
];

const USER_AGENT = 'tablefor6ix.ca data pipeline (contact: iwork@cvu.org)';
const BACKOFF_MS = [5_000, 15_000, 45_000];

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function overpass(query: string): Promise<any> {
  let lastError: unknown;
  for (const endpoint of ENDPOINTS) {
    for (let attempt = 0; attempt <= BACKOFF_MS.length; attempt++) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': USER_AGENT,
          },
          body: 'data=' + encodeURIComponent(query),
        });
        if (res.status === 429 || res.status === 504 || res.status === 502) {
          throw new RetryableError(`HTTP ${res.status}`, res.headers.get('retry-after'));
        }
        if (!res.ok) throw new Error(`HTTP ${res.status} from ${endpoint}`);
        return await res.json();
      } catch (err) {
        lastError = err;
        if (attempt === BACKOFF_MS.length) break; // rotate endpoint
        const retryAfter =
          err instanceof RetryableError && err.retryAfter
            ? Number(err.retryAfter) * 1000
            : null;
        const wait = retryAfter ?? BACKOFF_MS[attempt]!;
        console.warn(`  ${String(err)} — retrying in ${Math.round(wait / 1000)}s`);
        await sleep(wait);
      }
    }
    console.warn(`  giving up on ${endpoint}, rotating`);
  }
  throw new Error(`All Overpass endpoints failed: ${String(lastError)}`);
}

class RetryableError extends Error {
  constructor(message: string, public retryAfter: string | null) {
    super(message);
  }
}
