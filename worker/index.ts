/**
 * Static-asset Worker with one API route: POST /api/submit files a restaurant
 * suggestion as a GitHub issue, so site visitors don't need a GitHub account.
 *
 * Requires a GITHUB_TOKEN secret (fine-grained PAT, Issues read/write on the
 * repo only):  npx wrangler secret put GITHUB_TOKEN
 * Without it the endpoint returns 503 and the site falls back to the GitHub
 * issue form link.
 */

export interface Env {
  ASSETS: Fetcher;
  GITHUB_TOKEN?: string;
}

const REPO = 'sisaacwork/tablefor6ix';
const MAX = { name: 120, country: 120, address: 200, website: 200, notes: 1000 };

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/submit') {
      if (request.method !== 'POST') return json({ error: 'POST only' }, 405);
      return handleSubmit(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function handleSubmit(request: Request, env: Env): Promise<Response> {
  if (!env.GITHUB_TOKEN) return json({ error: 'submissions not configured' }, 503);

  let data: Record<string, unknown>;
  try {
    data = await request.json();
  } catch {
    return json({ error: 'invalid JSON' }, 400);
  }

  // Honeypot: real users never fill the hidden "company" field.
  if (typeof data['company'] === 'string' && data['company'].trim() !== '') {
    return json({ ok: true });
  }

  const field = (key: keyof typeof MAX): string => {
    const value = data[key];
    return typeof value === 'string' ? value.trim().slice(0, MAX[key]) : '';
  };
  const name = field('name');
  const country = field('country');
  const address = field('address');
  const website = field('website');
  const notes = field('notes');
  if (!name || !country || !address) {
    return json({ error: 'name, country, and address are required' }, 400);
  }

  const body = [
    `**Restaurant:** ${name}`,
    `**Country of cuisine:** ${country}`,
    `**Address:** ${address}`,
    website && `**Website:** ${website}`,
    notes && `**Notes:**\n${notes}`,
    '',
    '_Submitted via the site form._',
  ]
    .filter(Boolean)
    .join('\n');

  const res = await fetch(`https://api.github.com/repos/${REPO}/issues`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'tablefor6ix-submissions',
    },
    body: JSON.stringify({
      title: `Add: [${country}] ${name}`,
      body,
      labels: ['restaurant-submission', 'via-site'],
    }),
  });

  if (!res.ok) {
    console.error('GitHub issue creation failed', res.status, await res.text());
    return json({ error: 'could not file the suggestion' }, 502);
  }
  const issue = (await res.json()) as { html_url: string };
  return json({ ok: true, issueUrl: issue.html_url });
}
